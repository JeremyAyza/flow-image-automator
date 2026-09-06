import {
  queue, activeTabId,
  broadcastQueue, broadcastMessage,
  markInProgress, markStatus, markRateLimitedToRetry,
  markInProgressAsRateLimited, markTimedOutAsPending,
} from '../queue/queue.service';
import {
  MAX_CONCURRENT, INJECT_DELAY_MS, RATE_LIMIT_COOLDOWN_MS,
  SCRIPT_BOUNDARY_DELAY_SEC, IMAGES_PER_SCENE,
} from '../queue/queue.types';

// ── Estado local del motor ────────────────────────────────────────────────────

let isInjecting = false;
let pollingInterval: ReturnType<typeof setInterval> | null = null;
let rateLimitCooldownUntil = 0;
let lastProcessedSessionFolder: string | null = null;
let countdownTimer: ReturnType<typeof setInterval> | null = null;
let isInitialized = false;

export const downloadedTileIds = new Set<string>();
export const mediaIdToScene = new Map<string, {
  sceneNumber: number;
  imageIndex: number;
  sessionFolder: string;
  fifeUrl?: string;
  tileId?: string;
}>();
export const knownRateLimitTileIds = new Set<string>();

// ── Inicialización ────────────────────────────────────────────────────────────

export async function initializeAndStart(tabId: number) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
        const virtuosoList = document.querySelector('[data-testid="virtuoso-item-list"]');
        let targetScroller: Element | Window = window;
        let scrollHeight = document.body.scrollHeight;
        if (virtuosoList) {
          virtuosoList.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          let scroller = virtuosoList.parentElement;
          while (scroller && scroller !== document.body) {
            const s = window.getComputedStyle(scroller);
            if (s.overflowY === 'auto' || s.overflowY === 'scroll') break;
            scroller = scroller.parentElement;
          }
          if (scroller && scroller !== document.body) { targetScroller = scroller; scrollHeight = scroller.scrollHeight; }
        }
        targetScroller.scrollTo(0, scrollHeight);
        await new Promise(r => setTimeout(r, 800));
        targetScroller.scrollTo(0, 0);
        await new Promise(r => setTimeout(r, 800));
      },
    });
  } catch (e) { console.error('[SCROLL] error', e); }

  if (isInitialized) { processQueue(); startPollingIfNeeded(); return; }
  isInitialized = true;

  try {
    const [{ result: initialIds }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () =>
        Array.from(document.querySelectorAll('[data-tile-id]:has(img):not(:has([data-tile-id]))'))
          .filter(t => { const img = t.querySelector('img') as HTMLImageElement; return img?.src && !img.src.includes('data:image'); })
          .map(el => el.getAttribute('data-tile-id')),
    });
    initialIds?.forEach((id: string | null) => { if (id) downloadedTileIds.add(id); });
  } catch (e) { console.error('[INIT] error', e); }

  processQueue();
  startPollingIfNeeded();
}

// ── Inyección de prompts ──────────────────────────────────────────────────────

export async function processQueue() {
  if (isInjecting || !activeTabId) return;

  const now = Date.now();
  if (now < rateLimitCooldownUntil) {
    console.log(`[RATE LIMIT] cooldown — ${Math.ceil((rateLimitCooldownUntil - now) / 1000)}s left`);
    return;
  }

  const inProgressCount = queue.filter(q => q.status === 'IN_PROGRESS').length;
  if (inProgressCount >= MAX_CONCURRENT) return;

  const nextPending = queue.find(q => q.status === 'PENDING' || q.status === 'RATE_LIMITED');
  if (!nextPending) return;

  // Pausa entre scripts
  if (lastProcessedSessionFolder && lastProcessedSessionFolder !== nextPending.session_folder) {
    const prevStillRunning = queue.some(q => q.session_folder === lastProcessedSessionFolder && q.status === 'IN_PROGRESS');
    if (prevStillRunning) return;

    console.log(`[QUEUE] Nuevo script (${nextPending.script_name}). Pausando ${SCRIPT_BOUNDARY_DELAY_SEC}s...`);
    isInjecting = true;
    lastProcessedSessionFolder = nextPending.session_folder;

    let left = SCRIPT_BOUNDARY_DELAY_SEC;
    if (countdownTimer) clearInterval(countdownTimer);
    const tick = () => {
      broadcastMessage({ type: 'COUNTDOWN', message: `Esperando para iniciar ${nextPending.script_name}`, secondsLeft: left });
      if (left-- <= 0) {
        clearInterval(countdownTimer!); countdownTimer = null;
        broadcastMessage({ type: 'COUNTDOWN', message: null, secondsLeft: 0 });
        isInjecting = false;
        processQueue();
      }
    };
    tick(); countdownTimer = setInterval(tick, 1000);
    return;
  }

  lastProcessedSessionFolder = nextPending.session_folder;
  isInjecting = true;
  markInProgress(nextPending);
  broadcastQueue();
  startPollingIfNeeded();

  try {
    await chrome.scripting.executeScript({
      target: { tabId: activeTabId },
      world: 'MAIN',
      func: async (promptText: string) => {
        try {
          const virtuosoList = document.querySelector('[data-testid="virtuoso-item-list"]');
          let targetScroller: Element | Window = window;
          let scrollHeight = document.body.scrollHeight;
          if (virtuosoList) {
            let scroller = virtuosoList.parentElement;
            while (scroller && scroller !== document.body) {
              const style = window.getComputedStyle(scroller);
              if (style.overflowY === 'auto' || style.overflowY === 'scroll') break;
              scroller = scroller.parentElement;
            }
            if (scroller && scroller !== document.body) { targetScroller = scroller; scrollHeight = scroller.scrollHeight; }
          }
          if (targetScroller !== window) {
            (targetScroller as HTMLElement).focus();
            (targetScroller as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'End', code: 'End', keyCode: 35, bubbles: true, cancelable: true }));
          }
          targetScroller.scrollTo({ top: scrollHeight, behavior: 'smooth' });
          await new Promise(r => setTimeout(r, 800));

          const tiles = Array.from(document.querySelectorAll('[data-tile-id]'));
          const favTiles = tiles.filter(t => {
            const favIcons = Array.from(t.querySelectorAll('i.google-symbols')).filter(i => i.textContent?.trim() === 'favorite');
            const hasValidFav = favIcons.some(icon => !icon.closest('[role="toolbar"]'));
            return t.querySelector('img') && hasValidFav;
          });
          
          for (const favTile of favTiles) {
            const img = favTile.querySelector('img');
            if (img) {
              const rect = img.getBoundingClientRect();
              const opts = { bubbles: true, cancelable: true, clientX: rect.left + 25, clientY: rect.top + 25, button: 2 };
              img.dispatchEvent(new MouseEvent('mousedown', opts));
              img.dispatchEvent(new MouseEvent('mouseup', opts));
              img.dispatchEvent(new MouseEvent('contextmenu', opts));
            }
            await new Promise(r => setTimeout(r, 200));
            const addOpt = Array.from(document.querySelectorAll('[role="menuitem"], button')).find(el => {
              const text = el.textContent?.toLowerCase() || '';
              return ['añadir a la petición', 'agregar a la instrucción', 'add to prompt', 'use as reference', 'add '].some(l => text.includes(l));
            });
            if (addOpt) {
              addOpt.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
              const rk = Object.keys(addOpt).find(k => k.startsWith('__reactProps$'));
              if (rk) { const p = (addOpt as any)[rk]; if (p?.onClick) try { p.onClick({ preventDefault: () => {}, stopPropagation: () => {}, nativeEvent: { isTrusted: true } }); } catch {} }
              await new Promise(r => setTimeout(r, 300));
            }
          }
        } catch (e) { console.warn('[FLOW-EXT] Error adding reference:', e); }

        const editor = document.querySelector<HTMLElement>('[data-slate-editor="true"]');
        if (!editor) return;
        editor.focus();
        const leaf = editor.querySelector('[data-slate-leaf="true"]') || editor;
        const sel = window.getSelection(); const range = document.createRange();
        range.selectNodeContents(leaf); range.collapse(false);
        if (sel) { sel.removeAllRanges(); sel.addRange(range); }

        const evt = new InputEvent('beforeinput', { inputType: 'insertText', data: promptText, bubbles: true, cancelable: true }) as any;
        evt.getTargetRanges = () => [range];
        editor.dispatchEvent(evt);
        if (!evt.defaultPrevented) { document.execCommand('insertText', false, promptText); editor.dispatchEvent(new Event('input', { bubbles: true })); }

        setTimeout(() => {
          const sendBtn = Array.from(document.querySelectorAll('button')).find(b => b.querySelector('i.google-symbols')?.textContent?.trim() === 'arrow_forward');
          if (sendBtn) {
            sendBtn.removeAttribute('disabled'); sendBtn.removeAttribute('aria-disabled'); sendBtn.style.pointerEvents = 'auto';
            sendBtn.click();
            const rk = Object.keys(sendBtn).find(k => k.startsWith('__reactProps$'));
            if (rk) { const p = (sendBtn as any)[rk]; if (p?.onClick) try { p.onClick({ preventDefault: () => {}, stopPropagation: () => {}, nativeEvent: { isTrusted: true } }); } catch {} }
          }
          editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
          const rk = Object.keys(editor).find(k => k.startsWith('__reactProps$'));
          if (rk) { const p = (editor as any)[rk]; if (p?.onKeyDown) try { p.onKeyDown({ key: 'Enter', code: 'Enter', keyCode: 13, which: 13, preventDefault: () => {}, stopPropagation: () => {}, nativeEvent: { isTrusted: true } }); } catch {} }
        }, 800);
      },
      args: [nextPending.prompt],
    });
    await new Promise(r => setTimeout(r, 2000));
  } catch (e) {
    console.error('[INJECT] error', e);
    markStatus(nextPending.id, 'ERROR');
  } finally {
    isInjecting = false;
    broadcastQueue();
    setTimeout(processQueue, INJECT_DELAY_MS);
  }
}

// ── Polling de resultados ─────────────────────────────────────────────────────

export function startPollingIfNeeded() {
  if (pollingInterval || !activeTabId) return;

  pollingInterval = setInterval(async () => {
    const inProgress = queue.filter(q => q.status === 'IN_PROGRESS');
    if (inProgress.length === 0) {
      clearInterval(pollingInterval!); pollingInterval = null;
      const hasPending = queue.some(q => q.status === 'PENDING');
      if (!hasPending && lastProcessedSessionFolder && activeTabId) {
        const { cleanupImages } = await import('../media/media.service');
        const tileIds = [...mediaIdToScene.values()]
          .filter(v => v.sessionFolder === lastProcessedSessionFolder && v.tileId)
          .map(v => v.tileId as string);
        if (tileIds.length > 0) cleanupImages(activeTabId, tileIds);
      }
      if (!hasPending) lastProcessedSessionFolder = null;
      return;
    }

    // Timeout
    if (markTimedOutAsPending()) { broadcastQueue(); processQueue(); }

    if (!activeTabId) return;
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: activeTabId },
        func: () => {
          const tiles: [string, string][] = [];
          const rateLimitTileIds: string[] = [];
          document.querySelectorAll('[data-tile-id]:has(img):not(:has([data-tile-id]))').forEach(t => {
            const id = t.getAttribute('data-tile-id'); if (!id) return;
            const img = t.querySelector('img') as HTMLImageElement;
            if (img?.src && !img.src.includes('data:image')) {
              tiles.push([id, img.src.startsWith('/') ? location.origin + img.src : img.src]); return;
            }
            const text = t.textContent?.toLowerCase() || '';
            if (text.includes('too quickly') && text.includes('try again')) rateLimitTileIds.push(id);
          });
          return { tiles, rateLimitTileIds };
        },
      });

      const { tiles: currentTiles, rateLimitTileIds } = result as { tiles: [string, string][]; rateLimitTileIds: string[] };
      const newRlIds = rateLimitTileIds.filter(id => !knownRateLimitTileIds.has(id));

      if (newRlIds.length > 0) {
        newRlIds.forEach(id => knownRateLimitTileIds.add(id));
        console.warn(`[RATE LIMIT] ${newRlIds.length} tile(s) — cooldown ${RATE_LIMIT_COOLDOWN_MS / 1000}s`);
        rateLimitCooldownUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
        markInProgressAsRateLimited(); broadcastQueue();
        let left = RATE_LIMIT_COOLDOWN_MS / 1000;
        if (countdownTimer) clearInterval(countdownTimer);
        const tick = () => {
          broadcastMessage({ type: 'COUNTDOWN', message: 'Límite de velocidad. Esperando', secondsLeft: left });
          if (left-- <= 0) {
            clearInterval(countdownTimer!); countdownTimer = null;
            broadcastMessage({ type: 'COUNTDOWN', message: null, secondsLeft: 0 });
            markRateLimitedToRetry(); broadcastQueue(); processQueue();
          }
        };
        tick(); countdownTimer = setInterval(tick, 1000);
      }

      const { handleNewTiles } = await import('../media/media.service');
      handleNewTiles(currentTiles);
    } catch (e) { console.error('[POLL] error', e); }
  }, 3000);
}

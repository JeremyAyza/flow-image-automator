import {
  queue, activeTabId, setActiveTabId,
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

export function resetEngineState() {
  isInitialized = false;
  isInjecting = false;
  downloadedTileIds.clear();
  mediaIdToScene.clear();
  knownRateLimitTileIds.clear();
  if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  lastProcessedSessionFolder = null;
  rateLimitCooldownUntil = 0;
}

export async function initializeAndStart(tabId: number) {
  setActiveTabId(tabId);
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
        const scrollerEl = document.querySelector('.virtual-scroll-container, [data-testid="virtuoso-item-list"]');
        let targetScroller: Element | Window = window;
        let scrollHeight = document.body.scrollHeight;
        if (scrollerEl) {
          scrollerEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          let scroller = scrollerEl.parentElement;
          while (scroller && scroller !== document.body) {
            const s = window.getComputedStyle(scroller);
            if (s.overflowY === 'auto' || s.overflowY === 'scroll') break;
            scroller = scroller.parentElement;
          }
          if (scroller && scroller !== document.body) { targetScroller = scroller; scrollHeight = scroller.scrollHeight; }
          else if (scrollerEl.parentElement) { targetScroller = scrollerEl.parentElement; scrollHeight = scrollerEl.parentElement.scrollHeight; }
        }
        targetScroller.scrollTo(0, scrollHeight);
        await new Promise(r => setTimeout(r, 800));
        targetScroller.scrollTo(0, 0);
        await new Promise(r => setTimeout(r, 800));
      },
    });
  } catch (e) { console.error('[SCROLL] error', e); }

  // Registrar todos los tiles que ya están en el DOM para no confundirlos con los nuevos
  try {
    const [{ result: initialIds }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const ids: string[] = [];
        if ((window as any).__FLOW_DOM__?.getTiles) {
          const flowTiles = (window as any).__FLOW_DOM__.getTiles();
          flowTiles.forEach((tile: HTMLElement) => {
            const id = (window as any).__FLOW_DOM__.getMediaId(tile);
            if (id) ids.push(id);
          });
        }
        document.querySelectorAll<HTMLImageElement>('img[data-media-id]').forEach(img => {
          const mid = img.getAttribute('data-media-id');
          const src = img.currentSrc || img.src;
          if (mid && src && !src.includes('data:image')) ids.push(mid);
        });
        document.querySelectorAll('[data-tile-id]:has(img):not(:has([data-tile-id]))').forEach(t => {
          const id = t.getAttribute('data-tile-id');
          const img = t.querySelector('img') as HTMLImageElement;
          const src = img?.currentSrc || img?.src;
          if (id && src && !src.includes('data:image')) ids.push(id);
        });
        return Array.from(new Set(ids));
      },
    });
    initialIds?.forEach((id: string | null) => { if (id) downloadedTileIds.add(id); });
  } catch (e) { console.error('[INIT] error', e); }

  isInitialized = true;
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
      func: async (promptText: string, sceneNumber: number) => {
        const humanDelay = (min = 1000, max = 4000) =>
          new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min));

        console.log(`%c[PIPELINE: SCENE ${sceneNumber}] ▶ INICIO PROCESO DE INYECCIÓN`, 'color: #38bdf8; font-weight: bold;');
        console.log(`[PIPELINE: SCENE ${sceneNumber}] Prompt: "${promptText.slice(0, 70)}..."`);

        try {
          // ── Paso 1: Scroll al fondo ──
          console.log(`[PIPELINE: SCENE ${sceneNumber}] [1/4] Desplazando al final del lienzo...`);
          const scrollerEl = document.querySelector('.virtual-scroll-container, [data-testid="virtuoso-item-list"]');
          let targetScroller: Element | Window = window;
          let scrollHeight = document.body.scrollHeight;
          if (scrollerEl) {
            let scroller = scrollerEl.parentElement;
            while (scroller && scroller !== document.body) {
              const style = window.getComputedStyle(scroller);
              if (style.overflowY === 'auto' || style.overflowY === 'scroll') break;
              scroller = scroller.parentElement;
            }
            if (scroller && scroller !== document.body) { targetScroller = scroller; scrollHeight = scroller.scrollHeight; }
            else if (scrollerEl.parentElement) { targetScroller = scrollerEl.parentElement; scrollHeight = scrollerEl.parentElement.scrollHeight; }
          }
          if (targetScroller !== window) {
            (targetScroller as HTMLElement).focus();
            (targetScroller as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'End', code: 'End', keyCode: 35, bubbles: true, cancelable: true }));
          }
          targetScroller.scrollTo({ top: scrollHeight, behavior: 'smooth' });
          console.log(`[PIPELINE: SCENE ${sceneNumber}] [1/4] ✔ OK: Scroll realizado.`);
          await humanDelay(1000, 3000);

          // ── Paso 2: Favoritos y Referencias ──
          console.log(`[PIPELINE: SCENE ${sceneNumber}] [2/4] Buscando imágenes favoritas como referencia...`);
          let favTiles: HTMLElement[] = [];
          if ((window as any).__FLOW_DOM__?.getFavoriteTiles) {
            favTiles = (window as any).__FLOW_DOM__.getFavoriteTiles();
          }
          if (favTiles.length === 0) {
            const tiles = Array.from(document.querySelectorAll<HTMLElement>('flow-grid-tile-container, flow-image-tile, [data-tile-id]'));
            favTiles = tiles.filter(t => {
              const activeIcon = t.querySelector('.status-indicators-container mat-icon, mat-icon.fill');
              if (activeIcon && activeIcon.textContent?.trim() === 'favorite') return true;
              const removeFavBtn = t.querySelector('button[aria-label*="Quitar de favoritos" i]');
              if (removeFavBtn) return true;
              const favIcons = Array.from(t.querySelectorAll('i.google-symbols, mat-icon')).filter(i => i.textContent?.trim() === 'favorite' && i.classList.contains('fill'));
              return t.querySelector('img') && favIcons.length > 0;
            });
          }
          
          if (favTiles.length > 0) {
            console.log(`[PIPELINE: SCENE ${sceneNumber}] [2/4] ✔ OK: Encontrados ${favTiles.length} tile(s) favorito(s). Añadiendo referencia...`);
            for (let i = 0; i < favTiles.length; i++) {
              const favTile = favTiles[i];
              await humanDelay(1000, 2000);
              const img = favTile.querySelector('img') || favTile;
              if (img) {
                const rect = img.getBoundingClientRect();
                const opts = { bubbles: true, cancelable: true, clientX: rect.left + 25, clientY: rect.top + 25, button: 2 };
                img.dispatchEvent(new MouseEvent('mousedown', opts));
                img.dispatchEvent(new MouseEvent('mouseup', opts));
                img.dispatchEvent(new MouseEvent('contextmenu', opts));
                console.log(`[PIPELINE: SCENE ${sceneNumber}] [2/4] Menú contextual invocado en favorito #${i + 1}.`);
              }

              let addOpt: HTMLElement | null = null;
              for (let attempt = 0; attempt < 8; attempt++) {
                await new Promise(r => setTimeout(r, 150));
                const menuPanels = Array.from(document.querySelectorAll<HTMLElement>(
                  '.mat-mdc-menu-panel, flow-image-context-menu-items, flow-media-context-menu-items, [role="menu"]'
                ));
                const activeMenu = menuPanels.find(p => p.offsetHeight > 0) || menuPanels[menuPanels.length - 1];
                if (activeMenu) {
                  const items = Array.from(activeMenu.querySelectorAll<HTMLElement>('flow-menu-item button, button[role="menuitem"], button'));
                  addOpt = items.find(el => {
                    const text = (el.textContent || '').toLowerCase();
                    const hasAddIcon = el.querySelector('mat-icon')?.textContent?.trim() === 'add_2';
                    return (
                      hasAddIcon ||
                      text.includes('agregar a la instrucción') ||
                      text.includes('añadir a la petición') ||
                      text.includes('add to prompt') ||
                      text.includes('use as reference')
                    );
                  }) || null;
                  if (addOpt) break;
                }
              }

              if (addOpt) {
                await humanDelay(1000, 2000);
                addOpt.focus();
                addOpt.click();
                addOpt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                addOpt.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                addOpt.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                console.log(`[PIPELINE: SCENE ${sceneNumber}] [2/4] ✔ OK: Opción "${addOpt.textContent?.trim()}" agregada como referencia.`);
                await humanDelay(1500, 3500);
              } else {
                console.warn(`[PIPELINE: SCENE ${sceneNumber}] [2/4] ⚠ AVISO: No se encontró opción "Agregar a la instrucción" en el menú.`);
              }
            }
          } else {
            console.log(`[PIPELINE: SCENE ${sceneNumber}] [2/4] ℹ INFO: No hay favoritos marcados en el lienzo. Continuando sin referencia.`);
          }
        } catch (e) {
          console.warn(`[PIPELINE: SCENE ${sceneNumber}] [2/4] ⚠ ERROR manejando favoritos/scroll:`, e);
        }

        await humanDelay(1000, 2500);

        // ── Paso 3: Editor de texto e inyección de prompt ──
        console.log(`[PIPELINE: SCENE ${sceneNumber}] [3/4] Buscando editor de texto para el prompt...`);
        const editor = document.querySelector<HTMLElement>(
          'flow-base-prompt-box [contenteditable="true"], ' +
          'flow-base-prompt-box [data-slate-editor="true"], ' +
          'flow-base-prompt-box textarea, ' +
          '[data-slate-editor="true"], ' +
          '[contenteditable="true"]'
        );

        if (!editor) {
          console.error(`[PIPELINE: SCENE ${sceneNumber}] [3/4] ✖ ERROR CRÍTICO: Editor de texto no encontrado en el DOM.`);
          return;
        }

        editor.focus();
        console.log(`[PIPELINE: SCENE ${sceneNumber}] [3/4] ✔ OK: Editor enfocado (${editor.tagName.toLowerCase()}). Escribiendo prompt...`);
        await humanDelay(1000, 2000);

        if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
          editor.value = promptText;
          editor.dispatchEvent(new Event('input', { bubbles: true }));
          editor.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          const targetNode = editor.querySelector('[data-slate-leaf="true"]') || editor;
          const sel = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(targetNode);
          range.collapse(false);
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
          }

          const evt = new InputEvent('beforeinput', {
            inputType: 'insertText',
            data: promptText,
            bubbles: true,
            cancelable: true,
          }) as any;
          evt.getTargetRanges = () => [range];
          editor.dispatchEvent(evt);

          if (!evt.defaultPrevented) {
            document.execCommand('insertText', false, promptText);
            editor.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
        console.log(`[PIPELINE: SCENE ${sceneNumber}] [3/4] ✔ OK: Prompt inyectado correctamente.`);

        await humanDelay(1500, 4000);

        // ── Paso 4: Envío de prompt ──
        console.log(`[PIPELINE: SCENE ${sceneNumber}] [4/4] Buscando botón de envío...`);
        const submitControls = document.querySelector('flow-base-prompt-box .submit-controls, .submit-controls');
        const sendBtn = Array.from((submitControls || document).querySelectorAll('button')).find(b => {
          const icon = b.querySelector('i.google-symbols, mat-icon');
          return icon?.textContent?.trim() === 'arrow_forward';
        }) || (submitControls?.querySelector('button:last-child') as HTMLButtonElement | null);

        if (sendBtn) {
          sendBtn.removeAttribute('disabled');
          sendBtn.removeAttribute('aria-disabled');
          sendBtn.style.pointerEvents = 'auto';
          sendBtn.focus();
          sendBtn.click();
          console.log(`[PIPELINE: SCENE ${sceneNumber}] [4/4] ✔ OK: Botón Enviar (arrow_forward) clickeado.`);
        } else {
          editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
          console.log(`[PIPELINE: SCENE ${sceneNumber}] [4/4] ℹ INFO: Botón enviar no visible, enviado con tecla Enter.`);
        }

        await humanDelay(1000, 2500);
        console.log(`%c[PIPELINE: SCENE ${sceneNumber}] ✔ FIN INYECCIÓN: Esperando generación y polling...`, 'color: #22c55e; font-weight: bold;');
      },
      args: [nextPending.prompt, nextPending.scene_number],
    });
    const postInjectDelay = Math.floor(Math.random() * 3000) + 1000;
    await new Promise(r => setTimeout(r, postInjectDelay));
  } catch (e) {
    console.error(`[PIPELINE: ERROR] Error en inyección de escena ${nextPending.scene_number}:`, e);
    markStatus(nextPending.id, 'ERROR');
  } finally {
    isInjecting = false;
    broadcastQueue();
    const nextQueueDelay = Math.floor(Math.random() * 3000) + 1000;
    setTimeout(processQueue, nextQueueDelay);
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

          // 1. FlowDOM helper
          if ((window as any).__FLOW_DOM__?.getTiles) {
            const flowTiles = (window as any).__FLOW_DOM__.getTiles();
            flowTiles.forEach((tile: HTMLElement) => {
              const img = (window as any).__FLOW_DOM__.getTileImage(tile);
              const id = (window as any).__FLOW_DOM__.getMediaId(tile);
              const src = img?.currentSrc || img?.src;
              if (id && src && !src.includes('data:image')) {
                const fullUrl = src.startsWith('//') ? location.protocol + src : src.startsWith('/') ? location.origin + src : src;
                tiles.push([id, fullUrl]);
              }
            });
          }

          // 2. Angular Flow fallback: img[data-media-id]
          if (tiles.length === 0) {
            document.querySelectorAll<HTMLImageElement>('img[data-media-id]').forEach(img => {
              const id = img.getAttribute('data-media-id');
              if (!id) return;
              const src = img.currentSrc || img.src;
              if (src && !src.includes('data:image')) {
                tiles.push([id, src.startsWith('/') ? location.origin + src : src]);
              }
            });
          }

          // 3. Legacy fallback: [data-tile-id]
          document.querySelectorAll('[data-tile-id]:has(img):not(:has([data-tile-id]))').forEach(t => {
            const id = t.getAttribute('data-tile-id');
            if (!id) return;
            const img = t.querySelector('img') as HTMLImageElement;
            const src = img?.currentSrc || img?.src;
            if (src && !src.includes('data:image')) {
              tiles.push([id, src.startsWith('/') ? location.origin + src : src]);
              return;
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

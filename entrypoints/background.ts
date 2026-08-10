import { browser } from 'wxt/browser';
import { QueueItem, SCENE_TIMEOUT_MS, SCRIPT_BOUNDARY_DELAY_SEC, SCENE_TIMEOUT_MINUTES } from '../utils/types';

const MAX_CONCURRENT = 3;
const IMAGES_PER_SCENE = 1;        // Flow generates this many images per prompt
const INJECT_DELAY_MS = 3_000;     // 3s delay between injections to fill queue up to MAX_CONCURRENT
const RATE_LIMIT_COOLDOWN_MS = 60_000; // 60s pause when rate limit error is detected

let queue: QueueItem[] = [];
let downloadedTileIds = new Set<string>();
let isInjecting = false;
let pollingInterval: any = null;
let activeTabId: number | null = null;
let rateLimitCooldownUntil = 0; // timestamp — no new injections before this
let lastProcessedSessionFolder: string | null = null;
let countdownTimer: any = null;
let knownRateLimitTileIds = new Set<string>();

// mediaId (= UUID from URL) → { sceneNumber, imageIndex, sessionFolder, fifeUrl, tileId }
const mediaIdToScene = new Map<string, { sceneNumber: number, imageIndex: number, sessionFolder: string, fifeUrl?: string, tileId?: string }>();

export default defineBackground(() => {
  console.log('Flow Background Queue Orchestrator Started');

  // Register the MAIN-world injector script (WXT doesn't add it to the manifest automatically)
  chrome.scripting.registerContentScripts([{
    id: 'flow-injector',
    matches: ['*://*.google.com/*', '*://labs.google/*'],
    js: ['injector.js'],
    world: 'MAIN',
    runAt: 'document_start',
  }]).catch(() => {
    // Already registered from a previous session — update it
    chrome.scripting.updateContentScripts([{
      id: 'flow-injector',
      matches: ['*://*.google.com/*', '*://labs.google/*'],
      js: ['injector.js'],
      world: 'MAIN',
      runAt: 'document_start',
    }]).catch(e => console.error('[INJECTOR] update failed:', e));
  });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_TAB_ID') {
      sendResponse({ tabId: sender.tab?.id ?? null });
      return true;
    }

    if (message.type === 'GET_QUEUE') {
      sendResponse({ queue });
      return true;
    }

    if (message.type === 'START_QUEUE') {
      const { prompts, tabId } = message;
      activeTabId = tabId;

      const sessionFolder = `${message.scriptName}_${Date.now()}`;

      const newItems: QueueItem[] = prompts.map((p: { scene_number: number; prompt: string }) => ({
        id: Math.random().toString(36).substring(2, 9),
        script_name: message.scriptName,
        scene_number: p.scene_number,
        prompt: p.prompt,
        status: 'PENDING',
        session_folder: sessionFolder,
      }));

      queue = [...queue, ...newItems];
      broadcastQueue();
      initializeKnownIdsAndStart(tabId);
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'CLEAR_QUEUE') {
      queue = [];
      mediaIdToScene.clear();
      knownRateLimitTileIds.clear();
      broadcastQueue();
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'BATCH_DETECTED') {
      handleBatchResponse(message.data);
      return true;
    }

    if (message.type === 'TEST_SCROLL') {
      console.log('=> Recibido TEST_SCROLL para tabId:', message.tabId);
      chrome.scripting.executeScript({
        target: { tabId: message.tabId },
        world: 'MAIN',
        func: async () => {
          console.log('[TEST 0] Buscando lista virtuoso...');
          const virtuosoList = document.querySelector('[data-testid="virtuoso-item-list"]');

          let targetScroller: Element | Window = window;
          let scrollHeight = document.body.scrollHeight;

          if (virtuosoList) {
            // Hacemos click como sugirió el usuario para dar foco
            virtuosoList.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            // Buscamos el contenedor que realmente tiene el scroll
            let scroller = virtuosoList.parentElement;
            while (scroller && scroller !== document.body) {
              const style = window.getComputedStyle(scroller);
              if (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflow === 'auto' || style.overflow === 'scroll') {
                break;
              }
              scroller = scroller.parentElement;
            }

            if (scroller && scroller !== document.body) {
              targetScroller = scroller;
              scrollHeight = scroller.scrollHeight;
            }
          }

          console.log('[TEST 0] Haciendo scroll al final...');
          targetScroller.scrollTo(0, scrollHeight);
          await new Promise(r => setTimeout(r, 800));
          console.log('[TEST 0] Haciendo scroll al inicio...');
          targetScroller.scrollTo(0, 0);
          console.log('[TEST 0] Scroll completado');
        }
      });
      return true;
    }

    if (message.type === 'TEST_FIND_FAVORITE') {
      console.log('=> Recibido TEST_FIND_FAVORITE para tabId:', message.tabId);
      chrome.scripting.executeScript({
        target: { tabId: message.tabId },
        world: 'MAIN',
        func: () => {
          console.log('[TEST 1] Ejecutando script de busqueda...');
          const tiles = Array.from(document.querySelectorAll('[data-tile-id]:has(img):not(:has([data-tile-id]))'));
          const favTile = tiles.find(t => {
            const img = t.querySelector('img');
            const icons = Array.from(t.querySelectorAll('i.google-symbols'));
            const hasFav = icons.some(i => i.textContent?.trim() === 'favorite');
            return img && hasFav;
          }) as HTMLElement;

          if (favTile) {
            console.log('[TEST 1] Found favorite tile:', favTile);
            favTile.style.border = '5px solid red';
            favTile.style.boxSizing = 'border-box';
            console.log('[TEST 1] SUCCESS: Añadido borde rojo a la tarjeta');
          } else {
            console.error('[TEST 1] FAIL: Favorite image tile not found');
          }
        }
      });
      return true;
    }

    if (message.type === 'TEST_RIGHT_CLICK') {
      console.log('=> Recibido TEST_RIGHT_CLICK para tabId:', message.tabId);
      chrome.scripting.executeScript({
        target: { tabId: message.tabId },
        world: 'MAIN',
        func: () => {
          const tiles = Array.from(document.querySelectorAll('[data-tile-id]:has(img):not(:has([data-tile-id]))'));
          const favTile = tiles.find(t => {
            const img = t.querySelector('img');
            const icons = Array.from(t.querySelectorAll('i.google-symbols'));
            const hasFav = icons.some(i => i.textContent?.trim() === 'favorite');
            return img && hasFav;
          }) as HTMLElement;

          if (favTile) {
            favTile.style.border = '5px solid blue';
            const targetImg = favTile.querySelector('img');
            console.log('[TEST 2] Dispatching contextmenu on image', targetImg);

            if (targetImg) {
              const rect = targetImg.getBoundingClientRect();
              const eventOptions = {
                bubbles: true,
                cancelable: true,
                clientX: rect.left + 25,
                clientY: rect.top + 25,
                button: 2
              };

              targetImg.dispatchEvent(new MouseEvent('mousedown', eventOptions));
              targetImg.dispatchEvent(new MouseEvent('mouseup', eventOptions));
              targetImg.dispatchEvent(new MouseEvent('contextmenu', eventOptions));
              console.log('[TEST 2] SUCCESS: Evento anticlic disparado en la imagen');
            }
          } else {
            console.error('[TEST 2] FAIL: Tile not found');
          }
        }
      });
      return true;
    }

    if (message.type === 'TEST_CLICK_ADD') {
      console.log('=> Recibido TEST_CLICK_ADD para tabId:', message.tabId);
      chrome.scripting.executeScript({
        target: { tabId: message.tabId },
        world: 'MAIN',
        func: () => {
          const menuItems = Array.from(document.querySelectorAll('[role="menuitem"], button'));
          const addOpt = menuItems.find(el => {
            const text = el.textContent?.toLowerCase() || '';
            return text.includes('añadir a la petición') || text.includes('add to prompt') || text.includes('use as reference');
          });

          if (addOpt) {
            console.log('[TEST 3] Found add option:', addOpt);

            (addOpt as HTMLElement).style.backgroundColor = 'lime';
            console.log('[TEST 3] Clicking menuItem:', addOpt);

            addOpt.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            const reactKey = Object.keys(addOpt).find(k => k.startsWith('__reactProps$'));
            if (reactKey) {
              const props = (addOpt as any)[reactKey];
              if (props && typeof props.onClick === 'function') {
                try { props.onClick({ preventDefault: () => { }, stopPropagation: () => { }, nativeEvent: { isTrusted: true } }); } catch { }
              }
            }
            console.log('[TEST 3] SUCCESS: Click events disparados');
          } else {
            console.error('[TEST 3] FAIL: "Añadir a la petición" not found in DOM');
          }
        }
      });
      return true;
    }

    if (message.type === 'TEST_SELECT_LAST_THREE') {
      console.log('=> Recibido TEST_SELECT_LAST_THREE para tabId:', message.tabId);
      chrome.scripting.executeScript({
        target: { tabId: message.tabId },
        world: 'MAIN',
        func: async () => {
          console.log('[TEST 4] Iniciando selección de los 3 tiles más recientes...');
          const realTiles = Array.from(document.querySelectorAll('[data-tile-id]:has(img):not(:has([data-tile-id]))')) as HTMLElement[];
          const lastThree = realTiles.slice(0, 3);
          for (const tile of lastThree) {
            tile.style.border = '5px solid red';
            tile.style.boxSizing = 'border-box';
            
            const targetEl = tile.querySelector('img') || tile;
            const rect = targetEl.getBoundingClientRect();
            const eventOpts = {
              bubbles: true, cancelable: true,
              clientX: rect.left + 25, clientY: rect.top + 25,
              ctrlKey: true, metaKey: true
            };
            
            targetEl.dispatchEvent(new MouseEvent('mousedown', eventOpts));
            targetEl.dispatchEvent(new MouseEvent('mouseup', eventOpts));
            targetEl.dispatchEvent(new MouseEvent('click', eventOpts));
            await new Promise(resolve => setTimeout(resolve, 300));
          }
          console.log('[TEST 4] Los últimos 3 tiles fueron seleccionados.');
        }
      });
      return true;
    }

    if (message.type === 'TEST_DELETE_SELECTED') {
      console.log('=> Recibido TEST_DELETE_SELECTED para tabId:', message.tabId);
      chrome.scripting.executeScript({
        target: { tabId: message.tabId },
        world: 'MAIN',
        func: () => {
          console.log('[TEST 5] Enviando evento de borrado...');
          const deleteEvent = new KeyboardEvent('keydown', {
            key: 'Delete', code: 'Delete', keyCode: 46, bubbles: true, cancelable: true
          });
          
          const tiles = Array.from(document.querySelectorAll('[data-tile-id]:has(img):not(:has([data-tile-id]))'));
          const firstTile = tiles[0];
          if (firstTile) {
            firstTile.dispatchEvent(deleteEvent);
          } else {
            document.dispatchEvent(deleteEvent);
          }
          
          const scroller = document.querySelector('[data-testid="virtuoso-item-list"]')?.parentElement;
          if (scroller) scroller.dispatchEvent(deleteEvent);
          console.log('[TEST 5] Evento Suprimir despachado.');
        }
      });
      return true;
    }
  });
});

function unwrapTrpc(raw: any): any {
  // tRPC wraps responses: { result: { data: { json: <actual data> } } } or array of such
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const inner = item?.result?.data?.json ?? item?.result?.data;
      if (inner?.workflows || inner?.media) return inner;
    }
  }
  if (raw?.result?.data?.json?.workflows || raw?.result?.data?.json?.media) return raw.result.data.json;
  if (raw?.result?.data?.workflows || raw?.result?.data?.media) return raw.result.data;
  return raw;
}

function handleBatchResponse(raw: any) {
  // === LOG SOLICITADO PARA INVESTIGAR LA CARGA ÚTIL ===
  console.log("=== [FLOW] FULL BATCH RESPONSE PAYLOAD ===");
  console.log(JSON.stringify(raw, null, 2));
  console.log("=========================================");

  try {
    const data = unwrapTrpc(raw);
    const workflows: any[] = data?.workflows ?? [];
    const mediaItems: any[] = data?.media ?? [];

    console.log(`[BATCH] response received — ${workflows.length} workflow(s), ${mediaItems.length} media item(s)`);

    if (workflows.length > 0) {
      for (const workflow of workflows) {
        const workflowId: string = workflow?.name ?? '(no name)';
        const batchId: string | undefined = workflow?.metadata?.batchId;
        const displayName: string | undefined = workflow?.metadata?.displayName;

        if (!batchId) continue;

        const batchMedia = mediaItems.filter(
          m => m?.image?.generatedImage?.workflowId === workflowId || m?.workflowId === workflowId
        );

        processBatchMedia(batchMedia, displayName);
      }
    } else if (mediaItems.length > 0) {
      // Si el API nuevo solo devuelve media sin workflows, procesamos directamente
      processBatchMedia(mediaItems, undefined);
    }

    broadcastQueue();
  } catch (e) {
    console.error('[BATCH] error', e);
  }
}

function processBatchMedia(batchMedia: any[], fallbackDisplayName?: string) {
  if (batchMedia.length === 0) return;

  const dataGenerateImage = batchMedia[0]?.image?.generatedImage

  const promptFromResponse: string | undefined =
    dataGenerateImage?.requestData?.promptInputs?.[0]?.textInput
    ?? dataGenerateImage?.prompt
    ?? fallbackDisplayName;

  console.log(`  prompt used for matching: "${promptFromResponse?.slice(0, 40)}"`);

  // Usamos includes() en lugar de === porque ahora el prompt real tiene el texto de "STYLE REFERENCES" al final
  const target = promptFromResponse
    ? queue.find(q => q.status === 'IN_PROGRESS' && promptFromResponse.includes(q.prompt))
    : undefined;

  if (!target) {
    console.warn(`  [BATCH] no queue match — prompt "${promptFromResponse?.slice(0, 60)}" not found among IN_PROGRESS items`);
    return;
  }

  console.log(`  [BATCH] matched → scene ${target.scene_number}`);

  const alreadyMapped = [...mediaIdToScene.values()]
    .filter(v => v.sceneNumber === target.scene_number && v.sessionFolder === target.session_folder).length;

  batchMedia.forEach((m: any, idx: number) => {
    const mediaId = m?.image?.generatedImage?.mediaId ?? m?.name;
    const fifeUrl = m?.image?.generatedImage?.fifeUrl;
    if (mediaId && !mediaIdToScene.has(mediaId)) {
      mediaIdToScene.set(mediaId, {
        sceneNumber: target.scene_number,
        imageIndex: alreadyMapped + idx + 1,
        sessionFolder: target.session_folder,
        fifeUrl: fifeUrl
      });
      console.log(`    -> mapped ${mediaId} to scene ${target.scene_number} (img ${alreadyMapped + idx + 1}) | fifeUrl: ${fifeUrl ? 'yes' : 'no'}`);
    }
  });
}

function broadcastQueue() {
  const msg = { type: 'QUEUE_UPDATED', queue };
  // Enviar a páginas de extensión (si el popup estuviera abierto)
  browser.runtime.sendMessage(msg).catch(() => {});
  // Enviar al content script del tab activo (el sidebar no recibe runtime.sendMessage)
  if (activeTabId) {
    chrome.tabs.sendMessage(activeTabId, msg).catch(() => {});
  }
}

function broadcastMessage(msg: Record<string, unknown>) {
  browser.runtime.sendMessage(msg).catch(() => {});
  if (activeTabId) {
    chrome.tabs.sendMessage(activeTabId, msg).catch(() => {});
  }
}

let isInitialized = false;

async function initializeKnownIdsAndStart(tabId: number) {
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
            const style = window.getComputedStyle(scroller);
            if (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflow === 'auto' || style.overflow === 'scroll') {
              break;
            }
            scroller = scroller.parentElement;
          }
          if (scroller && scroller !== document.body) {
            targetScroller = scroller;
            scrollHeight = scroller.scrollHeight;
          }
        }

        targetScroller.scrollTo(0, scrollHeight);
        await new Promise(r => setTimeout(r, 800));
        targetScroller.scrollTo(0, 0);
        await new Promise(r => setTimeout(r, 800));
      }
    });
  } catch (e) {
    console.error('[SCROLL] error', e);
  }

  if (isInitialized) {
    processQueue();
    startPollingIfNeeded();
    return;
  }
  isInitialized = true;

  try {
    const [{ result: initialIds }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () =>
        Array.from(document.querySelectorAll('[data-tile-id]:has(img):not(:has([data-tile-id]))'))
          .filter(t => {
            const img = t.querySelector('img') as HTMLImageElement;
            return img && img.src && !img.src.includes('data:image');
          })
          .map(el => el.getAttribute('data-tile-id')),
    });

    if (initialIds) {
      initialIds.forEach((id: string | null) => { if (id) downloadedTileIds.add(id); });
    }
  } catch (e) {
    console.error('[INIT] error', e);
  }

  processQueue();
  startPollingIfNeeded();
}

async function processQueue() {
  if (isInjecting) return;
  if (!activeTabId) return;

  // Respect rate limit cooldown
  const now = Date.now();
  if (now < rateLimitCooldownUntil) {
    const remaining = Math.ceil((rateLimitCooldownUntil - now) / 1000);
    console.log(`[RATE LIMIT] cooldown active — ${remaining}s remaining`);
    return;
  }

  const inProgressCount = queue.filter(q => q.status === 'IN_PROGRESS').length;
  if (inProgressCount >= MAX_CONCURRENT) return;

  const nextPending = queue.find(q => q.status === 'PENDING' || q.status === 'RATE_LIMITED');
  if (!nextPending) return;

  // Si estamos saltando a un script diferente (y no es el primero)
  if (lastProcessedSessionFolder && lastProcessedSessionFolder !== nextPending.session_folder) {
    // Verificar si el script anterior aún tiene escenas en progreso
    const previousScriptStillRunning = queue.some(q => q.session_folder === lastProcessedSessionFolder && q.status === 'IN_PROGRESS');
    if (previousScriptStillRunning) {
      // Bloquear y esperar a que termine el grupo anterior por completo
      return;
    }

    console.log(`[QUEUE] Cambiando a un nuevo script (${nextPending.script_name}). Pausando 30 segundos...`);
    isInjecting = true; // bloqueamos la cola temporalmente
    lastProcessedSessionFolder = nextPending.session_folder;
    
    // Iniciar cuenta regresiva para la UI
    let left = SCRIPT_BOUNDARY_DELAY_SEC;
    if (countdownTimer) clearInterval(countdownTimer);
    
    const tick = () => {
      broadcastMessage({ type: 'COUNTDOWN', message: `Esperando para iniciar ${nextPending.script_name}`, secondsLeft: left });
      if (left <= 0) {
        clearInterval(countdownTimer);
        countdownTimer = null;
        broadcastMessage({ type: 'COUNTDOWN', message: null, secondsLeft: 0 });
        
        console.log(`[QUEUE] Reanudando proceso para el nuevo script...`);
        isInjecting = false;
        processQueue();
      }
      left--;
    };
    tick();
    countdownTimer = setInterval(tick, 1000);
    return;
  }

  lastProcessedSessionFolder = nextPending.session_folder;

  isInjecting = true;
  nextPending.status = 'IN_PROGRESS';
  nextPending.started_at = Date.now();
  broadcastQueue();
  
  // ASEGURAR que el polling esté corriendo, ya que pudo detenerse si la cola estuvo vacía temporalmente
  startPollingIfNeeded();

  try {
    await chrome.scripting.executeScript({
      target: { tabId: activeTabId },
      world: 'MAIN',
      func: async (promptText) => {
        try {
          const tiles = Array.from(document.querySelectorAll('[data-tile-id]'));
          const favTile = tiles.find(t => {
            const img = t.querySelector('img');
            const icons = Array.from(t.querySelectorAll('i.google-symbols'));
            const hasFav = icons.some(i => i.textContent?.trim() === 'favorite');
            return img && hasFav;
          });

          if (favTile) {
            const targetImg = favTile.querySelector('img');
            if (targetImg) {
              const rect = targetImg.getBoundingClientRect();
              const eventOptions = { bubbles: true, cancelable: true, clientX: rect.left + 25, clientY: rect.top + 25, button: 2 };
              targetImg.dispatchEvent(new MouseEvent('mousedown', eventOptions));
              targetImg.dispatchEvent(new MouseEvent('mouseup', eventOptions));
              targetImg.dispatchEvent(new MouseEvent('contextmenu', eventOptions));
            }
            await new Promise(r => setTimeout(r, 200));

            const menuItems = Array.from(document.querySelectorAll('[role="menuitem"], button'));
            const addOpt = menuItems.find(el => {
              const text = el.textContent?.toLowerCase() || '';
              const labels = ["añadir a la petición", "agregar a la instrucción", 'add to prompt, use as reference', "add "]
              return labels.some(label => text.includes(label?.toLowerCase()));
            });

            if (addOpt) {
              addOpt.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

              const reactKey = Object.keys(addOpt).find(k => k.startsWith('__reactProps$'));
              if (reactKey) {
                const props = (addOpt as any)[reactKey];
                if (props && typeof props.onClick === 'function') {
                  try { props.onClick({ preventDefault: () => { }, stopPropagation: () => { }, nativeEvent: { isTrusted: true } }); } catch { }
                }
              }
              await new Promise(r => setTimeout(r, 300));
            }
          }
        } catch (e) {
          console.warn('[FLOW-EXT] Error adding reference:', e);
        }

        const editorDom = document.querySelector<HTMLElement>('[data-slate-editor="true"]');
        if (!editorDom) return;
        editorDom.focus();

        const leaf = editorDom.querySelector('[data-slate-leaf="true"]') || editorDom;
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(leaf);
        range.collapse(false);
        if (sel) { sel.removeAllRanges(); sel.addRange(range); }

        const beforeInputEvent = new InputEvent('beforeinput', { inputType: 'insertText', data: promptText, bubbles: true, cancelable: true }) as any;
        beforeInputEvent.getTargetRanges = () => [range];
        editorDom.dispatchEvent(beforeInputEvent);

        if (!beforeInputEvent.defaultPrevented) {
          document.execCommand('insertText', false, promptText);
          editorDom.dispatchEvent(new Event('input', { bubbles: true }));
        }

        setTimeout(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const sendButton = buttons.find(b => {
            const icon = b.querySelector('i.google-symbols');
            return icon && icon.textContent?.trim() === 'arrow_forward';
          });

          if (sendButton) {
            sendButton.removeAttribute('disabled');
            sendButton.removeAttribute('aria-disabled');
            sendButton.style.pointerEvents = 'auto';
            sendButton.click();

            const btnReactKey = Object.keys(sendButton).find(k => k.startsWith('__reactProps$'));
            if (btnReactKey) {
              const props = (sendButton as any)[btnReactKey];
              if (props && typeof props.onClick === 'function') {
                try { props.onClick({ preventDefault: () => { }, stopPropagation: () => { }, nativeEvent: { isTrusted: true } }); } catch { }
              }
            }
          }

          editorDom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));

          const editorReactKey = Object.keys(editorDom).find(k => k.startsWith('__reactProps$'));
          if (editorReactKey) {
            const props = (editorDom as any)[editorReactKey];
            if (props && typeof props.onKeyDown === 'function') {
              try { props.onKeyDown({ key: 'Enter', code: 'Enter', keyCode: 13, which: 13, preventDefault: () => { }, stopPropagation: () => { }, nativeEvent: { isTrusted: true } }); } catch { }
            }
          }
        }, 800);
      },
      args: [nextPending.prompt],
    });

    // Small buffer after injection before allowing another one
    await new Promise(r => setTimeout(r, 2000));
  } catch (e) {
    console.error('[INJECT] error', e);
    nextPending.status = 'ERROR';
  } finally {
    isInjecting = false;
    broadcastQueue();
    
    // Attempt to inject the next prompt to reach MAX_CONCURRENT, with a delay
    setTimeout(() => {
      processQueue();
    }, INJECT_DELAY_MS);
  }
}

function startPollingIfNeeded() {
  if (pollingInterval) return;
  if (!activeTabId) return;

  pollingInterval = setInterval(async () => {
    const inProgressCount = queue.filter(q => q.status === 'IN_PROGRESS').length;
    if (inProgressCount === 0) {
      clearInterval(pollingInterval);
      pollingInterval = null;
      
      const pendingCount = queue.filter(q => q.status === 'PENDING').length;
      if (pendingCount === 0) {
        if (lastProcessedSessionFolder && activeTabId) {
          console.log(`[CLEANUP] Lote finalizado. Iniciando auto-limpieza para sesión: ${lastProcessedSessionFolder}`);
          
          const sessionTileIds = [...mediaIdToScene.values()]
            .filter(v => v.sessionFolder === lastProcessedSessionFolder && v.tileId)
            .map(v => v.tileId as string);
            
          if (sessionTileIds.length > 0) {
            cleanupImages(activeTabId, sessionTileIds);
          }
        }
        lastProcessedSessionFolder = null; // Reset when queue is completely idle
      }
      return;
    }

    if (!activeTabId) return;

    // Lógica de Timeout
    const nowTimeout = Date.now();
    let timedOut = false;
    const timeoutLimit = SCENE_TIMEOUT_MS || (3 * 60 * 1000);
    queue.filter(q => q.status === 'IN_PROGRESS').forEach(q => {
      if (q.started_at && nowTimeout - q.started_at > SCENE_TIMEOUT_MS) {
        console.warn(`[TIMEOUT] Escena ${q.scene_number} del script ${q.script_name} tardó más de ${SCENE_TIMEOUT_MINUTES} minutos. Reintentando...`);
        q.status = 'PENDING';
        q.started_at = undefined;
        timedOut = true;
      }
    });
    
    if (timedOut) {
      broadcastQueue();
      // Le decimos a la cola que revise si hay algo que inyectar
      processQueue();
    }

    try {
      const [{ result: scanResult }] = await chrome.scripting.executeScript({
        target: { tabId: activeTabId },
        func: () => {
          const tiles: [string, string][] = [];
          const rateLimitTileIds: string[] = [];

          document.querySelectorAll('[data-tile-id]:has(img):not(:has([data-tile-id]))').forEach(t => {
            const id = t.getAttribute('data-tile-id');
            if (!id) return;

            const img = t.querySelector('img') as HTMLImageElement;
            if (img?.src && !img.src.includes('data:image')) {
              tiles.push([id, img.src.startsWith('/') ? location.origin + img.src : img.src]);
              return;
            }

            // Detect rate limit error tiles — look for the error text (robust vs obfuscated class names)
            // We use 'too quickly' and 'try again' to avoid false positives if the user's prompt contains 'too quickly'
            const text = t.textContent?.toLowerCase() || '';
            if (text.includes('too quickly') && text.includes('try again')) {
              rateLimitTileIds.push(id);
            }
          });

          return { tiles, rateLimitTileIds };
        },
      });

      const { tiles: currentTiles, rateLimitTileIds } = scanResult as {
        tiles: [string, string][];
        rateLimitTileIds: string[];
      };

      const newRateLimitTileIds = rateLimitTileIds.filter(id => !knownRateLimitTileIds.has(id));

      // Handle rate limit errors
      if (newRateLimitTileIds.length > 0) {
        newRateLimitTileIds.forEach(id => knownRateLimitTileIds.add(id));
        console.warn(`[RATE LIMIT] detected ${newRateLimitTileIds.length} failed tile(s) — cooling down ${RATE_LIMIT_COOLDOWN_MS / 1000}s`);
        rateLimitCooldownUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;

        // Mark affected IN_PROGRESS scenes as RATE_LIMITED so they re-enter the queue after cooldown
        const affectedScenes = queue.filter(q => q.status === 'IN_PROGRESS');
        affectedScenes.forEach(q => {
          q.status = 'RATE_LIMITED';
          console.log(`[RATE LIMIT] scene ${q.scene_number} marked as RATE_LIMITED — will retry after cooldown`);
        });

        broadcastQueue();

        let left = RATE_LIMIT_COOLDOWN_MS / 1000;
        if (countdownTimer) clearInterval(countdownTimer);
        const tick = () => {
          broadcastMessage({ type: 'COUNTDOWN', message: 'Límite de velocidad. Esperando', secondsLeft: left });
          if (left <= 0) {
            clearInterval(countdownTimer);
            countdownTimer = null;
            broadcastMessage({ type: 'COUNTDOWN', message: null, secondsLeft: 0 });
            
            queue.filter(q => q.status === 'RATE_LIMITED').forEach(q => {
              q.status = 'PENDING';
            });
            broadcastQueue();
            processQueue();
          }
          left--;
        };
        tick();
        countdownTimer = setInterval(tick, 1000);
      }

      const newTiles = currentTiles.filter(([id, imgUrl]) => {
        if (downloadedTileIds.has(id)) return false;
        const uuidMatch = imgUrl.match(/(?:[?&]name=|\/image\/)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
        const uuid = uuidMatch ? uuidMatch[1] : undefined;
        if (uuid && downloadedTileIds.has(uuid)) return false;
        return true;
      });

      for (const [tileId, imgUrl] of newTiles) {
        const uuidMatchUrl = imgUrl.match(/(?:[?&]name=|\/image\/)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
        const uuidFromUrl = uuidMatchUrl ? uuidMatchUrl[1] : undefined;

        // Guard: another tile earlier in this same loop may have already claimed this uuid
        if (downloadedTileIds.has(tileId)) continue;
        if (uuidFromUrl && downloadedTileIds.has(uuidFromUrl)) continue;

        const mapping = uuidFromUrl ? mediaIdToScene.get(uuidFromUrl) : undefined;

        if (!mapping) {
          console.log(`[POLL] tile ${tileId} | imgSrc: ${imgUrl.slice(0, 100)} | urlUuid: ${uuidFromUrl ?? 'none'} | no mapping yet, waiting`);
          continue;
        }
        
        mapping.tileId = tileId;

        downloadedTileIds.add(tileId);
        if (uuidFromUrl) downloadedTileIds.add(uuidFromUrl); // needed for checkSceneComplete lookup
        const paddedScene = mapping.sceneNumber.toString();

        let filename = `Flow_Generations/${mapping.sessionFolder}/`;
        if (mapping.sceneNumber === 0) {
          filename += `thumbnail.png`;
        } else if (IMAGES_PER_SCENE === 1) {
          filename += `scene_${paddedScene}.png`;
        } else {
          filename += `scene_${paddedScene}/scene_${mapping.imageIndex}.png`;
        }

        // Si tenemos un fifeUrl guardado, lo usamos y le agregamos =s0 para pedir la resolución original máxima
        const finalUrl = mapping.fifeUrl ? `${mapping.fifeUrl}` : imgUrl;

        browser.downloads.download({
          url: finalUrl,
          filename: filename,
          saveAs: false,
        }).catch(err => console.error('[DOWNLOAD] error', err));

        console.log(`[DOWNLOAD] scene ${mapping.sceneNumber} img ${mapping.imageIndex} (tileId: ${tileId} | urlUuid: ${uuidFromUrl})`);

        const sceneItem = queue.find(q => q.scene_number === mapping.sceneNumber && q.session_folder === mapping.sessionFolder && q.status === 'IN_PROGRESS');
        if (sceneItem) {
          const sceneMediaIds = [...mediaIdToScene.entries()]
            .filter(([, v]) => v.sceneNumber === mapping.sceneNumber && v.sessionFolder === mapping.sessionFolder)
            .map(([k]) => k);

          const downloadedForScene = sceneMediaIds.filter(mid => downloadedTileIds.has(mid));

          if (downloadedForScene.length >= IMAGES_PER_SCENE) {
            sceneItem.status = 'DOWNLOADED';
            broadcastQueue();
            processQueue();
          }
        }
      }
    } catch (e) {
      console.error('[POLL] error', e);
    }
  }, 3000);
}

function cleanupImages(tabId: number, tileIds: string[]) {
  console.log(`[CLEANUP] Enviando comando para borrar ${tileIds.length} imágenes...`);
  chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: async (idsToCleanup: string[]) => {
      console.log('[CLEANUP] Iniciando proceso de borrado en la página...');
      let selectedCount = 0;
      
      // 1. Seleccionar con Ctrl + Click y poner borde rojo
      for (const id of idsToCleanup) {
        const tile = document.querySelector(`[data-tile-id="${id}"]:has(img):not(:has([data-tile-id]))`) as HTMLElement;
        if (tile) {
          // Destacar el tile
          tile.style.border = '5px solid red';
          tile.style.boxSizing = 'border-box';
          tile.style.transition = 'border 0.2s ease';
          
          // Buscar la imagen clickeable dentro del tile o el tile mismo
          const targetEl = tile.querySelector('img') || tile;
          
          const rect = targetEl.getBoundingClientRect();
          const eventOpts = {
            bubbles: true,
            cancelable: true,
            clientX: rect.left + 25,
            clientY: rect.top + 25,
            ctrlKey: true, // Simulamos Ctrl
            metaKey: true  // Simulamos Meta para Mac
          };
          
          targetEl.dispatchEvent(new MouseEvent('mousedown', eventOpts));
          targetEl.dispatchEvent(new MouseEvent('mouseup', eventOpts));
          targetEl.dispatchEvent(new MouseEvent('click', eventOpts));
          
          selectedCount++;
          // Pequeño delay para que la UI de Google registre las múltiples selecciones
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      
      console.log(`[CLEANUP] Se seleccionaron ${selectedCount} elementos. Borrando...`);
      
      if (selectedCount > 0) {
        // 2. Simular tecla Suprimir (Delete)
        const deleteEvent = new KeyboardEvent('keydown', {
          key: 'Delete',
          code: 'Delete',
          keyCode: 46,
          bubbles: true,
          cancelable: true
        });
        
        // Es MUY peligroso enviar eventos globalmente (especialmente Backspace que puede navegar atrás).
        // Mejor disparamos el evento de Delete directamente en el primer elemento seleccionado
        // para que la UI de React de Google Labs lo intercepte correctamente.
        const firstTileId = idsToCleanup[0];
        const firstTile = document.querySelector(`[data-tile-id="${firstTileId}"]:has(img):not(:has([data-tile-id]))`);
        
        if (firstTile) {
          firstTile.dispatchEvent(deleteEvent);
        } else {
          document.dispatchEvent(deleteEvent);
        }
        
        // Si el elemento no lo capta, intentamos en el contenedor principal si existe
        const scroller = document.querySelector('[data-testid="virtuoso-item-list"]')?.parentElement;
        if (scroller) {
          scroller.dispatchEvent(deleteEvent);
        }
        
        console.log('[CLEANUP] Proceso completado sin enviar Backspace.');
      } else {
        console.log('[CLEANUP] No se encontraron elementos en el DOM para borrar.');
      }
    },
    args: [tileIds]
  }).catch(err => console.error('[CLEANUP] Error ejecutando script de borrado:', err));
}

import { browser } from 'wxt/browser';
import { QueueItem } from '../utils/types';

const MAX_CONCURRENT = 3;
const IMAGES_PER_SCENE = 1;        // Flow generates this many images per prompt
const INJECT_DELAY_MS = 15_000;    // 15s between injections → max 4 prompts/min = 8 images/min (rate limit)
const RATE_LIMIT_COOLDOWN_MS = 60_000; // 60s pause when rate limit error is detected

let queue: QueueItem[] = [];
let downloadedTileIds = new Set<string>();
let isInjecting = false;
let pollingInterval: any = null;
let activeTabId: number | null = null;
let rateLimitCooldownUntil = 0; // timestamp — no new injections before this

// mediaId (= data-tile-id in DOM) → { sceneNumber, imageIndex, sessionFolder }
const mediaIdToScene = new Map<string, { sceneNumber: number; imageIndex: number; sessionFolder: string }>();

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
    if (message.type === 'GET_QUEUE') {
      sendResponse({ queue });
      return true;
    }

    if (message.type === 'START_QUEUE') {
      const { prompts, tabId } = message;
      activeTabId = tabId;

      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const sessionFolder = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

      const newItems: QueueItem[] = prompts.map((p: { scene_number: number; prompt: string }) => ({
        id: Math.random().toString(36).substring(2, 9),
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
      broadcastQueue();
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'BATCH_DETECTED') {
      handleBatchResponse(message.data);
      return true;
    }

    if (message.type === 'TEST_FIND_FAVORITE') {
      console.log('=> Recibido TEST_FIND_FAVORITE para tabId:', message.tabId);
      chrome.scripting.executeScript({
        target: { tabId: message.tabId },
        world: 'MAIN',
        func: () => {
          console.log('[TEST 1] Ejecutando script de busqueda...');
          const tiles = Array.from(document.querySelectorAll('[data-tile-id]'));
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
          const tiles = Array.from(document.querySelectorAll('[data-tile-id]'));
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

  batchMedia.forEach((m: any, idx: number) => {
    const mediaId = m?.image?.generatedImage?.mediaId ?? m?.name;
    const textInput = m?.image?.generatedImage?.requestData?.promptInputs?.[0]?.textInput;
    console.log(`    [${idx}] mediaId: ${mediaId}, textInput: "${textInput?.slice(0, 40)}"`);
  });

  const promptFromResponse: string | undefined =
    batchMedia[0]?.image?.generatedImage?.requestData?.promptInputs?.[0]?.textInput
    ?? batchMedia[0]?.image?.generatedImage?.prompt
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
    .filter(v => v.sceneNumber === target.scene_number).length;

  batchMedia.forEach((m: any, idx: number) => {
    const mediaId: string | undefined = m?.image?.generatedImage?.mediaId ?? m?.name;
    if (mediaId && !mediaIdToScene.has(mediaId)) {
      const imageIndex = alreadyMapped + idx + 1;
      mediaIdToScene.set(mediaId, { sceneNumber: target.scene_number, imageIndex, sessionFolder: target.session_folder });
      console.log(`    mapped mediaId ${mediaId} → scene ${target.scene_number} img ${imageIndex}`);
    }
  });
}

function broadcastQueue() {
  browser.runtime.sendMessage({ type: 'QUEUE_UPDATED', queue }).catch(() => { });
}

let isInitialized = false;

async function initializeKnownIdsAndStart(tabId: number) {
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
        Array.from(document.querySelectorAll('[data-tile-id]'))
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

  isInjecting = true;
  nextPending.status = 'IN_PROGRESS';
  broadcastQueue();

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
              return text.includes('añadir a la petición') || text.includes('add to prompt') || text.includes('use as reference');
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
    // Do NOT call processQueue() here — next injection happens only after
    // the current scene's images are confirmed downloaded in the UI (DOWNLOADED status)
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
      return;
    }

    if (!activeTabId) return;

    try {
      const [{ result: scanResult }] = await chrome.scripting.executeScript({
        target: { tabId: activeTabId },
        func: () => {
          const tiles: [string, string][] = [];
          const rateLimitTileIds: string[] = [];

          document.querySelectorAll('[data-tile-id]').forEach(t => {
            const id = t.getAttribute('data-tile-id');
            if (!id) return;

            const img = t.querySelector('img') as HTMLImageElement;
            if (img?.src && !img.src.includes('data:image')) {
              tiles.push([id, img.src.startsWith('/') ? location.origin + img.src : img.src]);
              return;
            }

            // Detect rate limit error tiles — look for the error text (robust vs obfuscated class names)
            if (t.textContent?.includes('too quickly')) {
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

      // Handle rate limit errors
      if (rateLimitTileIds.length > 0) {
        console.warn(`[RATE LIMIT] detected ${rateLimitTileIds.length} failed tile(s) — cooling down ${RATE_LIMIT_COOLDOWN_MS / 1000}s`);
        rateLimitCooldownUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;

        // Mark affected IN_PROGRESS scenes as RATE_LIMITED so they re-enter the queue after cooldown
        const affectedScenes = queue.filter(q => q.status === 'IN_PROGRESS');
        affectedScenes.forEach(q => {
          q.status = 'RATE_LIMITED';
          console.log(`[RATE LIMIT] scene ${q.scene_number} marked as RATE_LIMITED — will retry after cooldown`);
        });

        broadcastQueue();

        // Schedule processQueue to run after cooldown expires
        setTimeout(() => {
          queue.filter(q => q.status === 'RATE_LIMITED').forEach(q => {
            q.status = 'PENDING';
          });
          broadcastQueue();
          processQueue();
        }, RATE_LIMIT_COOLDOWN_MS);
      }

      const newTiles = currentTiles.filter(([id, imgUrl]) => {
        if (downloadedTileIds.has(id)) return false;
        const uuid = imgUrl.match(/[?&]name=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)?.[1];
        if (uuid && downloadedTileIds.has(uuid)) return false;
        return true;
      });

      for (const [tileId, imgUrl] of newTiles) {
        const uuidFromUrl = imgUrl.match(/[?&]name=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)?.[1];

        // Guard: another tile earlier in this same loop may have already claimed this uuid
        if (downloadedTileIds.has(tileId)) continue;
        if (uuidFromUrl && downloadedTileIds.has(uuidFromUrl)) continue;

        const mapping = uuidFromUrl ? mediaIdToScene.get(uuidFromUrl) : undefined;

        if (!mapping) {
          console.log(`[POLL] tile ${tileId} | imgSrc: ${imgUrl.slice(0, 100)} | urlUuid: ${uuidFromUrl ?? 'none'} | no mapping yet, waiting`);
          continue;
        }

        downloadedTileIds.add(tileId);
        if (uuidFromUrl) downloadedTileIds.add(uuidFromUrl); // needed for checkSceneComplete lookup
        const paddedScene = mapping.sceneNumber.toString().padStart(2, '0');

        let filename = `Flow_Generations/${mapping.sessionFolder}/`;
        if (IMAGES_PER_SCENE === 1) {
          filename += `scene_${paddedScene}.png`;
        } else {
          filename += `scene_${paddedScene}/scene_${mapping.imageIndex}.png`;
        }

        browser.downloads.download({
          url: imgUrl,
          filename: filename,
          saveAs: false,
        }).catch(err => console.error('[DOWNLOAD] error', err));

        console.log(`[DOWNLOAD] scene ${mapping.sceneNumber} img ${mapping.imageIndex} (tileId: ${tileId} | urlUuid: ${uuidFromUrl})`);

        const sceneItem = queue.find(q => q.scene_number === mapping.sceneNumber && q.status === 'IN_PROGRESS');
        if (sceneItem) {
          const sceneMediaIds = [...mediaIdToScene.entries()]
            .filter(([, v]) => v.sceneNumber === mapping.sceneNumber)
            .map(([k]) => k);

          if (sceneMediaIds.length >= IMAGES_PER_SCENE && sceneMediaIds.every(mid => downloadedTileIds.has(mid))) {
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

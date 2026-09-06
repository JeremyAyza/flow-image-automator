import { browser } from 'wxt/browser';
import { queue } from '../queue/queue.service';
import { broadcastQueue } from '../queue/queue.service';
import { downloadedTileIds, mediaIdToScene, processQueue } from '../automation/automation.engine';
import { IMAGES_PER_SCENE } from '../queue/queue.types';
import { produce } from 'immer';

// ── tRPC unwrapper ────────────────────────────────────────────────────────────

function unwrapTrpc(raw: unknown): Record<string, unknown> {
  const r = raw as any;
  if (Array.isArray(r)) {
    for (const item of r) {
      const inner = item?.result?.data?.json ?? item?.result?.data;
      if (inner?.workflows || inner?.media) return inner;
    }
  }
  if (r?.result?.data?.json?.workflows || r?.result?.data?.json?.media) return r.result.data.json;
  if (r?.result?.data?.workflows || r?.result?.data?.media) return r.result.data;
  return r;
}

// ── Matching de respuestas del batch ──────────────────────────────────────────

function processBatchMedia(batchMedia: any[], fallbackDisplayName?: string) {
  if (batchMedia.length === 0) return;
  const gen = batchMedia[0]?.image?.generatedImage;
  const promptFromResponse: string | undefined =
    gen?.requestData?.promptInputs?.[0]?.textInput ?? gen?.prompt ?? fallbackDisplayName;

  const target = promptFromResponse
    ? queue.find(q => q.status === 'IN_PROGRESS' && promptFromResponse.includes(q.prompt))
    : undefined;

  if (!target) { console.warn(`[BATCH] no match — "${promptFromResponse?.slice(0, 60)}"`); return; }
  console.log(`[BATCH] matched → scene ${target.scene_number}`);

  const alreadyMapped = [...mediaIdToScene.values()].filter(v => v.sceneNumber === target.scene_number && v.sessionFolder === target.session_folder).length;
  batchMedia.forEach((m: any, idx: number) => {
    const mediaId = m?.image?.generatedImage?.mediaId ?? m?.name;
    const fifeUrl = m?.image?.generatedImage?.fifeUrl;
    if (mediaId && !mediaIdToScene.has(mediaId)) {
      mediaIdToScene.set(mediaId, { sceneNumber: target.scene_number, imageIndex: alreadyMapped + idx + 1, sessionFolder: target.session_folder, fifeUrl });
    }
  });
}

export function handleBatchResponse(raw: unknown) {
  console.log('=== [FLOW] FULL BATCH RESPONSE PAYLOAD ===');
  console.log(JSON.stringify(raw, null, 2));
  try {
    const data = unwrapTrpc(raw);
    const workflows: any[] = (data as any)?.workflows ?? [];
    const mediaItems: any[] = (data as any)?.media ?? [];
    console.log(`[BATCH] ${workflows.length} workflow(s), ${mediaItems.length} media item(s)`);

    if (workflows.length > 0) {
      for (const wf of workflows) {
        if (!wf?.metadata?.batchId) continue;
        const batchMedia = mediaItems.filter(m => m?.image?.generatedImage?.workflowId === wf.name || m?.workflowId === wf.name);
        processBatchMedia(batchMedia, wf.metadata?.displayName);
      }
    } else if (mediaItems.length > 0) {
      processBatchMedia(mediaItems, undefined);
    }
    broadcastQueue();
  } catch (e) { console.error('[BATCH] error', e); }
}

// ── Descarga de tiles nuevos ──────────────────────────────────────────────────

export function handleNewTiles(currentTiles: [string, string][]) {
  const newTiles = currentTiles.filter(([id, imgUrl]) => {
    if (downloadedTileIds.has(id)) return false;
    const uuid = imgUrl.match(/(?:[?&]name=|\/image\/)([0-9a-f-]{36})/i)?.[1];
    return !(uuid && downloadedTileIds.has(uuid));
  });

  for (const [tileId, imgUrl] of newTiles) {
    const uuid = imgUrl.match(/(?:[?&]name=|\/image\/)([0-9a-f-]{36})/i)?.[1];
    if (downloadedTileIds.has(tileId) || (uuid && downloadedTileIds.has(uuid))) continue;

    let mapping = (uuid ? mediaIdToScene.get(uuid) : undefined) || mediaIdToScene.get(tileId);

    // Fallback: si la respuesta tRPC / red no fue interceptada, asociar directamente a la escena IN_PROGRESS
    if (!mapping) {
      const inProgressItem = queue.find(q => q.status === 'IN_PROGRESS');
      if (inProgressItem) {
        const alreadyCount = [...mediaIdToScene.values()].filter(
          v => v.sceneNumber === inProgressItem.scene_number && v.sessionFolder === inProgressItem.session_folder
        ).length;
        mapping = {
          sceneNumber: inProgressItem.scene_number,
          imageIndex: alreadyCount + 1,
          sessionFolder: inProgressItem.session_folder,
          tileId,
        };
        mediaIdToScene.set(tileId, mapping);
        if (uuid) mediaIdToScene.set(uuid, mapping);
        console.log(`[POLL] Fallback mapping tile ${tileId} → Scene ${inProgressItem.scene_number} (img ${alreadyCount + 1})`);
      }
    }

    if (!mapping) {
      console.log(`[POLL] tile ${tileId} — sin mapping ni escena en progreso`);
      continue;
    }

    mapping.tileId = tileId;
    downloadedTileIds.add(tileId);
    if (uuid) downloadedTileIds.add(uuid);

    let filename = `Flow_Generations/${mapping.sessionFolder}/`;
    if (mapping.sceneNumber === 0) filename += 'thumbnail.png';
    else if (IMAGES_PER_SCENE === 1) filename += `scene_${mapping.sceneNumber}.png`;
    else filename += `scene_${mapping.sceneNumber}/scene_${mapping.imageIndex}.png`;

    const finalUrl = mapping.fifeUrl ?? imgUrl;
    browser.downloads.download({ url: finalUrl, filename, saveAs: false }).catch(e => console.error('[DOWNLOAD] error', e));
    console.log(`[DOWNLOAD] scene ${mapping.sceneNumber} img ${mapping.imageIndex} (${finalUrl.slice(0, 60)}...)`);

    const sceneItem = queue.find(q => q.scene_number === mapping.sceneNumber && q.session_folder === mapping.sessionFolder && q.status === 'IN_PROGRESS');
    if (sceneItem) {
      const downloadedForScene = [...mediaIdToScene.values()].filter(
        v => v.sceneNumber === mapping.sceneNumber &&
             v.sessionFolder === mapping.sessionFolder &&
             v.tileId &&
             downloadedTileIds.has(v.tileId)
      ).length;

      if (downloadedForScene >= IMAGES_PER_SCENE) {
        // mutate via service
        import('../queue/queue.service').then(({ markStatus }) => {
          markStatus(sceneItem.id, 'DOWNLOADED');
          broadcastQueue();
          processQueue();
        });
      }
    }
  }
}

// ── Limpieza de imágenes ──────────────────────────────────────────────────────

export function cleanupImages(tabId: number, tileIds: string[]) {
  console.log(`[CLEANUP] Borrando ${tileIds.length} imágenes...`);
  chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: async (ids: string[]) => {
      let count = 0;
      for (const id of ids) {
        const tile = (
          document.querySelector(`img[data-media-id="${id}"]`)?.closest('flow-grid-tile-container, flow-image-tile') ??
          document.querySelector(`[data-tile-id="${id}"]:has(img):not(:has([data-tile-id]))`) ??
          document.querySelector(`img[data-media-id="${id}"]`)
        ) as HTMLElement;
        if (!tile) continue;
        tile.style.border = '5px solid red'; tile.style.boxSizing = 'border-box';
        const el = tile.querySelector('img') || tile;
        const rect = el.getBoundingClientRect();
        const opts = { bubbles: true, cancelable: true, clientX: rect.left + 25, clientY: rect.top + 25, ctrlKey: true, metaKey: true };
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
        count++;
        await new Promise(r => setTimeout(r, 300));
      }
      if (count > 0) {
        const ev = new KeyboardEvent('keydown', { key: 'Delete', code: 'Delete', keyCode: 46, bubbles: true, cancelable: true });
        const first = (
          document.querySelector(`img[data-media-id="${ids[0]}"]`)?.closest('flow-grid-tile-container, flow-image-tile') ??
          document.querySelector(`[data-tile-id="${ids[0]}"]:has(img):not(:has([data-tile-id]))`)
        );
        (first ?? document).dispatchEvent(ev);
        const scroller = document.querySelector('.virtual-scroll-container, [data-testid="virtuoso-item-list"]');
        (scroller?.parentElement ?? scroller)?.dispatchEvent(ev);
        console.log('[CLEANUP] Done');
      }
    },
    args: [tileIds],
  }).catch(e => console.error('[CLEANUP] error', e));
}

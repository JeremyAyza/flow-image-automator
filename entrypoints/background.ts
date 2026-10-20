import { browser } from 'wxt/browser';
import { queue, setActiveTabId, addToQueue, clearQueue, broadcastQueue } from '../src/queue/queue.service';
import { knownRateLimitTileIds, mediaIdToScene, initializeAndStart, resetEngineState } from '../src/automation/automation.engine';
import { handleBatchResponse } from '../src/media/media.service';
import {
  scriptDetectTiles, scriptLogMediaIds,
  scriptFindFavorite, scriptRightClick, scriptClickAdd,
  scriptFindEditor, scriptFindSendBtn,
  scriptScroll, scriptSelectLastThree, scriptDeleteSelected,
  scriptSetFormatVertical, scriptSetFormatHorizontal, scriptSetFormatVideo,
} from '../src/automation/automation.scripts';
import { ScriptScene } from '../src/shared/script.schemas';
import { parseImagePromptToText } from '../src/shared/script.parser';

export default defineBackground(() => {
  console.log('Flow Background Queue Orchestrator Started');

  // Registrar el inyector en el MAIN world
  chrome.scripting.registerContentScripts([{
    id: 'flow-injector',
    matches: ['*://labs.google/*', '*://flow.google.com/*'],
    js: ['injector.js'],
    world: 'MAIN',
    runAt: 'document_start',
  }]).catch(() => {
    chrome.scripting.updateContentScripts([{
      id: 'flow-injector',
      matches: ['*://labs.google/*', '*://flow.google.com/*'],
      js: ['injector.js'],
      world: 'MAIN',
      runAt: 'document_start',
    }]).catch(e => console.error('[INJECTOR] update failed:', e));
  });

  // ── Handlers de mensajes ────────────────────────────────────────────────────

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
      const { prompts, tabId, scriptName } = message;
      setActiveTabId(tabId);
      const sessionFolder = `${scriptName}_${Date.now()}`;
      addToQueue(prompts.map((p: { scene_number: number; prompt: string }) => ({
        script_name: scriptName,
        scene_number: p.scene_number,
        prompt: p.prompt,
        session_folder: sessionFolder,
      })));
      broadcastQueue();
      initializeAndStart(tabId);
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'CLEAR_QUEUE') {
      clearQueue();
      resetEngineState();
      broadcastQueue();
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'BATCH_DETECTED') {
      handleBatchResponse(message.data);
      return true;
    }

    // ── Debug handlers ──────────────────────────────────────────────────────
    const debugActions: Record<string, (tabId: number) => void> = {
      TEST_DETECT_TILES: scriptDetectTiles,
      TEST_LOG_MEDIA_IDS: scriptLogMediaIds,
      TEST_FIND_FAVORITE: scriptFindFavorite,
      TEST_RIGHT_CLICK: scriptRightClick,
      TEST_CLICK_ADD: scriptClickAdd,
      TEST_FIND_EDITOR: scriptFindEditor,
      TEST_FIND_SEND_BTN: scriptFindSendBtn,
      TEST_SCROLL: scriptScroll,
      TEST_SELECT_LAST_THREE: scriptSelectLastThree,
      TEST_DELETE_SELECTED: scriptDeleteSelected,
      TEST_SET_FORMAT_VERTICAL: scriptSetFormatVertical,
      TEST_SET_FORMAT_HORIZONTAL: scriptSetFormatHorizontal,
      TEST_SET_FORMAT_VIDEO: scriptSetFormatVideo,
    };
    if (debugActions[message.type]) {
      console.log(`=> Recibido ${message.type} para tabId:`, message.tabId);
      debugActions[message.type](message.tabId);
      return true;
    }
  });
});

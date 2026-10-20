export default defineContentScript({
  matches: ['*://labs.google/*', '*://flow.google.com/*'],
  runAt: 'document_start',
  main() {
    console.log('[FLOW-EXT] Content script loaded (isolated world)');

    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (event.data?.type !== 'FLOW_BATCH_RESPONSE') return;

      console.log('[FLOW-EXT] Forwarding FLOW_BATCH_RESPONSE to background');
      chrome.runtime.sendMessage({
        type: 'BATCH_DETECTED',
        data: event.data.data
      }).catch(() => { });
    });
  },
});

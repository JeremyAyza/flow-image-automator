import { FlowDOM } from '../src/automation/flow-dom';

export default defineContentScript({
  matches: ['*://*.google.com/*', '*://labs.google/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    (window as any).__FLOW_DOM__ = FlowDOM;
    console.log('[FLOW-EXT] Injector running in MAIN world — FlowDOM installed');

    // --- Fetch interceptor ---
    const _originalFetch = window.fetch;
    window.fetch = async function (...args: Parameters<typeof fetch>) {
      let url = '';
      if (typeof args[0] === 'string') {
        url = args[0];
      } else if (args[0] instanceof URL) {
        url = args[0].href;
      } else if (args[0] && typeof (args[0] as any).url === 'string') {
        url = (args[0] as any).url;
      }

      // Log every fetch so we can confirm the interceptor is running
      console.log('[FLOW-EXT] fetch:', url.slice(0, 120));

      const response = await _originalFetch.apply(window, args);

      // Intercept tRPC or API calls that may contain batch/media generation info
      if (url.includes('/trpc/') || url.includes('/api/') || url.includes('batchGenerateImages') || url.includes('generate')) {
        response.clone().text().then((text: string) => {
          if (!text.includes('batchId') && !text.includes('mediaId') && !text.includes('workflowId')) return;
          console.log('[FLOW-EXT] response with batch/media info from:', url.slice(0, 120));
          console.log('[FLOW-EXT] response body (first 500):', text.slice(0, 500));
          // Try flat JSON first, then NDJSON
          try {
            const data = JSON.parse(text);
            window.postMessage({ type: 'FLOW_BATCH_RESPONSE', data }, '*');
          } catch {
            text.split('\n').filter(l => l.trim()).forEach(line => {
              try {
                const data = JSON.parse(line);
                if (JSON.stringify(data).includes('batchId') || JSON.stringify(data).includes('mediaId')) {
                  window.postMessage({ type: 'FLOW_BATCH_RESPONSE', data }, '*');
                }
              } catch {}
            });
          }
        }).catch(() => {});
      }

      return response;
    };

    // --- XHR interceptor ---
    const _originalOpen = XMLHttpRequest.prototype.open;
    const _originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method: string, url: string, ...rest: any[]) {
      (this as any)._flowUrl = url;
      return _originalOpen.apply(this, [method, url, ...rest] as any);
    };

    XMLHttpRequest.prototype.send = function (...args: any[]) {
      if ((this as any)._flowUrl?.includes('batchGenerateImages')) {
        console.log('[FLOW-EXT] batchGenerateImages XHR detected:', (this as any)._flowUrl);
        this.addEventListener('load', function (this: XMLHttpRequest) {
          try {
            const data = JSON.parse(this.responseText);
            console.log('[FLOW-EXT] batchGenerateImages XHR response:', JSON.stringify(data).slice(0, 500));
            window.postMessage({ type: 'FLOW_BATCH_RESPONSE', data }, '*');
          } catch (e) {
            console.warn('[FLOW-EXT] batchGenerateImages XHR response is not JSON:', e);
          }
        });
      }
      return _originalSend.apply(this, args as [body?: Document | XMLHttpRequestBodyInit | null]);
    };

    console.log('[FLOW-EXT] fetch/XHR interceptors installed');
  },
});

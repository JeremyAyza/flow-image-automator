import { useEffect } from 'react';
import { useAppStore } from './useAppStore';
import { browser } from 'wxt/browser';

/**
 * Obtiene el tabId de la pestaña actual preguntándole al background.
 * En Content Scripts, chrome.tabs no está disponible, por eso lo delegamos.
 * El resultado queda cacheado en el store para no hacer múltiples requests.
 */
export const useTabId = () => {
  const { tabId, setTabId } = useAppStore();

  useEffect(() => {
    if (tabId) return;
    browser.runtime.sendMessage({ type: 'GET_TAB_ID' })
      .then((res: { tabId: number }) => { if (res?.tabId) setTabId(res.tabId); })
      .catch(console.error);
  }, [tabId, setTabId]);

  return tabId;
};

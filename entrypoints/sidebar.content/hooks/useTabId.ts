import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { browser } from 'wxt/browser';

/**
 * Resuelve el tabId de la pestaña actual preguntándole al background.
 * En Content Scripts, chrome.tabs no está disponible, por eso delegamos al background
 * que lo conoce vía sender.tab.id.
 */
export const useTabId = () => {
  const { tabId, setTabId } = useAppStore();

  useEffect(() => {
    if (tabId) return; // Ya lo tenemos
    browser.runtime.sendMessage({ type: 'GET_TAB_ID' })
      .then((res: { tabId: number }) => {
        if (res?.tabId) setTabId(res.tabId);
      })
      .catch(console.error);
  }, [tabId, setTabId]);

  return tabId;
};

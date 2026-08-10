import React from 'react';
import { browser } from 'wxt/browser';
import { useTabId } from '../hooks/useTabId';

export const DebugPanel = () => {
  const tabId = useTabId();

  const send = (type: string) => {
    if (!tabId) return;
    browser.runtime.sendMessage({ type, tabId });
  };

  const btnClass = "flex-1 text-[10px] p-1 rounded bg-gray-800 border border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors";
  const dangerBtnClass = "flex-1 text-[10px] p-1 rounded bg-red-900/30 border border-red-800 text-red-400 hover:bg-red-900/50 hover:border-red-700 transition-colors";

  return (
    <div className="flex flex-col gap-1 mt-1">
      <div className="flex gap-1">
        <button onClick={() => send('TEST_SCROLL')} className={btnClass}>0. Scroll</button>
        <button onClick={() => send('TEST_FIND_FAVORITE')} className={btnClass}>1. Find Fav</button>
        <button onClick={() => send('TEST_RIGHT_CLICK')} className={btnClass}>2. Right Click</button>
        <button onClick={() => send('TEST_CLICK_ADD')} className={btnClass}>3. Click Add</button>
      </div>
      <div className="flex gap-1">
        <button onClick={() => send('TEST_SELECT_LAST_THREE')} className={dangerBtnClass}>4. Test Last 3</button>
        <button onClick={() => send('TEST_DELETE_SELECTED')} className={dangerBtnClass}>5. Test Delete</button>
      </div>
    </div>
  );
};

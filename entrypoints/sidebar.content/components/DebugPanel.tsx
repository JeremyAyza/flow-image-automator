import React from 'react';
import { browser } from 'wxt/browser';

export const DebugPanel = () => {
  const handleTestScroll = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.id) browser.runtime.sendMessage({ type: 'TEST_SCROLL', tabId: tab.id });
  };
  
  const handleTestFind = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.id) browser.runtime.sendMessage({ type: 'TEST_FIND_FAVORITE', tabId: tab.id });
  };
  
  const handleTestRightClick = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.id) browser.runtime.sendMessage({ type: 'TEST_RIGHT_CLICK', tabId: tab.id });
  };
  
  const handleTestClickAdd = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.id) browser.runtime.sendMessage({ type: 'TEST_CLICK_ADD', tabId: tab.id });
  };

  const handleTestSelectLastThree = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.id) browser.runtime.sendMessage({ type: 'TEST_SELECT_LAST_THREE', tabId: tab.id });
  };

  const handleTestDelete = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.id) browser.runtime.sendMessage({ type: 'TEST_DELETE_SELECTED', tabId: tab.id });
  };

  const btnClass = "flex-1 text-[10px] p-1 rounded bg-gray-800 border border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors";
  const dangerBtnClass = "flex-1 text-[10px] p-1 rounded bg-red-900/30 border border-red-800 text-red-400 hover:bg-red-900/50 hover:border-red-700 transition-colors";

  return (
    <div className="flex flex-col gap-1 mt-1">
      <div className="flex gap-1">
        <button onClick={handleTestScroll} className={btnClass}>0. Scroll</button>
        <button onClick={handleTestFind} className={btnClass}>1. Find Fav</button>
        <button onClick={handleTestRightClick} className={btnClass}>2. Right Click</button>
        <button onClick={handleTestClickAdd} className={btnClass}>3. Click Add</button>
      </div>
      <div className="flex gap-1">
        <button onClick={handleTestSelectLastThree} className={dangerBtnClass}>4. Test Last 3</button>
        <button onClick={handleTestDelete} className={dangerBtnClass}>5. Test Delete</button>
      </div>
    </div>
  );
};


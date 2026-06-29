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

  return (
    <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
      <button onClick={handleTestScroll} style={{ flex: 1, fontSize: '10px', padding: '4px', borderRadius: '4px', background: '#f1f3f4', border: '1px solid #dadce0', cursor: 'pointer' }}>0. Scroll</button>
      <button onClick={handleTestFind} style={{ flex: 1, fontSize: '10px', padding: '4px', borderRadius: '4px', background: '#f1f3f4', border: '1px solid #dadce0', cursor: 'pointer' }}>1. Find Fav</button>
      <button onClick={handleTestRightClick} style={{ flex: 1, fontSize: '10px', padding: '4px', borderRadius: '4px', background: '#f1f3f4', border: '1px solid #dadce0', cursor: 'pointer' }}>2. Right Click</button>
      <button onClick={handleTestClickAdd} style={{ flex: 1, fontSize: '10px', padding: '4px', borderRadius: '4px', background: '#f1f3f4', border: '1px solid #dadce0', cursor: 'pointer' }}>3. Click Add</button>
    </div>
  );
};

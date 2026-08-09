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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
      <div style={{ display: 'flex', gap: '4px' }}>
        <button onClick={handleTestScroll} style={{ flex: 1, fontSize: '10px', padding: '4px', borderRadius: '4px', background: '#f1f3f4', border: '1px solid #dadce0', cursor: 'pointer' }}>0. Scroll</button>
        <button onClick={handleTestFind} style={{ flex: 1, fontSize: '10px', padding: '4px', borderRadius: '4px', background: '#f1f3f4', border: '1px solid #dadce0', cursor: 'pointer' }}>1. Find Fav</button>
        <button onClick={handleTestRightClick} style={{ flex: 1, fontSize: '10px', padding: '4px', borderRadius: '4px', background: '#f1f3f4', border: '1px solid #dadce0', cursor: 'pointer' }}>2. Right Click</button>
        <button onClick={handleTestClickAdd} style={{ flex: 1, fontSize: '10px', padding: '4px', borderRadius: '4px', background: '#f1f3f4', border: '1px solid #dadce0', cursor: 'pointer' }}>3. Click Add</button>
      </div>
      <div style={{ display: 'flex', gap: '4px' }}>
        <button onClick={handleTestSelectLastThree} style={{ flex: 1, fontSize: '10px', padding: '4px', borderRadius: '4px', background: '#ffebee', border: '1px solid #ffcdd2', cursor: 'pointer', color: '#c62828' }}>4. Test Last 3</button>
        <button onClick={handleTestDelete} style={{ flex: 1, fontSize: '10px', padding: '4px', borderRadius: '4px', background: '#ffebee', border: '1px solid #ffcdd2', cursor: 'pointer', color: '#c62828' }}>5. Test Delete</button>
      </div>
    </div>
  );
};

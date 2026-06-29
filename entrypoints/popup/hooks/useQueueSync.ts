import { useEffect } from 'react';
import { browser } from 'wxt/browser';
import { useAppStore } from '../store/useAppStore';

export const useQueueSync = () => {
  const { setQueue, setCountdown } = useAppStore();

  useEffect(() => {
    browser.runtime.sendMessage({ type: 'GET_QUEUE' }).then(res => {
      if (res && res.queue) {
        setQueue(res.queue);
      }
    });

    const listener = (message: any) => {
      if (message.type === 'QUEUE_UPDATED') {
        setQueue(message.queue);
      }
      if (message.type === 'COUNTDOWN') {
        if (message.message) {
          setCountdown({ message: message.message, secondsLeft: message.secondsLeft });
        } else {
          setCountdown(null);
        }
      }
    };
    browser.runtime.onMessage.addListener(listener);
    
    return () => {
      browser.runtime.onMessage.removeListener(listener);
    };
  }, [setQueue, setCountdown]);
};

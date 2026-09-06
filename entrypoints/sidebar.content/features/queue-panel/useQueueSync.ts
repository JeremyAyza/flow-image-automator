import { useEffect } from 'react';
import { useAppStore } from '../../shared/useAppStore';
import { browser } from 'wxt/browser';

export const useQueueSync = () => {
  const { setQueue, setCountdown } = useAppStore();

  useEffect(() => {
    browser.runtime.sendMessage({ type: 'GET_QUEUE' })
      .then((res: any) => { if (res?.queue) setQueue(res.queue); })
      .catch(() => {});

    const listener = (message: any) => {
      if (message.type === 'QUEUE_UPDATED') {
        setQueue(message.queue);
      } else if (message.type === 'COUNTDOWN') {
        if (message.message) {
          setCountdown({ message: message.message, secondsLeft: message.secondsLeft });
        } else {
          setCountdown(null);
        }
      }
    };

    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, [setQueue, setCountdown]);
};

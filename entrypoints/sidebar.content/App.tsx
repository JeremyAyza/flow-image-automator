import React, { useEffect } from 'react';
import { useAppStore } from './shared/useAppStore';
import { useQueueSync } from './features/queue-panel/useQueueSync';
import { ControlPanel } from './features/queue-control/ControlPanel';
import { QueuePanel } from './features/queue-panel/QueuePanel';
import { DebugPanel } from './features/debug/DebugPanel';

const SIDEBAR_WIDTH = 360;

function App() {
  useQueueSync();
  const { error } = useAppStore();

  useEffect(() => {
    const appRoot = document.querySelector('aisandbox-root') as HTMLElement;
    if (appRoot) {
      const originalTransform = appRoot.style.transform;
      const originalWidth = appRoot.style.width;
      const originalTransition = appRoot.style.transition;

      appRoot.style.width = `calc(100vw - ${SIDEBAR_WIDTH}px)`;
      appRoot.style.transform = `translateX(${SIDEBAR_WIDTH}px)`;
      appRoot.style.transition = 'transform 0.3s ease, width 0.3s ease';

      return () => {
        appRoot.style.transform = originalTransform;
        appRoot.style.width = originalWidth;
        appRoot.style.transition = originalTransition;
      };
    }
  }, []);

  return (
    <div
      className="fixed top-0 left-0 h-screen z-[9999] bg-gray-900 text-gray-200 flex flex-col font-sans border-r border-gray-700 shadow-2xl overflow-hidden"
      style={{ width: `${SIDEBAR_WIDTH}px` }}
    >
      {/* Header Inline */}
      <div className="p-3 border-b border-gray-700 bg-gray-800 shrink-0">
        <div className="flex justify-between items-center mb-2">
          <h2 className="m-0 text-base font-semibold text-blue-400">Flow Script Processor</h2>
        </div>
      </div>

      {/* Body scrollable */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        <ControlPanel />
        <DebugPanel />

        {error && (
          <p className="m-0 text-xs text-red-400 text-center font-medium">
            {error}
          </p>
        )}

        <QueuePanel />
      </div>
    </div>
  );
}

export default App;

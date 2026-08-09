import React, { useEffect } from 'react';
import { useAppStore } from './store/useAppStore';
import { useQueueSync } from './hooks/useQueueSync';
import { Header } from './components/Header';
import { ControlPanel } from './components/ControlPanel';
import { ProgressBar } from './components/ProgressBar';
import { QueueList } from './components/QueueList';
import { DebugPanel } from './components/DebugPanel';

const SIDEBAR_WIDTH = 360;

function App() {
  useQueueSync();
  const { error } = useAppStore();

  useEffect(() => {
    const originalMargin = document.documentElement.style.marginLeft;
    document.documentElement.style.marginLeft = `${SIDEBAR_WIDTH}px`;
    document.documentElement.style.transition = 'margin-left 0.3s ease';
    return () => {
      document.documentElement.style.marginLeft = originalMargin;
    };
  }, []);

  return (
    <div
      className="fixed top-0 left-0 h-screen z-[9999] bg-gray-900 text-gray-200 flex flex-col font-sans border-r border-gray-700 shadow-2xl overflow-hidden"
      style={{ width: `${SIDEBAR_WIDTH}px` }}
    >
      {/* Header */}
      <div className="p-3 border-b border-gray-700 bg-gray-800 shrink-0">
        <Header />
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

        <ProgressBar />
        <QueueList />
      </div>
    </div>
  );
}

export default App;



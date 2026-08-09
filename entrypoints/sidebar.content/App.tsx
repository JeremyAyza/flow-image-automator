import React from 'react';
import { useAppStore } from './store/useAppStore';
import { useQueueSync } from './hooks/useQueueSync';
import { Header } from './components/Header';
import { ControlPanel } from './components/ControlPanel';
import { ProgressBar } from './components/ProgressBar';
import { QueueList } from './components/QueueList';
import { DebugPanel } from './components/DebugPanel';

function App() {
  // Inicializa la sincronización con el service worker
  useQueueSync();

  const { error } = useAppStore();

  return (
    <div className="h-full w-full bg-gray-900 text-gray-200 p-4 flex flex-col gap-4 font-sans overflow-y-auto">
      <Header />
      
      <div className="flex flex-col gap-3">
        <ControlPanel />
        <DebugPanel />
      </div>

      {error && (
        <p className="m-0 text-xs text-red-500 text-center font-medium">
          {error}
        </p>
      )}

      <ProgressBar />
      
      <QueueList />
    </div>
  );
}

export default App;


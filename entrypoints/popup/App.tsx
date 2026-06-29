import React from 'react';
import { useAppStore } from './store/useAppStore';
import { useQueueSync } from './hooks/useQueueSync';
import { Header } from './components/Header';
import { ControlPanel } from './components/ControlPanel';
import { ProgressBar } from './components/ProgressBar';
import { QueueList } from './components/QueueList';
import { DebugPanel } from './components/DebugPanel';
import './App.css';

function App() {
  // Inicializa la sincronización con el service worker
  useQueueSync();

  const { error } = useAppStore();

  return (
    <div style={{ padding: '12px', width: '500px', display: 'flex', flexDirection: 'column', gap: '12px', fontFamily: 'inherit' }}>
      <Header />
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <ControlPanel />
        <DebugPanel />
      </div>

      {error && (
        <p style={{ margin: 0, fontSize: '11px', color: '#d93025', textAlign: 'center' }}>
          {error}
        </p>
      )}

      <ProgressBar />
      
      <QueueList />
    </div>
  );
}

export default App;

import { useState, useEffect } from 'react';
import { browser } from 'wxt/browser';
import { QueueItem, ScriptData, ScriptScene, SCENE_TIMEOUT_MS, SCENE_TIMEOUT_MINUTES } from '../../utils/types';
import { parseImagePromptToText } from '../../utils/parser';
import './App.css';

function App() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [error, setError] = useState('');
  const [parsedScenes, setParsedScenes] = useState<{ scene_number: number, prompt: string }[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [inputType, setInputType] = useState<'file' | 'text'>('file');
  const [jsonText, setJsonText] = useState('');
  const [scriptName, setScriptName] = useState('');
  const [countdown, setCountdown] = useState<{ message: string, secondsLeft: number } | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());

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
    
    const int = setInterval(() => setNowTick(Date.now()), 1000);
    
    return () => {
      browser.runtime.onMessage.removeListener(listener);
      clearInterval(int);
    };
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string) as ScriptData;
        if (!json.scenes || !Array.isArray(json.scenes)) {
          setError('El archivo JSON no tiene el formato esperado (falta el array "scenes").');
          return;
        }

        const prepared = json.scenes.map(scene => ({
          scene_number: scene.scene_number,
          prompt: parseImagePromptToText(scene.image_prompt)
        }));

        setParsedScenes(prepared);
        setError('');
      } catch (err) {
        console.error(err);
        setError('Error al leer el archivo JSON.');
      }
    };
    reader.readAsText(file);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setJsonText(text);
    if (!text.trim()) {
      setParsedScenes([]);
      setError('');
      return;
    }
    try {
      const json = JSON.parse(text) as ScriptData;
      if (!json.scenes || !Array.isArray(json.scenes)) {
        setError('El JSON no tiene el formato esperado (falta "scenes").');
        setParsedScenes([]);
        return;
      }
      const prepared = json.scenes.map(scene => ({
        scene_number: scene.scene_number,
        prompt: parseImagePromptToText(scene.image_prompt)
      }));
      setParsedScenes(prepared);
      setError('');
    } catch (err) {
      setError('JSON inválido.');
      setParsedScenes([]);
    }
  };

  const handleStartQueue = async () => {
    if (!scriptName.trim()) {
      setError('Por favor, ingresa un nombre para el script.');
      return;
    }
    if (parsedScenes.length === 0) {
      setError('Por favor, ingresa un JSON válido primero.');
      return;
    }

    setError('');
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) {
        setError('Error: No active tab found.');
        return;
      }

      await browser.runtime.sendMessage({
        type: 'START_QUEUE',
        scriptName: scriptName.trim(),
        prompts: parsedScenes,
        tabId: tab.id
      });

      setParsedScenes([]);
      setFileName('');
      setJsonText('');
      setScriptName('');
    } catch (err) {
      console.error(err);
      setError('Error al comunicar con la extensión.');
    }
  };

  const handleClearQueue = async () => {
    await browser.runtime.sendMessage({ type: 'CLEAR_QUEUE' });
  };

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING': return '#fbbc04';
      case 'IN_PROGRESS': return '#4285f4';
      case 'DOWNLOADED': return '#34a853';
      case 'ERROR': return '#ea4335';
      default: return '#5f6368';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PENDING': return '⏳';
      case 'IN_PROGRESS': return '⚙️';
      case 'DOWNLOADED': return '✅';
      case 'ERROR': return '❌';
      default: return '❓';
    }
  };

  const totalItems = queue.length;
  const downloadedItems = queue.filter(q => q.status === 'DOWNLOADED').length;
  const progressPercent = totalItems > 0 ? Math.round((downloadedItems / totalItems) * 100) : 0;

  return (
    <div style={{ padding: '12px', width: '500px', display: 'flex', flexDirection: 'column', gap: '12px', fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '16px', color: '#1a73e8' }}>Flow Script Processor</h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '6px', border: '1px dashed #dadce0', minHeight: '150px' }}>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => { setInputType('file'); setError(''); setParsedScenes([]); setJsonText(''); setFileName(''); }}
            style={{ flex: 1, padding: '4px', fontSize: '11px', background: inputType === 'file' ? '#e8f0fe' : '#fff', color: inputType === 'file' ? '#1a73e8' : '#5f6368', border: '1px solid #dadce0', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            Archivo
          </button>
          <button
            onClick={() => { setInputType('text'); setError(''); setParsedScenes([]); setJsonText(''); setFileName(''); }}
            style={{ flex: 1, padding: '4px', fontSize: '11px', background: inputType === 'text' ? '#e8f0fe' : '#fff', color: inputType === 'text' ? '#1a73e8' : '#5f6368', border: '1px solid #dadce0', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            Pegar JSON
          </button>
        </div>

        <input
          type="text"
          placeholder="Nombre del Script"
          value={scriptName}
          onChange={(e) => setScriptName(e.target.value)}
          style={{ width: '100%', fontSize: '11px', boxSizing: 'border-box', padding: '6px', borderRadius: '4px', border: '1px solid #dadce0' }}
        />

        {inputType === 'file' ? (
          <input
            type="file"
            accept=".json"
            onChange={handleFileUpload}
            style={{ fontSize: '11px', marginTop: '4px' }}
          />
        ) : (
          <textarea
            value={jsonText}
            onChange={handleTextChange}
            placeholder="Pega el contenido del JSON aquí..."
            style={{ width: '100%', height: '50px', fontSize: '11px', boxSizing: 'border-box', padding: '4px', borderRadius: '4px', border: '1px solid #dadce0', resize: 'none', marginTop: '4px' }}
          />
        )}

        {parsedScenes.length > 0 && (
          <div style={{ fontSize: '11px', color: '#1e8e3e', fontWeight: 'bold', marginTop: '2px' }}>
            ✓ {parsedScenes.length} escenas detectadas {fileName ? `(${fileName})` : ''}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          <button
            onClick={handleStartQueue}
            disabled={parsedScenes.length === 0 || !scriptName.trim()}
            style={{
              flex: 1,
              backgroundColor: (parsedScenes.length === 0 || !scriptName.trim()) ? '#dadce0' : '#1a73e8',
              color: (parsedScenes.length === 0 || !scriptName.trim()) ? '#5f6368' : 'white',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '16px',
              cursor: (parsedScenes.length === 0 || !scriptName.trim()) ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              fontSize: '11px',
              transition: 'background-color 0.2s'
            }}
          >
            + Agregar a la cola
          </button>

          <button
            onClick={handleClearQueue}
            style={{
              backgroundColor: '#fff',
              color: '#ea4335',
              border: '1px solid #ea4335',
              padding: '6px 12px',
              borderRadius: '16px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '11px'
            }}
          >
            Limpiar Cola
          </button>
        </div>

        {/* Debug Buttons */}
        <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
          <button onClick={handleTestScroll} style={{ flex: 1, fontSize: '10px', padding: '4px', borderRadius: '4px', background: '#f1f3f4', border: '1px solid #dadce0', cursor: 'pointer' }}>0. Scroll</button>
          <button onClick={handleTestFind} style={{ flex: 1, fontSize: '10px', padding: '4px', borderRadius: '4px', background: '#f1f3f4', border: '1px solid #dadce0', cursor: 'pointer' }}>1. Find Fav</button>
          <button onClick={handleTestRightClick} style={{ flex: 1, fontSize: '10px', padding: '4px', borderRadius: '4px', background: '#f1f3f4', border: '1px solid #dadce0', cursor: 'pointer' }}>2. Right Click</button>
          <button onClick={handleTestClickAdd} style={{ flex: 1, fontSize: '10px', padding: '4px', borderRadius: '4px', background: '#f1f3f4', border: '1px solid #dadce0', cursor: 'pointer' }}>3. Click Add</button>
        </div>
      </div>

      {error && (
        <p style={{ margin: 0, fontSize: '11px', color: '#d93025', textAlign: 'center' }}>
          {error}
        </p>
      )}

      {/* Barra de Progreso */}
      {totalItems > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#5f6368', fontWeight: 'bold' }}>
            <span>Progreso</span>
            <span>{downloadedItems} / {totalItems} ({progressPercent}%)</span>
          </div>
          <div style={{ height: '6px', width: '100%', backgroundColor: '#e8eaed', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progressPercent}%`, backgroundColor: '#34a853', transition: 'width 0.3s ease' }}></div>
          </div>
        </div>
      )}

      {/* Cola de Trabajo */}
      <div style={{ marginTop: '16px', padding: '12px', border: '1px solid #dadce0', borderRadius: '8px', backgroundColor: 'white' }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#202124' }}>Detalle de Escenas</h3>
        {countdown && (
          <div style={{ backgroundColor: '#fef7e0', border: '1px solid #fbbc04', padding: '8px', borderRadius: '4px', marginBottom: '8px', fontSize: '11px', color: '#b08d00', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
            <span>{countdown.message}</span>
            <span>{countdown.secondsLeft}s</span>
          </div>
        )}

        {queue.length === 0 ? (
          <p style={{ fontSize: '11px', color: '#9aa0a6', fontStyle: 'italic', margin: 0 }}>No hay escenas en procesamiento.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '200px', overflowY: 'auto' }}>
            {Object.entries(
              queue.reduce((acc, item) => {
                const name = item.script_name || 'Sin Nombre';
                if (!acc[name]) acc[name] = [];
                acc[name].push(item);
                return acc;
              }, {} as Record<string, typeof queue>)
            ).map(([groupName, items]) => (
              <div key={groupName} style={{ marginBottom: '8px' }}>
                <strong style={{ fontSize: '11px', color: '#1a73e8', display: 'block', marginBottom: '4px' }}>Script: {groupName}</strong>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {items.map((item) => (
                    <div
                      key={item.id}
                      title={item.prompt}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px',
                        backgroundColor: '#f8f9fa',
                        borderRadius: '4px',
                        borderLeft: `3px solid ${getStatusColor(item.status)}`,
                        cursor: 'help'
                      }}
                    >
                      <span title={item.status} style={{ fontSize: '12px' }}>{getStatusIcon(item.status)}</span>
                      <span style={{ fontSize: '11px', color: '#202124', fontWeight: '500' }}>
                        Escena {item.scene_number} - {item.status}
                        {item.status === 'IN_PROGRESS' && item.started_at && (
                          <span style={{ color: '#d93025', marginLeft: '6px' }}>
                            (Timeout en {Math.max(0, SCENE_TIMEOUT_MINUTES * 60 - Math.floor((nowTick - item.started_at) / 1000))}s)
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { useFileHandler } from '../hooks/useFileHandler';
import { browser } from 'wxt/browser';

export const ControlPanel = () => {
  const {
    inputType,
    setInputType,
    scriptName,
    setScriptName,
    jsonText,
    fileName,
    parsedScenes,
    parsedMultipleScripts,
    resetForm,
    setError
  } = useAppStore();

  const { handleFileUpload, handleTextChange, handleStartQueue } = useFileHandler();

  const handleClearQueue = async () => {
    await browser.runtime.sendMessage({ type: 'CLEAR_QUEUE' });
  };

  const isAddDisabled = inputType === 'multiple' 
    ? parsedMultipleScripts.length === 0 
    : (parsedScenes.length === 0 || !scriptName.trim());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '6px', border: '1px dashed #dadce0', minHeight: '150px' }}>
      
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => { setInputType('multiple'); resetForm(); }}
          style={{ flex: 1, padding: '4px', fontSize: '11px', background: inputType === 'multiple' ? '#e8f0fe' : '#fff', color: inputType === 'multiple' ? '#1a73e8' : '#5f6368', border: '1px solid #dadce0', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
          Multi JSON
        </button>
        <button
          onClick={() => { setInputType('file'); resetForm(); }}
          style={{ flex: 1, padding: '4px', fontSize: '11px', background: inputType === 'file' ? '#e8f0fe' : '#fff', color: inputType === 'file' ? '#1a73e8' : '#5f6368', border: '1px solid #dadce0', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
          Archivo
        </button>
        <button
          onClick={() => { setInputType('text'); resetForm(); }}
          style={{ flex: 1, padding: '4px', fontSize: '11px', background: inputType === 'text' ? '#e8f0fe' : '#fff', color: inputType === 'text' ? '#1a73e8' : '#5f6368', border: '1px solid #dadce0', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
          JSON Individual
        </button>
      </div>

      {inputType !== 'multiple' && (
        <input
          type="text"
          placeholder="Nombre del Script"
          value={scriptName}
          onChange={(e) => setScriptName(e.target.value)}
          style={{ width: '100%', fontSize: '11px', boxSizing: 'border-box', padding: '6px', borderRadius: '4px', border: '1px solid #dadce0' }}
        />
      )}

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

      {inputType === 'multiple' && parsedMultipleScripts.length > 0 && (
        <div style={{ fontSize: '11px', color: '#1e8e3e', fontWeight: 'bold', marginTop: '2px' }}>
          ✓ {parsedMultipleScripts.length} scripts detectados ({parsedMultipleScripts.reduce((acc, curr) => acc + curr.prompts.length, 0)} escenas en total)
        </div>
      )}
      {inputType !== 'multiple' && parsedScenes.length > 0 && (
        <div style={{ fontSize: '11px', color: '#1e8e3e', fontWeight: 'bold', marginTop: '2px' }}>
          ✓ {parsedScenes.length} escenas detectadas {fileName ? `(${fileName})` : ''}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
        <button
          onClick={handleStartQueue}
          disabled={isAddDisabled}
          style={{
            flex: 1,
            backgroundColor: isAddDisabled ? '#dadce0' : '#1a73e8',
            color: isAddDisabled ? '#5f6368' : 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '16px',
            cursor: isAddDisabled ? 'not-allowed' : 'pointer',
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
    </div>
  );
};

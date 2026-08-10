import React from 'react';
import { clsx } from 'clsx';
import { useAppStore } from '../../shared/useAppStore';
import { useQueueControl } from './useQueueControl';
import { browser } from 'wxt/browser';

export const ControlPanel = () => {
  const {
    inputType, setInputType, scriptName, setScriptName,
    jsonText, fileName, parsedScenes, parsedMultipleScripts,
    resetForm
  } = useAppStore();

  const { handleFileUpload, handleTextChange, handleStartQueue } = useQueueControl();

  const handleClearQueue = async () => {
    await browser.runtime.sendMessage({ type: 'CLEAR_QUEUE' });
  };

  const isAddDisabled = inputType === 'multiple' 
    ? parsedMultipleScripts.length === 0 
    : (parsedScenes.length === 0 || !scriptName.trim());

  const getTabClass = (type: string) => clsx(
    "flex-1 p-1 text-xs rounded border font-semibold transition-colors",
    inputType === type 
      ? "bg-blue-900/50 text-blue-400 border-blue-700" 
      : "bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700"
  );

  return (
    <div className="flex flex-col gap-2 p-3 bg-gray-800 rounded-lg border border-dashed border-gray-700 min-h-[150px]">
      
      <div className="flex gap-2">
        <button onClick={() => { setInputType('multiple'); resetForm(); }} className={getTabClass('multiple')}>
          Multi JSON
        </button>
        <button onClick={() => { setInputType('file'); resetForm(); }} className={getTabClass('file')}>
          Archivo
        </button>
        <button onClick={() => { setInputType('text'); resetForm(); }} className={getTabClass('text')}>
          JSON Individual
        </button>
      </div>

      {inputType !== 'multiple' && (
        <input
          type="text"
          placeholder="Nombre del Script"
          value={scriptName}
          onChange={(e) => setScriptName(e.target.value)}
          className="w-full text-xs p-1.5 rounded bg-gray-900 border border-gray-700 text-gray-200 focus:border-blue-500 focus:outline-none placeholder-gray-500"
        />
      )}

      {inputType === 'file' ? (
        <input
          type="file"
          accept=".json"
          onChange={handleFileUpload}
          className="text-xs mt-1 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:font-semibold file:bg-gray-700 file:text-gray-300 hover:file:bg-gray-600 cursor-pointer"
        />
      ) : (
        <textarea
          value={jsonText}
          onChange={handleTextChange}
          placeholder="Pega el contenido del JSON aquí..."
          className="w-full h-12 text-xs p-1.5 rounded bg-gray-900 border border-gray-700 text-gray-200 resize-none mt-1 focus:border-blue-500 focus:outline-none placeholder-gray-500 scrollbar-thin scrollbar-thumb-gray-600"
        />
      )}

      {inputType === 'multiple' && parsedMultipleScripts.length > 0 && (
        <div className="text-xs text-green-400 font-semibold mt-0.5">
          ✓ {parsedMultipleScripts.length} scripts detectados ({parsedMultipleScripts.reduce((acc: number, curr: any) => acc + curr.prompts.length, 0)} escenas)
        </div>
      )}
      {inputType !== 'multiple' && parsedScenes.length > 0 && (
        <div className="text-xs text-green-400 font-semibold mt-0.5">
          ✓ {parsedScenes.length} escenas detectadas {fileName ? `(${fileName})` : ''}
        </div>
      )}

      <div className="flex gap-2 mt-1">
        <button
          onClick={handleStartQueue}
          disabled={isAddDisabled}
          className={clsx(
            "flex-1 px-3 py-1.5 rounded-full font-bold text-xs transition-colors",
            isAddDisabled 
              ? "bg-gray-700 text-gray-500 cursor-not-allowed" 
              : "bg-blue-600 text-white hover:bg-blue-700 shadow-md"
          )}
        >
          + Agregar a la cola
        </button>

        <button
          onClick={handleClearQueue}
          className="px-3 py-1.5 rounded-full font-bold text-xs bg-transparent text-red-400 border border-red-500/50 hover:bg-red-500/10 transition-colors"
        >
          Limpiar Cola
        </button>
      </div>
    </div>
  );
};

import React from 'react';
import { browser } from 'wxt/browser';
import { clsx } from 'clsx';
import { useTabId } from '../../shared/useTabId';

export const DebugPanel = () => {
  const tabId = useTabId();

  const send = (type: string) => {
    if (!tabId) return;
    browser.runtime.sendMessage({ type, tabId });
  };

  const btnClass = (variant: 'default' | 'green' | 'red' | 'blue' | 'yellow' | 'cyan' = 'default') => {
    const base = "flex-1 text-[10px] py-1 px-1.5 rounded font-medium border transition-all text-center select-none active:scale-95";
    switch (variant) {
      case 'green':
        return clsx(base, "bg-emerald-950/40 border-emerald-800 text-emerald-300 hover:bg-emerald-900/60");
      case 'red':
        return clsx(base, "bg-red-950/40 border-red-800 text-red-300 hover:bg-red-900/60");
      case 'blue':
        return clsx(base, "bg-blue-950/40 border-blue-800 text-blue-300 hover:bg-blue-900/60");
      case 'yellow':
        return clsx(base, "bg-amber-950/40 border-amber-800 text-amber-300 hover:bg-amber-900/60");
      case 'cyan':
        return clsx(base, "bg-cyan-950/40 border-cyan-800 text-cyan-300 hover:bg-cyan-900/60");
      default:
        return clsx(base, "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white");
    }
  };

  return (
    <div className="flex flex-col gap-2 p-2 bg-gray-900/70 border border-gray-800 rounded-lg text-xs">
      <div className="flex items-center justify-between text-[11px] font-semibold text-gray-400 border-b border-gray-800 pb-1">
        <span>Pruebas de Selectores DOM</span>
        <span className="text-[9px] text-gray-500 font-mono">F12 Console</span>
      </div>

      {/* 1. Tiles & Media IDs */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-gray-400 font-medium">1. Tiles Angular</span>
        <div className="flex gap-1.5">
          <button onClick={() => send('TEST_DETECT_TILES')} className={btnClass('green')}>
            Detectar Tiles
          </button>
          <button onClick={() => send('TEST_LOG_MEDIA_IDS')} className={btnClass('blue')}>
            Log Media IDs
          </button>
        </div>
      </div>

      {/* 2. Favoritos & Referencia */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-gray-400 font-medium">2. Favorito & ContextMenu</span>
        <div className="flex gap-1.5">
          <button onClick={() => send('TEST_FIND_FAVORITE')} className={btnClass('red')}>
            Buscar Fav
          </button>
          <button onClick={() => send('TEST_RIGHT_CLICK')} className={btnClass('blue')}>
            Click Derecho
          </button>
          <button onClick={() => send('TEST_CLICK_ADD')} className={btnClass('green')}>
            Añadir a Prompt
          </button>
        </div>
      </div>

      {/* 3. Editor de Prompts */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-gray-400 font-medium">3. Editor & Enviar</span>
        <div className="flex gap-1.5">
          <button onClick={() => send('TEST_FIND_EDITOR')} className={btnClass('yellow')}>
            Enfocar Editor
          </button>
          <button onClick={() => send('TEST_FIND_SEND_BTN')} className={btnClass('cyan')}>
            Detectar Enviar
          </button>
        </div>
      </div>

      {/* 4. Scroll & Selección */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-gray-400 font-medium">4. Scroll & Limpieza</span>
        <div className="flex gap-1.5">
          <button onClick={() => send('TEST_SCROLL')} className={btnClass('default')}>
            Scroll Fin
          </button>
          <button onClick={() => send('TEST_SELECT_LAST_THREE')} className={btnClass('yellow')}>
            Select 3
          </button>
          <button onClick={() => send('TEST_DELETE_SELECTED')} className={btnClass('red')}>
            Borrar (Del)
          </button>
        </div>
      </div>

      {/* 5. Formato de Salida (Modal) */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-gray-400 font-medium">5. Formato de Salida</span>
        <div className="flex gap-1.5">
          <button onClick={() => send('TEST_SET_FORMAT_VERTICAL')} className={btnClass('blue')}>
            Img 9:16
          </button>
          <button onClick={() => send('TEST_SET_FORMAT_HORIZONTAL')} className={btnClass('cyan')}>
            Img 16:9
          </button>
          <button onClick={() => send('TEST_SET_FORMAT_VIDEO')} className={btnClass('yellow')}>
            Video
          </button>
        </div>
      </div>
    </div>
  );
};

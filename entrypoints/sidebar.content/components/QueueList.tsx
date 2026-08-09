import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { SCENE_TIMEOUT_MINUTES, QueueItem } from '../../../utils/types';
import { getStatusColor, getStatusIcon } from '../utils/helpers';

export const QueueList = () => {
  const { queue, countdown } = useAppStore();
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    const int = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(int);
  }, []);

  return (
    <div className="mt-2 p-3 border border-gray-700 rounded-lg bg-gray-800 flex-1 overflow-hidden flex flex-col">
      <h3 className="m-0 mb-2 text-[13px] text-gray-200 font-semibold">Detalle de Escenas</h3>
      
      {countdown && (
        <div className="bg-yellow-900/30 border border-yellow-700 p-2 rounded flex justify-between mb-2 text-[11px] text-yellow-400 font-bold shadow-inner">
          <span>{countdown.message}</span>
          <span>{countdown.secondsLeft}s</span>
        </div>
      )}

      {queue.length === 0 ? (
        <p className="text-[11px] text-gray-500 italic m-0">No hay escenas en procesamiento.</p>
      ) : (
        <div className="flex flex-col gap-1 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-600">
          {Object.entries(
            queue.reduce((acc, item) => {
              const name = item.script_name || 'Sin Nombre';
              if (!acc[name]) acc[name] = [];
              acc[name].push(item);
              return acc;
            }, {} as Record<string, QueueItem[]>)
          ).map(([groupName, items]) => (
            <div key={groupName} className="mb-2">
              <strong className="text-[11px] text-blue-400 block mb-1">Script: {groupName}</strong>
              <div className="flex flex-col gap-1">
                {items.map((item: QueueItem) => (
                  <div
                    key={item.id}
                    title={item.prompt}
                    className="flex items-center gap-1.5 p-1.5 bg-gray-900 rounded border-l-2 cursor-help transition-colors hover:bg-gray-800"
                    style={{ borderLeftColor: getStatusColor(item.status) }}
                  >
                    <span title={item.status} className="text-xs">{getStatusIcon(item.status)}</span>
                    <span className="text-[11px] text-gray-300 font-medium whitespace-nowrap overflow-hidden text-ellipsis">
                      {item.scene_number === 0 ? 'Miniatura' : `Escena ${item.scene_number}`} - {item.status}
                      {item.status === 'IN_PROGRESS' && item.started_at && (
                        <span className="text-red-400 ml-1.5 font-bold">
                          ({Math.max(0, SCENE_TIMEOUT_MINUTES * 60 - Math.floor((nowTick - item.started_at) / 1000))}s)
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
  );
};


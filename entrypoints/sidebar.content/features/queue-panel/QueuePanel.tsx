import React, { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { useAppStore } from '../../shared/useAppStore';
import { QueueItem, SCENE_TIMEOUT_MINUTES } from '../../../../src/queue/queue.types';

const getStatusColor = (status: string) => {
  switch (status) {
    case 'PENDING': return '#fbbc04';
    case 'IN_PROGRESS': return '#4285f4';
    case 'DOWNLOADED': return '#34a853';
    case 'ERROR': return '#ea4335';
    case 'RATE_LIMITED': return '#ff6d00';
    default: return '#5f6368';
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'PENDING': return '⏳';
    case 'IN_PROGRESS': return '⚙️';
    case 'DOWNLOADED': return '✅';
    case 'ERROR': return '❌';
    case 'RATE_LIMITED': return '⏳ (RL)';
    default: return '❓';
  }
};

export const QueuePanel = () => {
  const { queue, countdown } = useAppStore();
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    const int = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(int);
  }, []);

  const totalItems = queue.length;
  const downloadedItems = queue.filter((q: any) => q.status === 'DOWNLOADED').length;
  const progressPercent = totalItems > 0 ? Math.round((downloadedItems / totalItems) * 100) : 0;

  return (
    <div className="mt-2 p-3 border border-gray-700 rounded-lg bg-gray-800 flex-1 overflow-hidden flex flex-col gap-3">
      {/* Progress Bar Section */}
      {totalItems > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-[11px] text-gray-400 font-bold">
            <span>Progreso</span>
            <span>{downloadedItems} / {totalItems} ({progressPercent}%)</span>
          </div>
          <div className="h-1.5 w-full bg-gray-900 rounded-full overflow-hidden">
            <div 
              className="h-full bg-green-500 transition-all duration-300 ease-out" 
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Queue List Section */}
      <div className="flex flex-col flex-1 overflow-hidden">
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
              queue.reduce((acc: Record<string, QueueItem[]>, item: QueueItem) => {
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
                      className={clsx(
                        "flex items-center gap-1.5 p-1.5 rounded border-l-2 cursor-help transition-colors",
                        "bg-gray-900 hover:bg-gray-800"
                      )}
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
    </div>
  );
};

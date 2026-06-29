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
            }, {} as Record<string, QueueItem[]>)
          ).map(([groupName, items]) => (
            <div key={groupName} style={{ marginBottom: '8px' }}>
              <strong style={{ fontSize: '11px', color: '#1a73e8', display: 'block', marginBottom: '4px' }}>Script: {groupName}</strong>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {items.map((item: QueueItem) => (
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
                      {item.scene_number === 0 ? 'Miniatura' : `Escena ${item.scene_number}`} - {item.status}
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
  );
};

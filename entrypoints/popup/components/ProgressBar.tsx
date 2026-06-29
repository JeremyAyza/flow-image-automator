import React from 'react';
import { useAppStore } from '../store/useAppStore';

export const ProgressBar = () => {
  const { queue } = useAppStore();

  const totalItems = queue.length;
  const downloadedItems = queue.filter(q => q.status === 'DOWNLOADED').length;
  const progressPercent = totalItems > 0 ? Math.round((downloadedItems / totalItems) * 100) : 0;

  if (totalItems === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#5f6368', fontWeight: 'bold' }}>
        <span>Progreso</span>
        <span>{downloadedItems} / {totalItems} ({progressPercent}%)</span>
      </div>
      <div style={{ height: '6px', width: '100%', backgroundColor: '#e8eaed', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${progressPercent}%`, backgroundColor: '#34a853', transition: 'width 0.3s ease' }}></div>
      </div>
    </div>
  );
};

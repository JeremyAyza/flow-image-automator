import React from 'react';
import { useAppStore } from '../store/useAppStore';

export const ProgressBar = () => {
  const { queue } = useAppStore();

  const totalItems = queue.length;
  const downloadedItems = queue.filter(q => q.status === 'DOWNLOADED').length;
  const progressPercent = totalItems > 0 ? Math.round((downloadedItems / totalItems) * 100) : 0;

  if (totalItems === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[11px] text-gray-400 font-bold">
        <span>Progreso</span>
        <span>{downloadedItems} / {totalItems} ({progressPercent}%)</span>
      </div>
      <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
        <div 
          className="h-full bg-green-500 transition-all duration-300 ease-out" 
          style={{ width: `${progressPercent}%` }}
        ></div>
      </div>
    </div>
  );
};


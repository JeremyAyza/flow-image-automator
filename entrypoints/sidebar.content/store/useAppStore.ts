import { create } from 'zustand';
import { QueueItem } from '../../../utils/types';

interface AppState {
  queue: QueueItem[];
  setQueue: (queue: QueueItem[]) => void;
  
  error: string;
  setError: (error: string) => void;
  
  parsedScenes: { scene_number: number, prompt: string }[];
  setParsedScenes: (scenes: { scene_number: number, prompt: string }[]) => void;
  
  parsedMultipleScripts: { scriptName: string, prompts: { scene_number: number, prompt: string }[] }[];
  setParsedMultipleScripts: (scripts: { scriptName: string, prompts: { scene_number: number, prompt: string }[] }[]) => void;
  
  fileName: string;
  setFileName: (name: string) => void;
  
  inputType: 'file' | 'text' | 'multiple';
  setInputType: (type: 'file' | 'text' | 'multiple') => void;
  
  jsonText: string;
  setJsonText: (text: string) => void;
  
  scriptName: string;
  setScriptName: (name: string) => void;
  
  tabId: number | null;
  setTabId: (tabId: number) => void;

  countdown: { message: string, secondsLeft: number } | null;
  setCountdown: (countdown: { message: string, secondsLeft: number } | null) => void;
  
  resetForm: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  queue: [],
  setQueue: (queue) => set({ queue }),
  
  error: '',
  setError: (error) => set({ error }),
  
  parsedScenes: [],
  setParsedScenes: (parsedScenes) => set({ parsedScenes }),
  
  parsedMultipleScripts: [],
  setParsedMultipleScripts: (parsedMultipleScripts) => set({ parsedMultipleScripts }),
  
  fileName: '',
  setFileName: (fileName) => set({ fileName }),
  
  inputType: 'multiple',
  setInputType: (inputType) => set({ inputType }),
  
  jsonText: '',
  setJsonText: (jsonText) => set({ jsonText }),
  
  scriptName: '',
  setScriptName: (scriptName) => set({ scriptName }),
  
  tabId: null,
  setTabId: (tabId) => set({ tabId }),

  countdown: null,
  setCountdown: (countdown) => set({ countdown }),
  
  resetForm: () => set({
    parsedScenes: [],
    parsedMultipleScripts: [],
    jsonText: '',
    fileName: '',
    error: ''
  })
}));

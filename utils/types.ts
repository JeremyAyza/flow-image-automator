export type PromptStatus = 'PENDING' | 'IN_PROGRESS' | 'DOWNLOADED' | 'ERROR' | 'RATE_LIMITED';

export interface QueueItem {
  id: string;
  script_name: string;
  scene_number: number;
  prompt: string;
  status: PromptStatus;
  session_folder: string;
  started_at?: number;
}

export interface ImagePrompt {
  subjects: { description: string; action: string }[];
  environment: string;
  lighting: string;
  composition: string;
  style: string;
}

export interface ScriptScene {
  scene_number: number;
  image_prompt: ImagePrompt;
  narration: string;
}

export interface ScriptData {
  scenes: ScriptScene[];
}

export const SCENE_TIMEOUT_MINUTES = 3;
export const SCENE_TIMEOUT_MS = SCENE_TIMEOUT_MINUTES * 60 * 1000;
export const SCRIPT_BOUNDARY_DELAY_SEC = 30;

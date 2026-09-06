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

export const SCENE_TIMEOUT_MINUTES = 3;
export const SCENE_TIMEOUT_MS = SCENE_TIMEOUT_MINUTES * 60 * 1000;
export const SCRIPT_BOUNDARY_DELAY_SEC = 30;
export const MAX_CONCURRENT = 3;
export const IMAGES_PER_SCENE = 1;
export const INJECT_DELAY_MS = 3_000;
export const RATE_LIMIT_COOLDOWN_MS = 60_000;

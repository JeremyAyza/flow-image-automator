import { produce } from 'immer';
import { browser } from 'wxt/browser';
import type { QueueItem } from './queue.types';

// ── Estado singleton del servicio ─────────────────────────────────────────────

export let queue: QueueItem[] = [];
export let activeTabId: number | null = null;

export function setActiveTabId(id: number) {
  activeTabId = id;
}

// ── Broadcast ─────────────────────────────────────────────────────────────────

export function broadcastMessage(msg: Record<string, unknown>) {
  browser.runtime.sendMessage(msg).catch(() => {});
  if (activeTabId) {
    chrome.tabs.sendMessage(activeTabId, msg).catch(() => {});
  }
}

export function broadcastQueue() {
  broadcastMessage({ type: 'QUEUE_UPDATED', queue });
}

// ── Mutaciones de cola con immer ──────────────────────────────────────────────

export function addToQueue(items: Omit<QueueItem, 'id' | 'status'>[]) {
  queue = produce(queue, draft => {
    for (const item of items) {
      draft.push({ ...item, id: Math.random().toString(36).substring(2, 9), status: 'PENDING' });
    }
  });
}

export function clearQueue() {
  queue = [];
}

export function markStatus(id: string, status: QueueItem['status']) {
  queue = produce(queue, draft => {
    const item = draft.find(q => q.id === id);
    if (item) item.status = status;
  });
}

export function markInProgress(item: QueueItem) {
  queue = produce(queue, draft => {
    const found = draft.find(q => q.id === item.id);
    if (found) { found.status = 'IN_PROGRESS'; found.started_at = Date.now(); }
  });
}

export function markRateLimitedToRetry() {
  queue = produce(queue, draft => {
    draft.filter(q => q.status === 'RATE_LIMITED').forEach(q => { q.status = 'PENDING'; });
  });
}

export function markInProgressAsRateLimited() {
  queue = produce(queue, draft => {
    draft.filter(q => q.status === 'IN_PROGRESS').forEach(q => { q.status = 'RATE_LIMITED'; });
  });
}

export function markTimedOutAsPending() {
  let changed = false;
  queue = produce(queue, draft => {
    const now = Date.now();
    draft.filter(q => q.status === 'IN_PROGRESS').forEach(q => {
      if (q.started_at && now - q.started_at > 3 * 60 * 1000) {
        q.status = 'PENDING';
        q.started_at = undefined;
        changed = true;
      }
    });
  });
  return changed;
}

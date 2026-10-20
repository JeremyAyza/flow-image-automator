import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  queue, addToQueue, clearQueue, markInProgress, markStatus,
  markInProgressAsRateLimited, markRateLimitedToRetry, markTimedOutAsPending,
} from '../src/queue/queue.service';

const scene = (n: number) => ({ script_name: 'video', scene_number: n, prompt: `prompt ${n}`, session_folder: 'video_1' });

beforeEach(() => {
  fakeBrowser.reset();
  clearQueue();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('queue service', () => {
  it('adds items as PENDING with an id', () => {
    addToQueue([scene(1), scene(2)]);

    expect(queue.map(q => q.status)).toEqual(['PENDING', 'PENDING']);
    expect(new Set(queue.map(q => q.id)).size).toBe(2);
  });

  it('moves scenes through in progress, rate limited and back to pending', () => {
    addToQueue([scene(1), scene(2)]);
    markInProgress(queue[0]);
    expect(queue[0].status).toBe('IN_PROGRESS');
    expect(queue[0].started_at).toBeTypeOf('number');

    markInProgressAsRateLimited();
    expect(queue.map(q => q.status)).toEqual(['RATE_LIMITED', 'PENDING']);

    markRateLimitedToRetry();
    expect(queue.map(q => q.status)).toEqual(['PENDING', 'PENDING']);

    markStatus(queue[1].id, 'DOWNLOADED');
    expect(queue[1].status).toBe('DOWNLOADED');
  });

  it('puts a scene back to pending after the 3-minute timeout', () => {
    vi.useFakeTimers();
    addToQueue([scene(1)]);
    markInProgress(queue[0]);

    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(markTimedOutAsPending()).toBe(false);
    expect(queue[0].status).toBe('IN_PROGRESS');

    vi.advanceTimersByTime(60 * 1000 + 1);
    expect(markTimedOutAsPending()).toBe(true);
    expect(queue[0].status).toBe('PENDING');
    expect(queue[0].started_at).toBeUndefined();
  });
});

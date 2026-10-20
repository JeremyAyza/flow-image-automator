import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { queue, addToQueue, clearQueue, markInProgress } from '../src/queue/queue.service';
import { mediaIdToScene, downloadedTileIds, resetEngineState } from '../src/automation/automation.engine';
import { handleBatchResponse, handleNewTiles } from '../src/media/media.service';

const MEDIA_ID = '11111111-2222-3333-4444-555555555555';

const trpcResponse = (prompt: string, mediaId: string) => [{
  result: {
    data: {
      json: {
        workflows: [{ name: 'wf-1', metadata: { batchId: 'batch-1' } }],
        media: [{ image: { generatedImage: { workflowId: 'wf-1', mediaId, prompt, fifeUrl: 'https://example.com/full.png' } } }],
      },
    },
  },
}];

let download: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fakeBrowser.reset();
  clearQueue();
  resetEngineState();
  download = vi.fn().mockResolvedValue(1);
  (fakeBrowser.downloads as any).download = download;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('handleBatchResponse', () => {
  it('maps the media id of a tRPC batch to the in-progress scene with the same prompt', () => {
    addToQueue([
      { script_name: 'video', scene_number: 1, prompt: 'a red car', session_folder: 'video_1' },
      { script_name: 'video', scene_number: 2, prompt: 'a blue boat', session_folder: 'video_1' },
    ]);
    queue.forEach(q => markInProgress(q));

    handleBatchResponse(trpcResponse('a blue boat\n\n--- constraints ---', MEDIA_ID));

    expect(mediaIdToScene.get(MEDIA_ID)).toMatchObject({
      sceneNumber: 2,
      imageIndex: 1,
      sessionFolder: 'video_1',
      fifeUrl: 'https://example.com/full.png',
    });
  });

  it('ignores a batch that matches no in-progress prompt', () => {
    addToQueue([{ script_name: 'video', scene_number: 1, prompt: 'a red car', session_folder: 'video_1' }]);
    markInProgress(queue[0]);

    handleBatchResponse(trpcResponse('something else', MEDIA_ID));

    expect(mediaIdToScene.size).toBe(0);
  });
});

describe('handleNewTiles', () => {
  it('downloads a mapped image with its scene file name', () => {
    mediaIdToScene.set(MEDIA_ID, { sceneNumber: 3, imageIndex: 1, sessionFolder: 'video_1', fifeUrl: 'https://example.com/full.png' });

    handleNewTiles([[MEDIA_ID, 'https://example.com/thumb.png']]);

    expect(download).toHaveBeenCalledWith({
      url: 'https://example.com/full.png',
      filename: 'Flow_Generations/video_1/scene_3.png',
      saveAs: false,
    });
    expect(downloadedTileIds.has(MEDIA_ID)).toBe(true);
  });

  it('names scene 0 as the thumbnail and falls back to the scene in progress', () => {
    addToQueue([{ script_name: 'video', scene_number: 0, prompt: 'thumbnail', session_folder: 'video_1' }]);
    markInProgress(queue[0]);

    handleNewTiles([['tile-1', 'https://example.com/img.png']]);

    expect(download).toHaveBeenCalledWith(expect.objectContaining({ filename: 'Flow_Generations/video_1/thumbnail.png' }));
  });

  it('skips tiles that were already downloaded', () => {
    downloadedTileIds.add('tile-1');
    addToQueue([{ script_name: 'video', scene_number: 1, prompt: 'p', session_folder: 'video_1' }]);
    markInProgress(queue[0]);

    handleNewTiles([['tile-1', 'https://example.com/img.png']]);

    expect(download).not.toHaveBeenCalled();
  });
});

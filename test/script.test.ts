import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { ScriptDataSchema, MultiScriptSchema } from '../src/shared/script.schemas';
import { parseImagePromptToText } from '../src/shared/script.parser';

const example = JSON.parse(readFileSync('examples/script.example.json', 'utf-8'));

describe('script schemas', () => {
  it('accepts the example script', () => {
    const result = ScriptDataSchema.safeParse(example);
    expect(result.success).toBe(true);
    expect(result.data?.scenes.length).toBeGreaterThan(0);
  });

  it('accepts several scripts keyed by name', () => {
    expect(MultiScriptSchema.safeParse({ 'video-1': example, 'video-2': example }).success).toBe(true);
  });

  it('rejects a script without scenes', () => {
    expect(ScriptDataSchema.safeParse({ thumbnail_prompt: example.thumbnail_prompt }).success).toBe(false);
  });
});

describe('parseImagePromptToText', () => {
  it('joins subjects and the other fields, then appends the fixed constraints', () => {
    const text = parseImagePromptToText({
      subjects: [
        { description: 'A stickman', action: 'holding a ticket' },
        { description: 'A cat', action: 'sleeping' },
      ],
      environment: 'White background',
      lighting: '',
      composition: 'Centered',
      style: 'Flat illustration',
    });

    const [base, ...constraints] = text.split('\n\n');
    expect(base).toBe('A stickman. holding a ticket A cat. sleeping. White background. Centered. Flat illustration');
    expect(constraints).toHaveLength(2);
    expect(constraints[0]).toContain('STYLE REFERENCES');
    expect(constraints[1]).toContain('SPANISH');
  });
});

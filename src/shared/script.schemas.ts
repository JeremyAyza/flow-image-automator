import { z } from 'zod';

// ── Schemas ──────────────────────────────────────────────────────────────────

const ImagePromptSchema = z.object({
  subjects: z.array(z.object({
    description: z.string(),
    action: z.string(),
  })),
  environment: z.string(),
  lighting: z.string(),
  composition: z.string(),
  style: z.string(),
});

const ScriptSceneSchema = z.object({
  scene_number: z.number(),
  image_prompt: ImagePromptSchema,
  narration: z.string().optional(),
});

export const ScriptDataSchema = z.object({
  thumbnail_prompt: ImagePromptSchema.optional(),
  scenes: z.array(ScriptSceneSchema),
});

export const MultiScriptSchema = z.record(z.string(), ScriptDataSchema);

// ── Tipos inferidos de los schemas ───────────────────────────────────────────

export type ImagePrompt = z.infer<typeof ImagePromptSchema>;
export type ScriptScene = z.infer<typeof ScriptSceneSchema>;
export type ScriptData = z.infer<typeof ScriptDataSchema>;

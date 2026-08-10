import type { ImagePrompt } from './script.schemas';

/**
 * Convierte un ImagePrompt estructurado en texto plano para el editor de Flow.
 */
export function parseImagePromptToText(prompt: ImagePrompt): string {
  const subjectParts = prompt.subjects.map(s => `${s.description}. ${s.action}`).join(' ');
  return [
    subjectParts,
    prompt.environment,
    prompt.lighting,
    prompt.composition,
    prompt.style,
  ].filter(Boolean).join('. ');
}

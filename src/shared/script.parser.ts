import type { ImagePrompt } from './script.schemas';

const STYLE_REFERENCE_CONSTRAINT = "--- STYLE REFERENCES: Maintain the exact visual aesthetic, and style of the attached image(s) ---";
const LANGUAGE_CONSTRAINT = `--- LANGUAGE CONSTRAINT: If you ask for any written text or sign in the image, the exact words must be written in SPANISH (Example: "A sign that says 'AHORROS'"). ---`;

/**
 * Convierte un ImagePrompt estructurado en texto plano para el editor de Flow.
 */
export function parseImagePromptToText(prompt: ImagePrompt): string {
  const subjectParts = prompt.subjects.map(s => `${s.description}. ${s.action}`).join(' ');
  const basePrompt = [
    subjectParts,
    prompt.environment,
    prompt.lighting,
    prompt.composition,
    prompt.style,
  ].filter(Boolean).join('. ');

  return `${basePrompt}\n\n${STYLE_REFERENCE_CONSTRAINT}\n\n${LANGUAGE_CONSTRAINT}`;
}

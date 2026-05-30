import { ImagePrompt } from './types';

const STYLE_REFERENCE_CONSTRAINT = "--- STYLE REFERENCES: Maintain the exact visual aesthetic, and style of the attached image(s) ---";
const LANGUAGE_CONSTRAINT = `--- LANGUAGE CONSTRAINT: If you ask for any written text or sign in the image, the exact words must be written in SPANISH (Example: "A sign that says 'AHORROS'"). ---`;

export function parseImagePromptToText(prompt: ImagePrompt): string {
  const subjects = prompt.subjects.map(s => `${s.description} ${s.action}`).join(', ');

  const basePrompt = `Subjects: ${subjects}.
Environment: ${prompt.environment}
Lighting: ${prompt.lighting}
Composition: ${prompt.composition}
Style: ${prompt.style}`.trim();

  return `${basePrompt}\n\n${STYLE_REFERENCE_CONSTRAINT}\n\n${LANGUAGE_CONSTRAINT}`;
}

export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export function geminiUrl(model, method) {
  return `${GEMINI_BASE}/${encodeURIComponent(model)}:${method}`;
}

// Speech recognition stays on a model whose audio input is documented; answers use the model chosen in Settings.
export const GEMINI_STT_MODEL = 'gemini-2.5-flash-lite';

// Gemini 3.x: thinking is already minimal by default and cannot be switched off, and Google advises leaving
// temperature at its default. Sending thinkingBudget there can be rejected, so those fields are 2.x only.
export const isGemini3 = (model) => /^gemini-3/.test(String(model));

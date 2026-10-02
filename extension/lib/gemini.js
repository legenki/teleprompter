export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export function geminiUrl(model, method) {
  return `${GEMINI_BASE}/${encodeURIComponent(model)}:${method}`;
}

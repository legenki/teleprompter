// Maps the UI choice (model size + interviewer language) to a Whisper model id and decoding options.

export const WHISPER_SIZES = ['tiny', 'base', 'small'];

export function whisperModelId(size, lang) {
  const s = WHISPER_SIZES.includes(size) ? size : 'base';
  // English-only checkpoints are smaller/faster; other languages need the multilingual ones.
  return lang === 'en' ? `onnx-community/whisper-${s}.en` : `onnx-community/whisper-${s}`;
}

export function whisperOptions(lang) {
  return lang === 'es' ? { language: 'spanish', task: 'transcribe' } : {};
}

// Older settings stored the full model id ("onnx-community/whisper-base.en").
export function normalizeSize(stored) {
  const m = String(stored || '').match(/whisper-(tiny|base|small)/);
  return m ? m[1] : 'base';
}

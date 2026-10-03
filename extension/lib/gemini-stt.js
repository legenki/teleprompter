// Speech-to-text through Gemini audio understanding (one request per utterance).
import { geminiUrl } from './gemini.js';

export function floatToWav(samples, sampleRate = 16000) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

export function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const SPOKEN = { en: 'English', es: 'Spanish' };

export function buildTranscribeBody(samples, { hint = '', previous = '', language = 'en' } = {}) {
  const prompt = [
    `Transcribe this audio from a job interview exactly as spoken, in ${SPOKEN[language] || 'English'}.`,
    'Output ONLY the transcript text: no quotes, labels, timestamps or commentary.',
    'If there is no clear human speech, output nothing.',
    hint ? `Likely vocabulary (use these spellings when they are spoken): ${hint.slice(0, 600)}` : '',
    previous ? `The previous sentence was: "${previous.slice(-200)}"` : '',
  ].filter(Boolean).join('\n');

  return {
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: 'audio/wav', data: toBase64(floatToWav(samples)) } },
        { text: prompt },
      ],
    }],
    generationConfig: { temperature: 0, maxOutputTokens: 512, thinkingConfig: { thinkingBudget: 0 } },
  };
}

export async function geminiTranscribe(samples, { key, model, hint, language }, previous, signal) {
  const res = await fetch(geminiUrl(model, 'generateContent'), {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(buildTranscribeBody(samples, { hint, previous, language })),
  });
  if (!res.ok) {
    const err = new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 160)}`);
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  const parts = json.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || '').join('').trim();
}

// Quota / auth problems will not fix themselves mid-interview: stop calling Gemini.
export const isFatalGeminiError = (e) => [401, 403, 429].includes(e?.status);

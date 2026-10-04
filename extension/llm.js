import { geminiUrl, isGemini3 } from './lib/gemini.js';

// Streaming chat provider. stream(messages, { onToken, signal }) -> full text.
export const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'];

// OpenAI-style messages -> Gemini generateContent body. On 2.x thinking is disabled (it adds seconds of latency
// and eats the output budget, which is wrong for a live copilot); 3.x already thinks minimally by default.
export function toGeminiBody(messages, model = '') {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  return {
    ...(system && { systemInstruction: { parts: [{ text: system }] } }),
    contents: messages.filter((m) => m.role !== 'system').map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    generationConfig: isGemini3(model)
      ? { maxOutputTokens: 700 }
      : { temperature: 0.5, maxOutputTokens: 400, thinkingConfig: { thinkingBudget: 0 } },
  };
}

export function createProvider({ geminiKey, geminiModel }) {
  return {
    async ready() {
      if (!geminiKey) throw new Error('Add a Gemini API key in Settings (free at aistudio.google.com/apikey).');
    },

    async stream(messages, { onToken, signal } = {}) {
      const url = `${geminiUrl(geminiModel, 'streamGenerateContent')}?alt=sse`;
      const res = await fetch(url, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
        body: JSON.stringify(toGeminiBody(messages, geminiModel)),
      });
      if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let full = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          try {
            const parts = JSON.parse(line.slice(5)).candidates?.[0]?.content?.parts || [];
            const delta = parts.map((p) => p.text || '').join('');
            if (delta) { full += delta; onToken?.(full); }
          } catch { /* ignore partial/keep-alive lines */ }
        }
      }
      return full;
    },
  };
}

import { geminiUrl } from './lib/gemini.js';

// Streaming chat providers. Both expose: stream(messages, { onToken, signal }) -> full text.

export const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
export const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
export const LOCAL_MODELS = [
  'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
  'Qwen2.5-3B-Instruct-q4f16_1-MLC',
  'Llama-3.2-3B-Instruct-q4f16_1-MLC',
];

export function createProvider(settings, onStatus) {
  if (settings.provider === 'gemini') return new GeminiProvider(settings);
  if (settings.provider === 'groq') return new GroqProvider(settings);
  return new LocalProvider(settings, onStatus);
}

// OpenAI-style messages -> Gemini generateContent body. Thinking is disabled: it adds seconds of latency
// and eats the output budget, which is wrong for a live copilot.
export function toGeminiBody(messages) {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  return {
    ...(system && { systemInstruction: { parts: [{ text: system }] } }),
    contents: messages.filter((m) => m.role !== 'system').map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    generationConfig: { temperature: 0.5, maxOutputTokens: 400, thinkingConfig: { thinkingBudget: 0 } },
  };
}

class GeminiProvider {
  constructor({ geminiKey, geminiModel }) {
    this.key = geminiKey;
    this.model = geminiModel;
  }

  async ready() {
    if (!this.key) throw new Error('Add a Gemini API key in settings (free at aistudio.google.com/apikey).');
  }

  async stream(messages, { onToken, signal } = {}) {
    const url = `${geminiUrl(this.model, 'streamGenerateContent')}?alt=sse`;
    const res = await fetch(url, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.key },
      body: JSON.stringify(toGeminiBody(messages)),
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
  }
}

class GroqProvider {
  constructor({ groqKey, groqModel }) {
    this.key = groqKey;
    this.model = groqModel;
  }

  async ready() {
    if (!this.key) throw new Error('Add a Groq API key in settings (free at console.groq.com).');
  }

  async stream(messages, { onToken, signal } = {}) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.key}` },
      body: JSON.stringify({ model: this.model, messages, stream: true, temperature: 0.5, max_tokens: 400 }),
    });
    if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`);

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
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const delta = JSON.parse(data).choices?.[0]?.delta?.content;
          if (delta) { full += delta; onToken?.(full); }
        } catch { /* ignore keep-alives */ }
      }
    }
    return full;
  }
}

class LocalProvider {
  constructor({ localModel }, onStatus) {
    this.model = localModel;
    this.onStatus = onStatus;
    this.engine = null;
    this.loading = null;
  }

  ready() {
    if (this.engine) return Promise.resolve();
    this.loading ??= (async () => {
      if (!navigator.gpu) throw new Error('Local LLM needs WebGPU. Use the Groq provider instead.');
      const { CreateMLCEngine } = await import('@mlc-ai/web-llm');
      this.engine = await CreateMLCEngine(this.model, {
        initProgressCallback: (p) => this.onStatus?.(p.text || `Loading ${Math.round((p.progress || 0) * 100)}%`),
      });
    })().catch((e) => { this.loading = null; throw e; });
    return this.loading;
  }

  async stream(messages, { onToken, signal } = {}) {
    await this.ready();
    const onAbort = () => this.engine.interruptGenerate();
    signal?.addEventListener('abort', onAbort);
    try {
      const chunks = await this.engine.chat.completions.create({
        messages, stream: true, temperature: 0.5, max_tokens: 400,
      });
      let full = '';
      for await (const c of chunks) {
        const delta = c.choices[0]?.delta?.content;
        if (delta) { full += delta; onToken?.(full); }
      }
      return full;
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }
}

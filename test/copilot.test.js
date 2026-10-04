import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Segmenter } from '../extension/lib/segmenter.js';
import { isQuestion, isNoise } from '../extension/lib/question.js';
import { parseReply, buildAnswerMessages } from '../extension/lib/prompt.js';

const tone = (ms, amp) => Float32Array.from({ length: ms * 16 }, (_, i) => amp * Math.sin(i / 5));
const quiet = (ms) => new Float32Array(ms * 16);

test('segmenter emits one utterance per speech burst', () => {
  const got = [];
  const s = new Segmenter({ onUtterance: (u) => got.push(u) });
  s.push(quiet(500));
  s.push(tone(1500, 0.2));
  s.push(quiet(1000));
  s.push(tone(1000, 0.2));
  s.push(quiet(1000));
  assert.equal(got.length, 2);
  assert.ok(got[0].durationMs >= 1500 && got[0].durationMs < 2500);
});

test('segmenter ignores clicks shorter than minSpeech and silence', () => {
  const got = [];
  const s = new Segmenter({ onUtterance: (u) => got.push(u) });
  s.push(quiet(2000));
  s.push(tone(100, 0.3));
  s.push(quiet(2000));
  assert.equal(got.length, 0);
});

test('segmenter force-splits very long speech', () => {
  const got = [];
  const s = new Segmenter({ maxUtteranceMs: 3000, onUtterance: (u) => got.push(u) });
  s.push(tone(7000, 0.2));
  s.flush();
  assert.ok(got.length >= 2);
});

test('segmenter works with odd chunk sizes', () => {
  const got = [];
  const s = new Segmenter({ onUtterance: (u) => got.push(u) });
  const all = [...quiet(300), ...tone(1200, 0.2), ...quiet(1200)];
  for (let i = 0; i < all.length; i += 123) s.push(Float32Array.from(all.slice(i, i + 123)));
  assert.equal(got.length, 1);
});

test('isQuestion', () => {
  for (const q of [
    'Can you tell me about yourself?',
    'Tell me about a time you disagreed with your manager.',
    'Okay, so walk me through your last project',
    'Thanks for joining. Describe your experience with React.',
    'What is the difference between a process and a thread',
  ]) assert.equal(isQuestion(q), true, q);
  for (const t of [
    'Hi, nice to meet you.',
    'Thanks, that makes sense.',
    'We are a team of about fifty engineers.',
    'ok',
  ]) assert.equal(isQuestion(t), false, t);
});

test('multi-word fillers are stripped before opener matching', () => {
  assert.equal(isQuestion('And then tell me about your last role', 'en'), true);
  assert.equal(isQuestion('A ver, cuéntame sobre tu experiencia', 'es'), true);
});

test('isNoise filters whisper hallucinations', () => {
  for (const t of ['', ' . ', 'Thank you.', 'you', '[MUSIC]', '(silence)']) assert.equal(isNoise(t), true, t);
  assert.equal(isNoise('Tell me about React hooks.'), false);
});

test('parseReply handles complete and partial output', () => {
  const full = parseReply('RU: Расскажите о себе\nKEY: backend | 5 years | Node\nA1: I am a backend dev.\nA2: I build APIs.\nA3: I lead small teams.');
  assert.equal(full.ru, 'Расскажите о себе');
  assert.deepEqual(full.key, ['backend', '5 years', 'Node']);
  assert.equal(full.answers.length, 3);

  const partial = parseReply('RU: Расскажите\nKEY: back');
  assert.equal(partial.ru, 'Расскажите');
  assert.deepEqual(partial.answers, []);

  const wrapped = parseReply('RU: a\nA1: first part\nsecond part');
  assert.equal(wrapped.answers[0], 'first part second part');
});

test('buildAnswerMessages embeds resume and history', () => {
  const m = buildAnswerMessages({ resume: 'RESUME_X', job: 'JOB_Y', history: ['h1'], question: 'Q?' });
  assert.match(m[0].content, /RESUME_X/);
  assert.match(m[0].content, /JOB_Y/);
  assert.match(m[1].content, /h1/);
  assert.match(m[1].content, /Q\?/);
});

import { toGeminiBody, GEMINI_MODELS } from '../extension/llm.js';
import { geminiUrl, GEMINI_STT_MODEL, isGemini3 } from '../extension/lib/gemini.js';

test('toGeminiBody maps system/user/assistant and disables thinking', () => {
  const b = toGeminiBody([
    { role: 'system', content: 'SYS' },
    { role: 'user', content: 'Q' },
    { role: 'assistant', content: 'A' },
  ]);
  assert.equal(b.systemInstruction.parts[0].text, 'SYS');
  assert.deepEqual(b.contents.map((c) => c.role), ['user', 'model']);
  assert.equal(b.generationConfig.thinkingConfig.thinkingBudget, 0);
  assert.equal(toGeminiBody([{ role: 'user', content: 'x' }]).systemInstruction, undefined);
});

import { floatToWav, toBase64, buildTranscribeBody, isFatalGeminiError } from '../extension/lib/gemini-stt.js';

test('floatToWav writes a valid 16 kHz mono PCM header', () => {
  const wav = floatToWav(Float32Array.from([0, 1, -1, 0.5]), 16000);
  const v = new DataView(wav.buffer);
  assert.equal(String.fromCharCode(...wav.slice(0, 4)), 'RIFF');
  assert.equal(String.fromCharCode(...wav.slice(8, 12)), 'WAVE');
  assert.equal(v.getUint32(24, true), 16000);
  assert.equal(v.getUint16(22, true), 1);
  assert.equal(v.getUint32(40, true), 8);
  assert.equal(wav.length, 44 + 8);
  assert.equal(v.getInt16(46, true), 32767);
  assert.equal(v.getInt16(48, true), -32768);
});

test('toBase64 handles large buffers', () => {
  const big = new Uint8Array(200000).fill(65);
  assert.equal(Buffer.from(toBase64(big), 'base64').length, 200000);
});

test('buildTranscribeBody embeds audio, hint and previous sentence', () => {
  const b = buildTranscribeBody(new Float32Array(160), { hint: 'Kubernetes, gRPC', previous: 'Tell me more.' });
  const [audio, text] = b.contents[0].parts;
  assert.equal(audio.inlineData.mimeType, 'audio/wav');
  assert.match(text.text, /Kubernetes/);
  assert.match(text.text, /Tell me more/);
  assert.equal(b.generationConfig.temperature, 0);
});

test('isFatalGeminiError', () => {
  assert.equal(isFatalGeminiError({ status: 429 }), true);
  assert.equal(isFatalGeminiError({ status: 500 }), false);
  assert.equal(isFatalGeminiError(new Error('network')), false);
});

import { whisperModelId, whisperOptions, normalizeSize, defaultSize } from '../extension/lib/stt-models.js';
import { buildTranslateMessages } from '../extension/lib/prompt.js';

test('Spanish isQuestion', () => {
  for (const q of [
    '¿Puedes hablarme de tu experiencia con React?',
    'Cuéntame sobre un proyecto difícil',
    'Bueno, entonces, ¿qué te motivó a cambiar de trabajo',
    'Háblame de tus fortalezas.',
    'Por qué quieres trabajar con nosotros',
    'Gracias. Describe tu último proyecto.',
  ]) assert.equal(isQuestion(q, 'es'), true, q);
  for (const t of ['Hola, encantado de conocerte.', 'Somos un equipo de cincuenta ingenieros.', 'Vale, gracias.']) {
    assert.equal(isQuestion(t, 'es'), false, t);
  }
  assert.equal(isQuestion('Y qué tal con Kubernetes', 'es'), true);
  // unaccented conjunctions are not questions (real false positive seen on live speech)
  for (const t of ['que quiero hacer una transferencia bancaria.', 'como te decía, trabajo en backend', 'cuando llegué había un problema']) {
    assert.equal(isQuestion(t, 'es'), false, t);
  }
  // English openers must not fire in Spanish mode and vice versa
  assert.equal(isQuestion('Tell me about yourself.', 'es'), false);
  assert.equal(isQuestion('Cuéntame sobre ti.', 'en'), false);
});

test('isNoise knows Spanish hallucinations', () => {
  for (const t of ['Gracias.', 'Subtítulos realizados por la comunidad de Amara.org', '¡Suscríbete!', 'Gracias por ver el video.']) {
    assert.equal(isNoise(t), true, t);
  }
  assert.equal(isNoise('Gracias, ¿puedes contarme más sobre eso?'), false);
});

test('whisper model selection by language', () => {
  assert.equal(whisperModelId('base', 'en'), 'onnx-community/whisper-base.en');
  assert.equal(whisperModelId('base', 'es'), 'onnx-community/whisper-base');
  assert.equal(whisperModelId('weird', 'en'), 'onnx-community/whisper-base.en');
  assert.deepEqual(whisperOptions('es'), { language: 'spanish', task: 'transcribe' });
  assert.deepEqual(whisperOptions('en'), {});
  assert.equal(normalizeSize('onnx-community/whisper-tiny.en'), 'tiny');
  assert.equal(normalizeSize(undefined), 'base');
});

test('prompts follow interviewer and answer languages', () => {
  const m = buildAnswerMessages({ question: 'Q', interviewerLang: 'es', answerLang: 'en' });
  assert.match(m[0].content, /interviewer, in Spanish/);
  assert.match(m[0].content, /answers in English/);
  assert.match(buildAnswerMessages({ question: 'Q', answerLang: 'ru' })[0].content, /answers in Russian/);
  assert.match(buildTranslateMessages('hola', 'es')[0].content, /Spanish text/);
  assert.match(buildTranscribeBody(new Float32Array(16), { language: 'es' }).contents[0].parts[1].text, /in Spanish/);
});

test('default Whisper size follows the interviewer language', () => {
  assert.equal(whisperModelId(defaultSize('en'), 'en'), 'onnx-community/whisper-base.en');
  assert.equal(whisperModelId(defaultSize('es'), 'es'), 'onnx-community/whisper-small');
});

test('Gemini 3.x requests omit thinkingBudget and temperature; 2.x keep them', () => {
  const msgs = [{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }];
  const g3 = toGeminiBody(msgs, 'gemini-3.5-flash-lite').generationConfig;
  assert.deepEqual(Object.keys(g3), ['maxOutputTokens']);
  const g25 = toGeminiBody(msgs, 'gemini-2.5-flash-lite').generationConfig;
  assert.equal(g25.thinkingConfig.thinkingBudget, 0);
  assert.equal(g25.temperature, 0.5);
  assert.equal(isGemini3('gemini-3.5-flash-lite'), true);
  assert.equal(isGemini3('gemini-2.5-flash'), false);
});

test('answers default to 3.5 Flash-Lite while speech recognition uses a documented audio model', () => {
  assert.equal(GEMINI_MODELS[0], 'gemini-3.5-flash-lite');
  assert.equal(GEMINI_STT_MODEL, 'gemini-2.5-flash-lite');
  assert.equal(geminiUrl('gemini-3.5-flash-lite', 'streamGenerateContent'),
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:streamGenerateContent');
  assert.equal(isFatalGeminiError({ status: 404 }), true);
});

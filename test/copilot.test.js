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

import { toGeminiBody } from '../extension/llm.js';

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

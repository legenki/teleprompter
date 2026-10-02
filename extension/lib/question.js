// Cheap heuristic: does this interviewer line need an answer, or just a translation?

const OPENERS = [
  'what', 'why', 'how', 'when', 'where', 'who', 'which', 'whose',
  'can you', 'could you', 'would you', 'will you', 'do you', 'did you', 'does', 'have you',
  'are you', 'were you', 'is there', 'was there', 'should', 'tell me', 'walk me',
  'describe', 'explain', 'give me', 'talk about', 'talk me', 'share', 'let\'s talk',
  'i\'d like to hear', 'i would like to hear', 'i\'m curious', 'any experience',
];

const FILLERS = /^(ok(ay)?|so|well|right|alright|great|and|um+|uh+|yeah|yes|sure|and then|now)[,.\s]+/i;

export function isQuestion(text) {
  const t = (text || '').trim();
  if (t.length < 8) return false;
  if (t.includes('?')) return true;

  // Check the start of any sentence: "Thanks. Walk me through your last project."
  const sentences = t.split(/(?<=[.!])\s+/);
  return sentences.some((s) => {
    let lower = s.trim().toLowerCase();
    while (FILLERS.test(lower)) lower = lower.replace(FILLERS, '');
    return OPENERS.some((o) => lower === o || lower.startsWith(o + ' '));
  });
}

// Whisper hallucinates these on near-silence / music.
const NOISE = /^[\s.♪\[\](){}-]*(thank you\.?|thanks for watching\.?|you|bye\.?|\[.*\]|\(.*\))?[\s.]*$/i;

export function isNoise(text) {
  const t = (text || '').trim();
  return t.length < 2 || NOISE.test(t);
}

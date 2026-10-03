// Cheap heuristic: does this interviewer line need an answer, or just a translation?

const OPENERS = {
  en: [
    'what', 'why', 'how', 'when', 'where', 'who', 'which', 'whose',
    'can you', 'could you', 'would you', 'will you', 'do you', 'did you', 'does', 'have you',
    'are you', 'were you', 'is there', 'was there', 'should', 'tell me', 'walk me',
    'describe', 'explain', 'give me', 'talk about', 'talk me', 'share', 'let\'s talk',
    'i\'d like to hear', 'i would like to hear', 'i\'m curious', 'any experience',
  ],
  // Imperatives / fixed phrases: matched ignoring accents (Whisper often drops them).
  es: [
    'puedes', 'podrias', 'podria', 'sabes', 'tienes', 'has', 'han', 'habias', 'eres', 'estas', 'estarias', 'te gustaria',
    'cuentame', 'hablame', 'platicame', 'dime', 'describe', 'describeme', 'explica', 'explicame', 'dame', 'comparte', 'comentame',
    'me gustaria saber', 'me gustaria que', 'quisiera saber', 'tienes experiencia', 'alguna vez', 'quiero que', 'preguntaria',
  ],
};

// Spanish interrogatives are only questions WITH the accent; unaccented "que/como/cuando/donde" are
// conjunctions/relatives ("que quiero hacer una transferencia") and would cause false positives.
const ES_INTERROGATIVES = [
  'qué', 'por qué', 'cómo', 'cuándo', 'dónde', 'adónde', 'quién', 'quiénes', 'cuál', 'cuáles', 'cuánto', 'cuántos', 'cuánta', 'cuántas',
];

const FILLERS = {
  en: /^(ok(ay)?|so|well|right|alright|great|and then|and|um+|uh+|yeah|yes|sure|now)[,.\s]+/i,
  es: /^(vale|bueno|bien|pues|entonces|ok(ey)?|claro|perfecto|genial|y|eh+|mm+|si|sí|ahora|a ver|venga)[,.\s]+/i,
};

const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

export function isQuestion(text, lang = 'en') {
  const t = (text || '').trim();
  if (t.length < 8) return false;
  if (t.includes('?') || t.includes('¿')) return true;

  const openers = OPENERS[lang] || OPENERS.en;
  const filler = FILLERS[lang] || FILLERS.en;
  // Check the start of any sentence: "Thanks. Walk me through your last project."
  const sentences = t.split(/(?<=[.!])\s+/);
  const starts = (text, list) => list.some((o) => text === o || text.startsWith(o + ' '));
  return sentences.some((s) => {
    let accented = s.trim().toLowerCase();
    // Accent stripping keeps string length, so the match length can be applied to the accented text.
    for (let m; (m = stripAccents(accented).match(filler));) accented = accented.slice(m[0].length);
    if (lang === 'es' && starts(accented, ES_INTERROGATIVES)) return true;
    return starts(stripAccents(accented), openers);
  });
}

// Whisper hallucinates these on near-silence / music.
const NOISE = /^[\s.♪¡!\[\](){}-]*(thank you\.?|thanks for watching\.?|you|bye\.?|gracias\.?|gracias por ver (el|este) v[ií]deo\.?|hasta (la pr[oó]xima|luego)\.?|adi[oó]s\.?|\[.*\]|\(.*\))?[\s.!]*$/i;
const NOISE_PHRASES = /(subt[ií]tulos? (realizados? )?por|amara\.org|suscr[ií]bete|subscribe to|thanks for watching)/i;

export function isNoise(text) {
  const t = (text || '').trim();
  return t.length < 2 || NOISE.test(t) || NOISE_PHRASES.test(t);
}

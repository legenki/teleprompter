// Prompt building and incremental parsing of the line-based LLM reply.

const STYLE = {
  short: 'Each answer must be ONE sentence (max 25 words).',
  medium: 'Each answer must be 1-2 sentences (max 45 words).',
};

export const LANG_NAMES = { en: 'English', es: 'Spanish', ru: 'Russian' };

export function buildAnswerMessages({ resume, job, style = 'short', history, question, interviewerLang = 'en', answerLang = 'en' }) {
  const from = LANG_NAMES[interviewerLang] || 'English';
  const to = LANG_NAMES[answerLang] || 'English';
  const system = [
    `You are a real-time interview copilot for a candidate. You hear the interviewer, in ${from}.`,
    `The candidate answers in ${to}; the candidate reads Russian.`,
    resume ? `CANDIDATE RESUME:\n${resume.slice(0, 4000)}` : '',
    job ? `JOB DESCRIPTION:\n${job.slice(0, 3000)}` : '',
    'Reply in EXACTLY this line format, nothing else:',
    `RU: <natural Russian translation of the interviewer's latest question>`,
    `KEY: <3-5 short ${to} keywords/phrases to hit, separated by " | ">`,
    `A1: <answer option 1, ${to}, first person, grounded in the resume>`,
    'A2: <answer option 2, different angle>',
    'A3: <answer option 3, different angle>',
    STYLE[style] || STYLE.short,
    'Never invent employers, titles or numbers that are not in the resume; if unsure, answer generally and honestly.',
  ].filter(Boolean).join('\n');

  const user = [
    history?.length ? `Recent interviewer lines:\n${history.map((h) => `- ${h}`).join('\n')}` : '',
    `Latest interviewer line to answer:\n${question}`,
  ].filter(Boolean).join('\n\n');

  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

export function buildTranslateMessages(text, interviewerLang = 'en') {
  const from = LANG_NAMES[interviewerLang] || 'English';
  return [
    { role: 'system', content: `Translate the ${from} text to natural spoken Russian. Reply with the translation only, prefixed by "RU: ".` },
    { role: 'user', content: text },
  ];
}

// Parses (possibly partial) model output into { ru, key[], answers[] }.
export function parseReply(raw) {
  const out = { ru: '', key: [], answers: [] };
  let current = null;
  for (const line of String(raw).split('\n')) {
    const m = line.match(/^\s*(RU|KEY|A[1-3])\s*:\s*(.*)$/i);
    if (m) {
      current = m[1].toUpperCase();
      const val = m[2].trim();
      if (current === 'RU') out.ru = val;
      else if (current === 'KEY') out.key = splitKeys(val);
      else out.answers[Number(current[1]) - 1] = val;
    } else if (current && line.trim()) {
      // continuation of a wrapped line
      const val = line.trim();
      if (current === 'RU') out.ru += ' ' + val;
      else if (current === 'KEY') out.key = splitKeys(out.key.join(' | ') + ' ' + val);
      else out.answers[Number(current[1]) - 1] += ' ' + val;
    }
  }
  out.answers = out.answers.filter(Boolean);
  return out;
}

function splitKeys(s) {
  return s.split(/\s*[|;]\s*/).map((k) => k.trim()).filter(Boolean);
}

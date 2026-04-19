// ── Title generation & duplicate detection helpers ────────────

const TITLE_STOP = new Set([
  'the','and','for','you','are','all','our','with','this','that','will','from','have',
  'your','can','just','when','into','more','every','only','been','not','but','was','one',
  'we','my','by','of','in','to','a','an','is','it','at','be','on','so','up','as',
  'come','bring','upon','let','him','her','his','they','me','us',
]);

function toTitleCase(str) {
  return str.toLowerCase().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function generateVideoTitle(topic, scriptLines) {
  if (!scriptLines.length && !topic) return '';
  const candidates = new Set();

  const allWords = scriptLines
    .flatMap(l => l.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/))
    .filter(w => w.length > 3 && !TITLE_STOP.has(w));
  const uniqueWords = [...new Set(allWords)];

  // First line
  if (scriptLines.length > 0) {
    const first = scriptLines[0].trim();
    const words = first.split(/\s+/);
    if (words.length <= 5) candidates.add(toTitleCase(first));
    else                   candidates.add(toTitleCase(words.slice(0, 4).join(' ')));
  }

  // Last line (climax)
  if (scriptLines.length > 2) {
    const last = scriptLines[scriptLines.length - 1].trim();
    const words = last.split(/\s+/);
    if (words.length <= 5) candidates.add(toTitleCase(last));
  }

  // Topic alone
  if (topic) candidates.add(toTitleCase(topic));

  // Topic + top script word
  if (topic && uniqueWords.length > 0) {
    const topicWords = topic.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !TITLE_STOP.has(w));
    if (topicWords.length > 0) {
      candidates.add(toTitleCase(`${topicWords[0]} ${uniqueWords[0]}`));
      if (uniqueWords.length > 1)
        candidates.add(toTitleCase(`${topicWords[0]} ${uniqueWords[1]}`));
    }
  }

  // Two most meaningful script words
  if (uniqueWords.length >= 2) {
    candidates.add(toTitleCase(`${uniqueWords[0]} ${uniqueWords[1]}`));
    if (uniqueWords.length >= 3)
      candidates.add(toTitleCase(`${uniqueWords[0]} ${uniqueWords[1]} ${uniqueWords[2]}`));
  }

  // Topic + middle line snippet
  if (topic && scriptLines.length > 2) {
    const mid = scriptLines[Math.floor(scriptLines.length / 2)].trim();
    const words = mid.split(/\s+/);
    candidates.add(toTitleCase(`${topic} — ${words.slice(0, 3).join(' ')}`));
  }

  const pool = [...candidates].filter(Boolean);
  return pool[Math.floor(Math.random() * pool.length)] || topic || 'Untitled';
}

export function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Returns { name, source } of first duplicate found, or null.
// Only warns on an exact title match (case-insensitive, punctuation-ignored).
// existingTitles: array of { name: string, source: string }
export function findDuplicateTitle(userTitle, existingTitles) {
  if (!userTitle || !userTitle.trim() || !existingTitles.length) return null;
  const userNorm = normalizeTitle(userTitle);
  for (const entry of existingTitles) {
    const existingName = typeof entry === 'string' ? entry : entry.name;
    const source       = typeof entry === 'string' ? null   : entry.source;
    const existNorm    = normalizeTitle(existingName);
    if (existNorm === userNorm) return { name: existingName, source };
  }
  return null;
}

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = new URL('..', import.meta.url);
const catalogPath = path.join(root.pathname, 'lesson-catalog.json');
const bankPath = path.join(root.pathname, 'lesson-bank.json');
const outputPath = path.join(root.pathname, 'daily-lessons.json');
const tz = 'Asia/Taipei';

const fmtDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: tz,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const today = fmtDate.format(new Date());
const seed = [...today].reduce((acc, ch) => ((acc * 31) + ch.charCodeAt(0)) >>> 0, 7);

function rngFactory(initial) {
  let state = initial >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const rand = rngFactory(seed);
const score = (lesson) => {
  const base = (lesson.appearedCount || 0) * 1000 + (lesson.lastSeen ? 10 : 0) + (lesson.difficulty || 0) * 3;
  return base + Math.floor(rand() * 100);
};

const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const bank = JSON.parse(await readFile(bankPath, 'utf8'));
const bankMap = new Map((bank.lessons || []).map((item) => [item.id, item]));

const modes = ['reading', 'listening'];
const daily = { reading: [], listening: [] };

for (const mode of modes) {
  const all = catalog.lessons.filter((lesson) => lesson.mode === mode);
  const review = all.filter((lesson) => bankMap.has(lesson.id));
  const fresh = all.filter((lesson) => !bankMap.has(lesson.id));

  const reviewPick = [...review].sort((a, b) => score(a) - score(b)).slice(0, 2);
  const freshPick = [...fresh].sort((a, b) => score(a) - score(b)).slice(0, 1);
  const selected = [...reviewPick, ...freshPick];

  while (selected.length < 3) {
    const fallback = [...all].sort((a, b) => score(a) - score(b)).find((lesson) => !selected.some((s) => s.id === lesson.id));
    if (!fallback) break;
    selected.push(fallback);
  }

  daily[mode] = selected.map((lesson) => ({
    title: lesson.title,
    prompt: lesson.prompt,
    romaji: lesson.romaji,
    hint: lesson.hint || '',
    audio: lesson.audio,
    choices: lesson.choices,
  }));
}

const updatedLessons = [...(bank.lessons || [])];
for (const lesson of [...daily.reading, ...daily.listening]) {
  const match = catalog.lessons.find((item) => item.title === lesson.title && item.prompt === lesson.prompt && item.mode);
  if (!match) continue;
  const existing = updatedLessons.find((item) => item.id === match.id);
  if (existing) {
    existing.appearedCount = (existing.appearedCount || 0) + 1;
    existing.lastSeen = today;
    existing.status = 'used';
  } else {
    updatedLessons.push({
      id: match.id,
      topic: match.topic,
      mode: match.mode,
      difficulty: match.difficulty,
      status: 'used',
      appearedCount: 1,
      lastSeen: today,
      prompt: match.prompt,
    });
  }
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify({
  date: today,
  timezone: tz,
  source: 'lesson-catalog.json',
  reading: daily.reading,
  listening: daily.listening,
}, null, 2));
await writeFile(bankPath, JSON.stringify({
  ...bank,
  version: bank.version || 1,
  policy: bank.policy,
  lessons: updatedLessons,
}, null, 2));

console.log(`Wrote daily-lessons.json for ${today}`);
console.log(`Selected reading: ${daily.reading.map((l) => l.title).join(', ')}`);
console.log(`Selected listening: ${daily.listening.map((l) => l.title).join(', ')}`);

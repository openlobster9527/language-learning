import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = new URL('..', import.meta.url);
const pendingPath = path.join(root.pathname, 'daily-lessons.pending.json');
const livePath = path.join(root.pathname, 'daily-lessons.json');
const bankPath = path.join(root.pathname, 'lesson-bank.json');
const tz = 'Asia/Taipei';

function formatDate(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function stripInternalFields(lesson) {
  const { id, mode, ...rest } = lesson;
  return rest;
}

const pending = JSON.parse(await readFile(pendingPath, 'utf8'));
const today = formatDate(new Date());

if (pending.date !== today) {
  throw new Error(`Pending lesson date ${pending.date} does not match today ${today}`);
}

try {
  const live = JSON.parse(await readFile(livePath, 'utf8'));
  if (live.date === pending.date) {
    console.log(`daily-lessons.json already published for ${pending.date}`);
    process.exit(0);
  }
} catch {
  // No live file yet; continue.
}

const bank = JSON.parse(await readFile(bankPath, 'utf8'));
const updatedLessons = [...(bank.lessons || [])];
const selectedLessons = [...(pending.reading || []), ...(pending.listening || [])];

for (const lesson of selectedLessons) {
  const existing = updatedLessons.find((item) => item.id === lesson.id);
  if (existing) {
    existing.appearedCount = (existing.appearedCount || 0) + 1;
    existing.lastSeen = pending.date;
    existing.status = 'used';
  } else {
    updatedLessons.push({
      id: lesson.id,
      topic: lesson.topic,
      mode: lesson.mode,
      difficulty: lesson.difficulty,
      status: 'used',
      appearedCount: 1,
      lastSeen: pending.date,
      prompt: lesson.prompt,
    });
  }
}

await writeFile(livePath, JSON.stringify({
  date: pending.date,
  timezone: pending.timezone || tz,
  source: pending.source || 'lesson-catalog.json',
  reading: (pending.reading || []).map(stripInternalFields),
  listening: (pending.listening || []).map(stripInternalFields),
}, null, 2));

await writeFile(bankPath, JSON.stringify({
  ...bank,
  version: bank.version || 1,
  policy: bank.policy,
  lessons: updatedLessons,
}, null, 2));

console.log(`Published daily-lessons.json for ${pending.date}`);
console.log(`Reading: ${(pending.reading || []).map((l) => l.title).join(', ')}`);
console.log(`Listening: ${(pending.listening || []).map((l) => l.title).join(', ')}`);

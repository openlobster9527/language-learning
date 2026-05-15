import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = new URL('..', import.meta.url);
const catalogPath = path.join(root.pathname, 'lesson-catalog.json');
const bankPath = path.join(root.pathname, 'lesson-bank.json');
const liveOutputPath = path.join(root.pathname, 'daily-lessons.json');
const stageOutputPath = path.join(root.pathname, 'daily-lessons.pending.json');
const tz = 'Asia/Taipei';

function parseArgs(argv) {
  const args = { date: 'today', stageOnly: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--date') {
      args.date = argv[i + 1];
      i += 1;
    } else if (token === '--stage-only') {
      args.stageOnly = true;
    } else if (token === '--output') {
      args.output = argv[i + 1];
      i += 1;
    } else if (token === '--bank-output') {
      args.bankOutput = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function resolveOutputPath(value, fallback) {
  if (!value) return fallback;
  return path.isAbsolute(value) ? value : path.join(root.pathname, value);
}

function resolveDateLabel(spec) {
  const now = new Date();
  if (!spec || spec === 'today') return formatDate(now);
  if (spec === 'tomorrow') return formatDate(new Date(now.getTime() + 86400000));
  if (spec === 'yesterday') return formatDate(new Date(now.getTime() - 86400000));
  if (/^\d{4}-\d{2}-\d{2}$/.test(spec)) return spec;
  throw new Error(`Unsupported date spec: ${spec}`);
}

function formatDate(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function rngFactory(initial) {
  let state = initial >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function stripInternalFields(lesson) {
  const { id, mode, ...rest } = lesson;
  return rest;
}

const args = parseArgs(process.argv.slice(2));
const today = resolveDateLabel(args.date);
const seed = [...today].reduce((acc, ch) => ((acc * 31) + ch.charCodeAt(0)) >>> 0, 7);
const rand = rngFactory(seed);
const score = (lesson) => {
  const base = (lesson.appearedCount || 0) * 1000 + (lesson.lastSeen ? 10 : 0) + (lesson.difficulty || 0) * 3;
  return base + Math.floor(rand() * 100);
};

const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const bank = JSON.parse(await readFile(bankPath, 'utf8'));
const bankMap = new Map((bank.lessons || []).map((item) => [item.id, item]));

const modes = ['reading', 'listening'];
const staged = { reading: [], listening: [] };
const publicDaily = { reading: [], listening: [] };

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

  staged[mode] = selected.map((lesson) => ({
    id: lesson.id,
    title: lesson.title,
    prompt: lesson.prompt,
    romaji: lesson.romaji,
    hint: lesson.hint || '',
    audio: lesson.audio,
    choices: lesson.choices,
  }));

  publicDaily[mode] = selected.map(stripInternalFields);
}

const updatedLessons = [...(bank.lessons || [])];
for (const lesson of [...staged.reading, ...staged.listening]) {
  const existing = updatedLessons.find((item) => item.id === lesson.id);
  if (existing) {
    existing.appearedCount = (existing.appearedCount || 0) + 1;
    existing.lastSeen = today;
    existing.status = 'used';
  } else {
    updatedLessons.push({
      id: lesson.id,
      topic: catalog.lessons.find((item) => item.id === lesson.id)?.topic,
      mode: catalog.lessons.find((item) => item.id === lesson.id)?.mode,
      difficulty: catalog.lessons.find((item) => item.id === lesson.id)?.difficulty,
      status: 'used',
      appearedCount: 1,
      lastSeen: today,
      prompt: lesson.prompt,
    });
  }
}

const livePayload = {
  date: today,
  timezone: tz,
  source: 'lesson-catalog.json',
  reading: publicDaily.reading,
  listening: publicDaily.listening,
};

const stagePayload = {
  ...livePayload,
  reading: staged.reading,
  listening: staged.listening,
  selected: {
    reading: staged.reading.map((lesson) => lesson.id),
    listening: staged.listening.map((lesson) => lesson.id),
  },
};

if (args.stageOnly) {
  const outputPath = resolveOutputPath(args.output, stageOutputPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(stagePayload, null, 2));
  console.log(`Staged daily-lessons for ${today}`);
  console.log(`Selected reading: ${staged.reading.map((l) => l.title).join(', ')}`);
  console.log(`Selected listening: ${staged.listening.map((l) => l.title).join(', ')}`);
} else {
  const outputPath = resolveOutputPath(args.output, liveOutputPath);
  const bankOutputPath = resolveOutputPath(args.bankOutput, bankPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await mkdir(path.dirname(bankOutputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(livePayload, null, 2));
  await writeFile(bankOutputPath, JSON.stringify({
    ...bank,
    version: bank.version || 1,
    policy: bank.policy,
    lessons: updatedLessons,
  }, null, 2));
  console.log(`Wrote daily-lessons.json for ${today}`);
  console.log(`Selected reading: ${staged.reading.map((l) => l.title).join(', ')}`);
  console.log(`Selected listening: ${staged.listening.map((l) => l.title).join(', ')}`);
}

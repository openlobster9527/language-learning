# language-learning

Interactive language learning pages for GitHub Pages.

## Goal
- Turn newsletter-style lessons into simple web exercises.
- Start with lightweight HTML that can grow into full interactive practice.

## Daily update flow
- `scripts/generate-daily-lesson.mjs` can build either the live file or a staged `daily-lessons.pending.json` draft.
- `scripts/publish-daily-lesson.mjs` promotes the staged draft to `daily-lessons.json` and updates `lesson-bank.json`.
- `daily-lessons.json` is fetched by `index.html` when available.

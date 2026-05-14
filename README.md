# language-learning

Interactive language learning pages for GitHub Pages.

## Goal
- Turn newsletter-style lessons into simple web exercises.
- Start with lightweight HTML that can grow into full interactive practice.

## Daily update flow
- `scripts/generate-daily-lesson.mjs` builds today's reading/listening set.
- `daily-lessons.json` is fetched by `index.html` when available.
- GitHub Actions runs daily and commits the refreshed lesson data.

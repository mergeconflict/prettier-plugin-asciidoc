# Task Completion Checklist

When a task is completed, run these in order:

1. `npm run check` — TypeScript type checking passes
2. `npm run lint` — ESLint passes with zero warnings
3. `npm test` — all Vitest tests pass
4. `npm run build` — tsup build succeeds

All four must pass before considering a task done.

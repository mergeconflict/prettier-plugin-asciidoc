# Task Completion Checklist

When a task is completed, run these in order:

1. `bun run check` — TypeScript type checking passes
2. `bun run lint` — ESLint passes with zero warnings
3. `bun test` — all Vitest tests pass
4. `bun run build` — build succeeds

All four must pass before considering a task done.

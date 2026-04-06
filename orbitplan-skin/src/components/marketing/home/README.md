# Marketing / homepage components

- **`content.ts`** — copy and structured data (single place to edit strings).
- **`marketing-section.tsx`** — consistent vertical rhythm (`mt-8` / `mt-10`) + grid shell.
- **`revealed-card-grid.tsx`** — reusable `Reveal` + `Card` grid for feature-style blocks.
- **`*-section.tsx`** — one focused section per file; easy to test and reorder from `app/page.tsx`.

Add new landing blocks by creating `something-section.tsx` and composing it in `src/app/page.tsx`.

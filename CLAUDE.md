# Working in this repo

Read `README.md` first — it is the spec, not just a description, and the
contest rules in it are the requirements.

## Conventions

- **Scoring lives in two places on purpose.** The `bracket_pick_scores` SQL
  view is what the app reads; `scorePick()` in `src/lib/domain/scoring.ts`
  mirrors it for anything that needs to score in TypeScript. Change one and
  you must change the other, and add a case to
  `supabase/tests/checks.sql`.
- **The scoring values are data, not constants.** They live in the
  `scoring_config` row and the commissioner edits them. Never hardcode 1/2/3/5.
- **The entry window and pick privacy are enforced in Postgres**, by
  `picks_open()`, `picks_locked()`, `picks_editable()` and the RLS policies
  written against them. UI checks are for rendering only; ask the database with
  `picksEditable()` — or `picksLocked()`/`picksOpen()` when a message has to
  tell the two ends apart — rather than comparing clocks, so the page can't
  disagree with what a write will be allowed to do.
- **`bracket_picks.predicted_games` is nullable and must stay that way.** A
  player picks a winner and a length as two separate answers, and the length
  bonus pays only on a number somebody chose. Anything that reads the column
  has to handle null — in SQL that means `coalesce(... = ..., false)`, since
  `null = 3` is null, not false.
- **Migrations are numbered and applied by hand** in the Supabase SQL editor.
  There is no runner. Never edit an applied migration — add a new one.
- Types in `src/lib/supabase/types.ts` are **type aliases, not interfaces**.
  postgrest-js constrains each Row to `Record<string, unknown>`, which an
  interface does not satisfy, and the failure mode is every query result
  silently becoming `never`.

## Before pushing

```bash
npm run test          # domain logic
./supabase/tests/run.sh   # schema, scoring views, RLS (needs local Postgres)
npx tsc --noEmit
npx eslint
npm run build
```

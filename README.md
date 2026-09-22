# October — MLB Playoff Bracket

A postseason prediction contest for 5 friends. Before the first pitch of the
Wild Card round, everyone fills out the entire playoff bracket — who wins each
of the 11 series, and how many games each one takes — plus a World Series MVP
and a tiebreaker. Then the app watches the games and keeps score.

This README is the full spec, and **Build order** at the bottom tracks what is
done.

---

## How the contest works

### The bracket

Twelve teams make the playoffs, six per league. The top two seeds in each
league get a bye; the other four play a best-of-three Wild Card Series. The
bracket is fixed by seed, so it's the same 11 series every year:

| Series | Matchup | Format |
|---|---|---|
| Wild Card (×4) | 3 vs 6, and 4 vs 5, in each league | Best-of-3, higher seed hosts all games |
| Division Series (×4) | 1 vs winner of 4/5, and 2 vs winner of 3/6 | Best-of-5, 2-2-1 |
| League Championship (×2) | The two Division Series winners in each league | Best-of-7, 2-3-2 |
| World Series (×1) | AL champion vs NL champion | Best-of-7, 2-3-2 |

Every player fills out all 11 slots before the playoffs begin. Because the
bracket is a tree, your Division Series pick is between the bye seed and
*whoever you yourself predicted* to win the Wild Card round — the form only
offers you the teams your own earlier picks left alive.

So a complete entry is: 11 series winners, 11 series lengths, one World Series
MVP, and one tiebreaker number.

### Scoring

**Series winners** are worth more the deeper the round goes:

| Round | Points |
|---|---|
| Wild Card | 1 |
| Division Series | 2 |
| League Championship | 3 |
| World Series | 5 |

**Winners are scored on advancement, not on the matchup.** A series slot asks
one question: who came out of it. If you said the Dodgers win the NLCS and they
did, you score it — it doesn't matter that you had them beating the Phillies and
they actually beat the Cubs. One early upset doesn't kill the rest of your
bracket.

**Series length** is worth a flat **+1**, and only if you also got the winner
right. Calling "Yankees in 5" and watching the Yankees win in 6 scores the
winner points and no bonus.

**World Series MVP** is worth **+3**. You pick any player on any of the twelve
playoff teams; the commissioner records the actual winner when it's announced.

**Tiebreaker: total runs.** Every player guesses the total runs scored by both
teams across every game of the entire postseason. It is only consulted if two
or more players finish tied at the top, and then the closest guess wins. Two
equidistant guesses stay tied.

**Final score** = series winner points + length bonuses + MVP bonus. With the
default values above, a perfect bracket is 23 + 11 + 3 = **37 points**.

Every one of these numbers — the four round values, the length bonus, and the
MVP bonus — is editable by the commissioner on `/admin`, and the scoring views
read them from the database rather than hardcoding them. Changing a value
re-scores everyone immediately.

### Entering, and the lock

The playoff field isn't known until the regular season ends on **Sunday,
September 27, 2026**, and the Wild Card round starts **Tuesday, September 29**.
So the entry window is roughly two days: the commissioner sets the twelve seeds
as soon as they're final, everyone fills out a bracket, and everything locks at
first pitch of the first Wild Card game.

**Picks are private until the lock.** Before it, you can see your own bracket
and nobody else's; the leaderboard shows only who has entered. After it, every
bracket is visible to everyone. The commissioner can see all picks at all times,
so they can chase down whoever hasn't entered.

The lock timestamp is a setting, not a constant — the commissioner can move it
from `/admin` if a game gets postponed, and the database enforces it (see
**Auth & authorization**).

---

## Architecture

### Stack

| Layer | Choice |
|---|---|
| Framework | [Next.js](https://nextjs.org) App Router, TypeScript, server components + server actions |
| Database, Auth, RLS | [Supabase](https://supabase.com) (Postgres) |
| Styling | [Tailwind CSS](https://tailwindcss.com) |
| Score data | ESPN's public (unofficial) MLB scoreboard endpoint |
| Hosting | [Vercel](https://vercel.com), including Vercel Cron |

Deliberately *not* in v1: the Twilio group text and the Claude-written recaps
from `nfl-over-unders`. The postseason is five weeks long and the bracket has to
be live in a week, so notifications come after entries lock, if at all.

There is also no draft here. Everyone predicts the same games independently, so
there is no snake order, no draft board, no realtime and no turn notifications —
the whole draft subsystem of the other two contests is replaced by one bracket
form.

### Auth & authorization

- Email/password via Supabase Auth. A `handle_new_user` trigger on `auth.users`
  creates the matching `profiles` row on signup.
- `profiles.is_commissioner` gates admin writes, through an `is_commissioner()`
  SQL helper used by the RLS policies. A `before update` trigger reverts any
  attempt by a signed-in user to set that column on themselves.
- A `picks_locked()` SQL helper reads `app_settings.picks_lock_at` and is what
  the prediction tables' policies are written against, so the lock is enforced
  in the database and not only in the UI:

  | Table | Select | Insert / update |
  |---|---|---|
  | `bracket_picks` | own rows, or any row if `is_commissioner()` or `picks_locked()` | own rows, and only while `not picks_locked()` |
  | `mvp_picks` | same | same |
  | `tiebreaker_predictions` | same | same |

- Reference data (`teams`, `players`, `playoff_seeds`, `series`, `games`,
  `scoring_config`) is readable by any signed-in player and writable only by the
  commissioner or the service role.
- Next.js middleware refreshes the auth cookie on every request and redirects
  signed-out visitors to `/login`, except `/login` and anything under `/api/`
  (API routes authenticate themselves).

### Data model

| Table | Purpose |
|---|---|
| `profiles` | One row per player: display name, email, commissioner flag |
| `teams` | All 30 MLB teams — name, code, league, division |
| `players` | Rosters of the twelve playoff teams, synced once the field is set; the MVP pick points at one of these |
| `playoff_seeds` | The field: `(league, seed 1–6) → team_id` |
| `series` | The 11 bracket slots, seeded once and never changed — round, league, best-of, and which slots feed into them |
| `games` | Synced from ESPN, keyed by ESPN's event id, each attached to a series |
| `bracket_picks` | One row per player per series: predicted winner and predicted number of games |
| `mvp_picks` | One row per player: predicted World Series MVP |
| `tiebreaker_predictions` | One row per player: total playoff runs guess |
| `world_series_mvp` | Single row, commissioner-set: the actual MVP |
| `scoring_config` | Single row: the four round values, the length bonus, the MVP bonus |
| `app_settings` | Key/value — `picks_lock_at`, `last_synced_at` |

`series` rows are identified by stable keys so picks and results always line up,
whichever teams end up in them:

```
AL_WC_36   AL_WC_45   NL_WC_36   NL_WC_45
AL_DS_1    AL_DS_2    NL_DS_1    NL_DS_2     (DS_1 = 1 seed vs the 4/5 winner)
AL_CS      NL_CS      WS
```

Derived, read-only SQL views:

- `series_results` — per series: each side's wins, games played so far, and the
  winner once a side reaches `ceil(best_of / 2)`.
- `bracket_pick_scores` — per pick: resolved, correct, and points, joined
  against `scoring_config`. Mirrors `scorePick()` in TypeScript.
- `playoff_total_runs` — every run scored in every final playoff game, for the
  tiebreaker.
- `overall_leaderboard` — per player: series points, MVP points, total, and the
  tiebreaker guess with its distance from the running total.

Migrations are numbered under `supabase/migrations/` and applied by hand in the
Supabase SQL editor — no automated runner, same as `nfl-over-unders`.

### Score sync

`src/app/api/sync/games/route.ts`, reachable three ways:

- **`GET`** with `Authorization: Bearer $CRON_SECRET` — Vercel Cron.
- **`POST`** from a signed-in commissioner — the "Sync scores now" button.
- **`syncIfStale()`**, called by the page layout, which fires a sync in the
  background when `last_synced_at` is more than 10 minutes old and someone loads
  a page.

That third path is load-bearing, because this deploys to Vercel's Hobby plan,
which caps cron jobs at one run per day each — useless for a postseason where
games finish at 11pm and people check the leaderboard at 11:05. The stale-read
trigger is what actually keeps the site fresh, since it fires whenever anyone is
looking at it; the two daily crons are only a floor, so the data is still
current if nobody visits all day. (On a Pro plan this would collapse to one
every-15-minutes cron and `syncIfStale()` could go.)

Each run:

1. Fetches ESPN's MLB scoreboard a calendar month at a time (`202609`,
   `202610`). ESPN stopped accepting `dates=` ranges in September 2026 — single
   day, month or year still work.
2. **Advances the bracket** — fills each series' two participants from
   `playoff_seeds` and from the winners of the series feeding it. This runs
   before games are attached, so a new round's slots exist by the time its games
   show up.
3. **Attaches games to series by team pair.** Two teams meet in exactly one
   series per postseason, so the unordered pair `{home, away}` identifies the
   slot unambiguously — no dependence on ESPN's own series metadata, which isn't
   guaranteed to be there. A game between two teams that no open slot expects is
   skipped and picked up on the next run.
4. Upserts each game by ESPN's event id, numbering games within a series by
   start time.
5. Records `last_synced_at`.

Scores, series winners, series lengths and the leaderboard are all derived in
SQL from `games`, so re-running a sync is always safe and never double-counts.

ESPN's endpoint sits behind bot protection that fingerprints the TLS handshake
against the User-Agent, so a browser-like UA from a server gets 403'd — send a
plain one (`curl/8.7.1`) and retry a couple of variants with backoff, exactly as
`nfl-over-unders` does.

### Scoring code

`scorePick()` in `src/lib/domain/scoring.ts` takes the scoring config, a pick
and a series result, and returns `{ resolved, correct, lengthBonus, points }`.
It is mirrored by the `bracket_pick_scores` SQL view; the two are kept in sync by
hand, and a comment at the top of each points at the other.

---

## Pages

**`/`** — The rules, a countdown to the lock, and where the postseason currently
stands.

**`/login`** — Sign in and sign up.

**`/my-bracket`** — The entry form. Pick a winner and a game count for each
series, working forward through the rounds; later rounds offer only the teams
your own earlier picks left alive. Then the MVP pick and the tiebreaker. After
the lock this becomes a read-only view of your bracket with each pick marked
hit, missed or still alive.

**`/leaderboard`** — Standings. Before the lock it shows only who has entered;
after it, the full table plus everyone's bracket.

**`/series`** — All 11 series with their current state: participants, game
scores, who's ahead, and how each player's pick is doing.

**`/profile`** — Display name and email.

**`/admin`** — Commissioner only, collapsible sections in the style of
`nfl-over-unders`:

- **Participants** — who's signed up, who's entered a bracket.
- **Playoff field** — set the twelve seeds. A "Pull from ESPN" button fills them
  in from ESPN's standings once the regular season ends; every row stays
  editable by hand, so a failed or wrong pull is never a blocker. Filling the
  field also syncs the twelve teams' rosters into `players`.
- **Scoring** — the four round values, the length bonus, the MVP bonus.
- **Lock time** — the entry deadline.
- **Scores** — last sync time and a manual sync button.
- **World Series MVP** — record the actual winner.

---

## Project structure

```
src/
  app/
    page.tsx                  Home — rules, lock countdown, postseason status
    login/                    Sign in / sign up
    my-bracket/               Bracket entry, MVP pick, tiebreaker
    leaderboard/              Standings + everyone's brackets (post-lock)
    series/                   The 11 series and their games
    profile/                  Display name, email
    admin/                    Commissioner tools (collapsible sections)
    api/
      sync/games/             ESPN sync — cron, admin button, stale-read
      admin/field/            Pull or set the playoff field and rosters
  lib/
    supabase/                 Browser / server / service-role clients
    domain/                   Bracket tree, scoring math, ESPN mapping, sync status
supabase/
  migrations/                 Numbered SQL — tables, views, RLS policies
  seed.sql                    30 MLB teams, the 11 series slots, default scoring config
```

## Environment variables

| Variable | Required for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Everything |
| `CRON_SECRET` | Authorizing Vercel Cron's call to `/api/sync/games` |

## Design

A committed dark theme, no light variant: a night game at the ballpark. Deep
navy-black background, slate surfaces, chalk-white text, and stitch red as the
single accent. Wrong and eliminated picks grey out rather than turning red, so
red always means "this is the thing to look at."

```
--color-bg: #0a0f16      --color-ink: #f2efe8
--color-surface: #141b24  --color-ink-muted: #93a1b0
--color-surface-2: #1d2630  --color-accent: #c8322f
--color-border: #34404d   --color-accent-hover: #e04340
--color-good: #3f9e5a     --color-dead: #6b7785
```

Monospace for numbers and scores, a condensed display face for headings.

## Build order

1. ~~Supabase project, schema migration, seed the 30 teams and the 11 series slots.~~ Done.
2. ~~Auth — sign up, sign in, profile trigger, middleware.~~ Done.
3. Admin — playoff field (pull + manual), scoring config, lock time.
4. Bracket entry — the tree form, game counts, MVP, tiebreaker, and the lock.
5. Sync — ESPN fetch, bracket advancement, game attachment.
6. Scoring — `series_results`, `bracket_pick_scores`, `overall_leaderboard`, and
   the leaderboard page.
7. Series page and the post-lock bracket views.
8. Deploy to Vercel, set env vars, register the cron.

Steps 1–4 have to be done before Tuesday, September 29. Steps 5–7 only need to
be working before the first Wild Card game finishes, and can land after entries
lock.

## Running the schema tests

The scoring rules and the pre-lock privacy rules live in SQL — views and RLS
policies — where they are easy to get subtly wrong and impossible to verify by
reading. `supabase/tests/` applies the migrations and seed to a throwaway local
Postgres, plays a wild card and a division series through it, and asserts on the
results:

```bash
./supabase/tests/run.sh
```

It needs a local Postgres 15+ on `PATH` and never touches the real Supabase
project. Add a case to `supabase/tests/checks.sql` whenever a scoring rule or a
policy changes.

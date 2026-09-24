-- Two changes, both about not letting a bracket look finished when it
-- isn't.
--
--   1. An opening time as well as a deadline. The playoff field goes in on
--      the last Sunday of the regular season, and it gets corrected — a
--      seed typed in the wrong row, a tiebreaker game that moves a team.
--      Picks saved against a provisional field are picks against the wrong
--      matchups, so entry now has a window: `picks_open_at` on the way in,
--      `picks_lock_at` on the way out. Before the opening time the bracket
--      page is readable, and every write is refused.
--
--   2. The predicted game count is optional at rest. It used to default to
--      the shortest a series could run, which meant picking a team also
--      silently picked "in 3" — a guess the player never made, scored as
--      if they had. Now a pick can carry a null game count, the entry form
--      leaves it unset until it is chosen, and the length bonus pays only
--      on a number somebody actually picked.
--
-- Safe to run more than once. Every statement here either replaces what it
-- creates or drops it first, because this one takes an AccessExclusiveLock
-- on `bracket_picks` while the deployed app is reading it, and a run that
-- loses a deadlock rolls back and has to be repeated.

-- Fail fast instead of queueing behind a page load. A lock this migration
-- can't get in ten seconds means traffic is in the way; wait a moment and
-- run it again.
set lock_timeout = '10s';

-- ============================================================
-- 1. the entry window
-- ============================================================
insert into app_settings (key, value) values ('picks_open_at', null)
  on conflict (key) do nothing;

-- Null or missing means the window was never held shut — the same reading
-- picks_locked() gives an unset deadline, so a fresh install behaves as it
-- did before this migration.
create or replace function picks_open()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      select (s.value)::timestamptz <= now()
      from app_settings s
      where s.key = 'picks_open_at' and s.value is not null
    ),
    true
  );
$$;

-- What every write policy below is written against. The UI asks this too,
-- rather than comparing clocks, so a page can't offer a save the database
-- is going to refuse.
create or replace function picks_editable()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select picks_open() and not picks_locked();
$$;

drop policy if exists "players insert their own picks before the lock" on bracket_picks;
drop policy if exists "players update their own picks before the lock" on bracket_picks;
drop policy if exists "players delete their own picks before the lock" on bracket_picks;
drop policy if exists "players insert their own picks while entry is open" on bracket_picks;
drop policy if exists "players update their own picks while entry is open" on bracket_picks;
drop policy if exists "players delete their own picks while entry is open" on bracket_picks;

create policy "players insert their own picks while entry is open"
  on bracket_picks for insert to authenticated
  with check (auth.uid() = user_id and picks_editable());
create policy "players update their own picks while entry is open"
  on bracket_picks for update to authenticated
  using (auth.uid() = user_id and picks_editable())
  with check (auth.uid() = user_id and picks_editable());
create policy "players delete their own picks while entry is open"
  on bracket_picks for delete to authenticated
  using (auth.uid() = user_id and picks_editable());

drop policy if exists "players insert their own mvp pick before the lock" on mvp_picks;
drop policy if exists "players update their own mvp pick before the lock" on mvp_picks;
drop policy if exists "players insert their own mvp pick while entry is open" on mvp_picks;
drop policy if exists "players update their own mvp pick while entry is open" on mvp_picks;
drop policy if exists "players delete their own mvp pick while entry is open" on mvp_picks;

create policy "players insert their own mvp pick while entry is open"
  on mvp_picks for insert to authenticated
  with check (auth.uid() = user_id and picks_editable());
create policy "players update their own mvp pick while entry is open"
  on mvp_picks for update to authenticated
  using (auth.uid() = user_id and picks_editable())
  with check (auth.uid() = user_id and picks_editable());
-- New: there was no delete policy at all, so clearing your MVP pick back
-- to "—" deleted nothing and the old pick stayed, with the form showing
-- it gone.
create policy "players delete their own mvp pick while entry is open"
  on mvp_picks for delete to authenticated
  using (auth.uid() = user_id and picks_editable());

drop policy if exists "players insert their own tiebreaker before the lock" on tiebreaker_predictions;
drop policy if exists "players update their own tiebreaker before the lock" on tiebreaker_predictions;
drop policy if exists "players insert their own tiebreaker while entry is open" on tiebreaker_predictions;
drop policy if exists "players update their own tiebreaker while entry is open" on tiebreaker_predictions;
drop policy if exists "players delete their own tiebreaker while entry is open" on tiebreaker_predictions;

create policy "players insert their own tiebreaker while entry is open"
  on tiebreaker_predictions for insert to authenticated
  with check (auth.uid() = user_id and picks_editable());
create policy "players update their own tiebreaker while entry is open"
  on tiebreaker_predictions for update to authenticated
  using (auth.uid() = user_id and picks_editable())
  with check (auth.uid() = user_id and picks_editable());
create policy "players delete their own tiebreaker while entry is open"
  on tiebreaker_predictions for delete to authenticated
  using (auth.uid() = user_id and picks_editable());

-- ============================================================
-- 2. game counts are answered, not defaulted
-- ============================================================
alter table bracket_picks alter column predicted_games drop not null;

create or replace function validate_bracket_pick()
returns trigger
language plpgsql
as $$
declare
  s series%rowtype;
begin
  select * into s from series where key = new.series_key;

  if new.predicted_games is not null
     and (new.predicted_games < wins_needed(s.best_of) or new.predicted_games > s.best_of) then
    raise exception 'A best-of-% series runs % to % games, not %',
      s.best_of, wins_needed(s.best_of), s.best_of, new.predicted_games;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- Replaced rather than dropped: overall_leaderboard depends on this view.
-- Only the two game-count comparisons change — a null predicted_games has
-- to read as "not correct", and `null = 3` is null, which would leave
-- length_correct null instead of false.
--
-- Mirrors scorePick() in src/lib/domain/scoring.ts.
create or replace view bracket_pick_scores with (security_invoker = on) as
select
  bp.user_id,
  bp.series_key,
  bp.predicted_team_id,
  bp.predicted_games,
  sr.round,
  sr.winner_team_id,
  sr.games_played,
  (sr.winner_team_id is not null) as resolved,
  case
    when sr.winner_team_id is null then null
    else bp.predicted_team_id = sr.winner_team_id
  end as correct,
  case
    when sr.winner_team_id is null then false
    else bp.predicted_team_id = sr.winner_team_id
         and coalesce(bp.predicted_games = sr.games_played, false)
  end as length_correct,
  case
    when sr.winner_team_id is null or bp.predicted_team_id <> sr.winner_team_id then 0
    else
      case sr.round
        when 'WC' then c.wc_points
        when 'DS' then c.ds_points
        when 'CS' then c.cs_points
        when 'WS' then c.ws_points
      end
      + case when coalesce(bp.predicted_games = sr.games_played, false) then c.length_bonus else 0 end
  end as points
from bracket_picks bp
join series_results sr on sr.series_key = bp.series_key
cross join scoring_config c;

-- Not run here, because it deletes answers that may have been deliberate.
-- Every pick saved before this migration carries a game count, but under
-- the old form a length nobody chose looked exactly like one somebody did,
-- so there is no way to tell them apart. If entry hasn't really started,
-- clearing them makes everyone answer the question for themselves:
--
--   update bracket_picks set predicted_games = null;

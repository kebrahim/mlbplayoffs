-- MLB Playoff Bracket — initial schema
--
-- The contest is 11 fixed bracket slots (4 Wild Card, 4 Division Series,
-- 2 League Championship, 1 World Series). Every player predicts a winner
-- and a game count for each slot before the lock, plus a World Series MVP
-- and a total-runs tiebreaker.
--
-- Two things worth knowing before reading:
--
--   * Series are scored on ADVANCEMENT, not on the matchup. A slot only
--     asks who came out of it, so a pick scores even if the opponent was
--     wrong. That is why `bracket_picks` stores a team per slot and the
--     scoring view never looks at who the loser was.
--
--   * Every scoring value is a row in `scoring_config`, not a constant.
--     The scoring views join it, so the commissioner changing a value on
--     /admin re-scores everyone on the next read.

-- ============================================================
-- profiles
-- ============================================================
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  email text not null,
  is_commissioner boolean not null default false,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up.
create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create function is_commissioner()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select p.is_commissioner from profiles p where p.id = auth.uid()), false);
$$;

-- The general "users can update their own profile" policy below would
-- otherwise let anyone promote themselves to commissioner. Silently
-- revert that column on any update made by a signed-in user; service-role
-- writes bypass this, since the trigger only fires for `authenticated`.
create function protect_privileged_profile_columns()
returns trigger
language plpgsql
as $$
begin
  if current_role = 'authenticated' then
    new.is_commissioner := old.is_commissioner;
  end if;
  return new;
end;
$$;

create trigger protect_privileged_profile_columns
  before update on profiles
  for each row execute function protect_privileged_profile_columns();

-- ============================================================
-- teams and players
-- ============================================================
create table teams (
  id serial primary key,
  name text not null,
  short_name text not null,
  code text not null unique,
  league text not null check (league in ('AL', 'NL')),
  division text not null check (division in ('East', 'Central', 'West'))
);

-- Rosters of the twelve playoff teams, synced from ESPN once the field is
-- set; this is the pool the World Series MVP pick draws from. `espn_id` is
-- null for a player the commissioner adds by hand.
create table players (
  id bigserial primary key,
  espn_id integer unique,
  team_id integer not null references teams (id) on delete cascade,
  full_name text not null,
  position text,
  created_at timestamptz not null default now()
);

create index players_team_idx on players (team_id);

-- ============================================================
-- the playoff field
-- ============================================================
-- Set once the regular season ends, either by the "Pull from ESPN" button
-- on /admin or by hand. Filling this is what makes the bracket real: the
-- series below draw their participants from it.
create table playoff_seeds (
  league text not null check (league in ('AL', 'NL')),
  seed integer not null check (seed between 1 and 6),
  team_id integer not null references teams (id),
  set_at timestamptz not null default now(),
  primary key (league, seed),
  unique (team_id)
);

-- ============================================================
-- the bracket
-- ============================================================
-- The 11 slots, seeded once in seed.sql and never changed. Each slot knows
-- where its two sides come from: either a seed in `playoff_seeds` or the
-- winner of an earlier slot. `side_a` is the higher seed where that means
-- anything (Wild Card, Division Series); for the LCS and World Series the
-- A/B distinction is nominal, since scoring only asks who won the slot.
create table series (
  key text primary key,
  round text not null check (round in ('WC', 'DS', 'CS', 'WS')),
  league text check (league in ('AL', 'NL')),
  best_of integer not null check (best_of in (3, 5, 7)),
  label text not null,
  sort_order integer not null unique,

  side_a_from_seed integer check (side_a_from_seed between 1 and 6),
  side_a_from_series text references series (key),
  side_b_from_seed integer check (side_b_from_seed between 1 and 6),
  side_b_from_series text references series (key),

  -- Filled in by the sync as the bracket advances.
  side_a_team_id integer references teams (id),
  side_b_team_id integer references teams (id),

  -- Each side comes from exactly one place.
  constraint side_a_has_one_source check (
    (side_a_from_seed is null) <> (side_a_from_series is null)
  ),
  constraint side_b_has_one_source check (
    (side_b_from_seed is null) <> (side_b_from_series is null)
  )
);

-- Wins needed to take a series: 2 of 3, 3 of 5, 4 of 7.
create function wins_needed(best_of integer)
returns integer
language sql
immutable
as $$
  select (best_of / 2) + 1;
$$;

-- ============================================================
-- games (synced from ESPN)
-- ============================================================
-- `series_key` is resolved by matching the game's two teams against the
-- slots whose participants are known — two teams meet in exactly one
-- series per postseason, so the pair is unambiguous. A game whose slot
-- isn't known yet stays null and is attached on a later sync.
create table games (
  id bigint primary key,
  series_key text references series (key),
  game_number integer,
  home_team_id integer not null references teams (id),
  away_team_id integer not null references teams (id),
  home_score integer,
  away_score integer,
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'final')),
  start_utc timestamptz not null
);

create index games_series_idx on games (series_key);
create index games_start_idx on games (start_utc);

-- ============================================================
-- settings and scoring configuration
-- ============================================================
create table app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

-- Single-row table (the `id` check pins it to one row).
create table scoring_config (
  id boolean primary key default true check (id),
  wc_points numeric(4, 1) not null default 1,
  ds_points numeric(4, 1) not null default 2,
  cs_points numeric(4, 1) not null default 3,
  ws_points numeric(4, 1) not null default 5,
  length_bonus numeric(4, 1) not null default 1,
  mvp_points numeric(4, 1) not null default 3,
  updated_at timestamptz not null default now()
);

insert into scoring_config (id) values (true);

-- Entries lock at first pitch of the first Wild Card game. Seeded with a
-- placeholder; the commissioner sets the real value on /admin once the
-- schedule is out. A null or missing value means "not locked yet".
insert into app_settings (key, value) values
  ('picks_lock_at', '2026-09-29T16:00:00Z'),
  ('last_synced_at', null);

create function picks_locked()
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
      where s.key = 'picks_lock_at' and s.value is not null
    ),
    false
  );
$$;

-- ============================================================
-- predictions
-- ============================================================
create table bracket_picks (
  user_id uuid not null references profiles (id) on delete cascade,
  series_key text not null references series (key),
  predicted_team_id integer not null references teams (id),
  predicted_games integer not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, series_key)
);

-- A series can't end in fewer than `wins_needed` games or more than
-- `best_of`. Cross-table, so it's a trigger rather than a check
-- constraint. Whether the predicted team could actually *reach* this slot
-- given the player's own earlier picks is enforced by the entry form and
-- its server action, not here.
create function validate_bracket_pick()
returns trigger
language plpgsql
as $$
declare
  s series%rowtype;
begin
  select * into s from series where key = new.series_key;

  if new.predicted_games < wins_needed(s.best_of) or new.predicted_games > s.best_of then
    raise exception 'A best-of-% series runs % to % games, not %',
      s.best_of, wins_needed(s.best_of), s.best_of, new.predicted_games;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger validate_bracket_pick
  before insert or update on bracket_picks
  for each row execute function validate_bracket_pick();

create table mvp_picks (
  user_id uuid primary key references profiles (id) on delete cascade,
  player_id bigint not null references players (id) on delete cascade,
  updated_at timestamptz not null default now()
);

create table tiebreaker_predictions (
  user_id uuid primary key references profiles (id) on delete cascade,
  total_runs_guess integer not null check (total_runs_guess > 0),
  updated_at timestamptz not null default now()
);

-- The actual World Series MVP, recorded by the commissioner. Single row.
create table world_series_mvp (
  id boolean primary key default true check (id),
  player_id bigint not null references players (id),
  set_at timestamptz not null default now()
);

-- ============================================================
-- derived views
-- ============================================================
-- Per-series state: each side's wins so far, games played, and the winner
-- once a side reaches `wins_needed`.
create view series_results with (security_invoker = on) as
with tallies as (
  select
    s.key as series_key,
    s.round,
    s.league,
    s.best_of,
    s.label,
    s.sort_order,
    s.side_a_team_id,
    s.side_b_team_id,
    count(*) filter (where g.status = 'final') as games_played,
    count(*) filter (
      where g.status = 'final' and (
        (g.home_team_id = s.side_a_team_id and g.home_score > g.away_score) or
        (g.away_team_id = s.side_a_team_id and g.away_score > g.home_score)
      )
    ) as side_a_wins,
    count(*) filter (
      where g.status = 'final' and (
        (g.home_team_id = s.side_b_team_id and g.home_score > g.away_score) or
        (g.away_team_id = s.side_b_team_id and g.away_score > g.home_score)
      )
    ) as side_b_wins
  from series s
  left join games g on g.series_key = s.key
  group by s.key
)
select
  t.*,
  wins_needed(t.best_of) as wins_needed,
  case
    when t.side_a_wins >= wins_needed(t.best_of) then t.side_a_team_id
    when t.side_b_wins >= wins_needed(t.best_of) then t.side_b_team_id
  end as winner_team_id
from tallies t;

-- Per-pick scoring. Mirrors scorePick() in src/lib/domain/scoring.ts —
-- keep the two in sync if the formula changes.
--
-- A correct winner earns that round's value; the length bonus is paid on
-- top, and only when the winner is also right.
create view bracket_pick_scores with (security_invoker = on) as
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
    else bp.predicted_team_id = sr.winner_team_id and bp.predicted_games = sr.games_played
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
      + case when bp.predicted_games = sr.games_played then c.length_bonus else 0 end
  end as points
from bracket_picks bp
join series_results sr on sr.series_key = bp.series_key
cross join scoring_config c;

-- Every run scored in every completed playoff game — what the tiebreaker
-- guesses.
create view playoff_total_runs with (security_invoker = on) as
select
  coalesce(sum(home_score), 0) + coalesce(sum(away_score), 0) as total_runs,
  count(*) as games_final
from games
where status = 'final';

create view overall_leaderboard with (security_invoker = on) as
with series_points as (
  select user_id, coalesce(sum(points), 0) as series_points
  from bracket_pick_scores
  group by user_id
),
mvp_points as (
  select
    mp.user_id,
    case when wm.player_id = mp.player_id then c.mvp_points else 0 end as mvp_points
  from mvp_picks mp
  cross join scoring_config c
  left join world_series_mvp wm on true
)
select
  p.id as user_id,
  p.display_name,
  coalesce(sp.series_points, 0) as series_points,
  coalesce(mv.mvp_points, 0) as mvp_points,
  coalesce(sp.series_points, 0) + coalesce(mv.mvp_points, 0) as total_points,
  tb.total_runs_guess,
  abs(tb.total_runs_guess - (select total_runs from playoff_total_runs)) as tiebreaker_diff
from profiles p
left join series_points sp on sp.user_id = p.id
left join mvp_points mv on mv.user_id = p.id
left join tiebreaker_predictions tb on tb.user_id = p.id
order by total_points desc, tiebreaker_diff asc nulls last;

-- ============================================================
-- row level security
-- ============================================================
alter table profiles enable row level security;
alter table teams enable row level security;
alter table players enable row level security;
alter table playoff_seeds enable row level security;
alter table series enable row level security;
alter table games enable row level security;
alter table app_settings enable row level security;
alter table scoring_config enable row level security;
alter table bracket_picks enable row level security;
alter table mvp_picks enable row level security;
alter table tiebreaker_predictions enable row level security;
alter table world_series_mvp enable row level security;

-- Reference data: readable by anyone signed in, written by the
-- commissioner or the service role (which bypasses RLS entirely).
create policy "profiles are viewable by authenticated users"
  on profiles for select to authenticated using (true);
create policy "users can update their own profile"
  on profiles for update to authenticated using (auth.uid() = id);

create policy "teams are viewable by authenticated users"
  on teams for select to authenticated using (true);
create policy "commissioner can modify teams"
  on teams for all to authenticated using (is_commissioner()) with check (is_commissioner());

create policy "players are viewable by authenticated users"
  on players for select to authenticated using (true);
create policy "commissioner can modify players"
  on players for all to authenticated using (is_commissioner()) with check (is_commissioner());

create policy "playoff seeds are viewable by authenticated users"
  on playoff_seeds for select to authenticated using (true);
create policy "commissioner can modify playoff seeds"
  on playoff_seeds for all to authenticated using (is_commissioner()) with check (is_commissioner());

create policy "series are viewable by authenticated users"
  on series for select to authenticated using (true);
create policy "commissioner can modify series"
  on series for all to authenticated using (is_commissioner()) with check (is_commissioner());

create policy "games are viewable by authenticated users"
  on games for select to authenticated using (true);
create policy "commissioner can modify games"
  on games for all to authenticated using (is_commissioner()) with check (is_commissioner());

create policy "settings are viewable by authenticated users"
  on app_settings for select to authenticated using (true);
create policy "commissioner can modify settings"
  on app_settings for all to authenticated using (is_commissioner()) with check (is_commissioner());

create policy "scoring config is viewable by authenticated users"
  on scoring_config for select to authenticated using (true);
create policy "commissioner can modify scoring config"
  on scoring_config for all to authenticated using (is_commissioner()) with check (is_commissioner());

create policy "world series mvp is viewable by authenticated users"
  on world_series_mvp for select to authenticated using (true);
create policy "commissioner can set world series mvp"
  on world_series_mvp for all to authenticated using (is_commissioner()) with check (is_commissioner());

-- Predictions: your own are yours to see and change until the lock.
-- Everyone else's become visible the moment the lock passes; the
-- commissioner can see them all along, to chase down whoever hasn't
-- entered. This is the database half of the privacy rule — the UI half
-- just reflects it.
create policy "players see their own picks, everyone's after the lock"
  on bracket_picks for select to authenticated
  using (auth.uid() = user_id or is_commissioner() or picks_locked());
create policy "players insert their own picks before the lock"
  on bracket_picks for insert to authenticated
  with check (auth.uid() = user_id and not picks_locked());
create policy "players update their own picks before the lock"
  on bracket_picks for update to authenticated
  using (auth.uid() = user_id and not picks_locked())
  with check (auth.uid() = user_id and not picks_locked());
create policy "players delete their own picks before the lock"
  on bracket_picks for delete to authenticated
  using (auth.uid() = user_id and not picks_locked());

create policy "players see their own mvp pick, everyone's after the lock"
  on mvp_picks for select to authenticated
  using (auth.uid() = user_id or is_commissioner() or picks_locked());
create policy "players insert their own mvp pick before the lock"
  on mvp_picks for insert to authenticated
  with check (auth.uid() = user_id and not picks_locked());
create policy "players update their own mvp pick before the lock"
  on mvp_picks for update to authenticated
  using (auth.uid() = user_id and not picks_locked())
  with check (auth.uid() = user_id and not picks_locked());

create policy "players see their own tiebreaker, everyone's after the lock"
  on tiebreaker_predictions for select to authenticated
  using (auth.uid() = user_id or is_commissioner() or picks_locked());
create policy "players insert their own tiebreaker before the lock"
  on tiebreaker_predictions for insert to authenticated
  with check (auth.uid() = user_id and not picks_locked());
create policy "players update their own tiebreaker before the lock"
  on tiebreaker_predictions for update to authenticated
  using (auth.uid() = user_id and not picks_locked())
  with check (auth.uid() = user_id and not picks_locked());

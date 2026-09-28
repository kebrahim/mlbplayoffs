-- The World Series MVP pick becomes a name people type, not a row in
-- `players`.
--
-- `players` was meant to be filled from ESPN once the field was set, and
-- nothing was ever written to do it — the table has always been empty. So
-- the MVP control on /my-bracket was an empty dropdown reading "Rosters
-- aren't loaded yet", and because a bracket only counts as complete once
-- an MVP is picked, no bracket could be finished at all.
--
-- Fixing it by pulling rosters would mean writing an ESPN call that can't
-- be tested from where this was built and shipping it hours before the
-- lock. A typed name needs no feed, and the contest is five people making
-- one pick each, so the commissioner reads five strings once in late
-- October.
--
-- Matching is on a normalised key rather than the raw string, because
-- "J.T. Realmuto", "JT Realmuto" and "jt  realmuto" are the same answer.
--
-- Safe to run more than once.

set lock_timeout = '10s';

-- Punctuation, spacing and case all removed: the key is what two spellings
-- of the same name have in common. Accents are left alone — `unaccent` is
-- an extension, and a commissioner reading five names can settle the one
-- case a year where it matters.
create or replace function mvp_key(name text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(coalesce(name, '')), '[^a-z0-9]+', '', 'g');
$$;

-- ============================================================
-- the picks
-- ============================================================
alter table mvp_picks add column if not exists player_name text;

-- A no-op in practice: `players` is empty, and player_id was a non-null
-- reference to it, so there can be no rows here. Left in so that if this
-- somehow runs against a database where rosters were loaded by hand, the
-- picks carry over instead of being lost — and if a row can't be carried
-- over the `set not null` below fails loudly rather than blanking it.
update mvp_picks mp
   set player_name = p.full_name
  from players p
 where p.id = mp.player_id and mp.player_name is null;

alter table mvp_picks alter column player_id drop not null;
alter table mvp_picks alter column player_name set not null;

alter table mvp_picks drop constraint if exists mvp_picks_name_not_blank;
alter table mvp_picks add constraint mvp_picks_name_not_blank
  check (mvp_key(player_name) <> '');

-- ============================================================
-- the actual winner, recorded by the commissioner
-- ============================================================
alter table world_series_mvp add column if not exists player_name text;

update world_series_mvp wm
   set player_name = p.full_name
  from players p
 where p.id = wm.player_id and wm.player_name is null;

alter table world_series_mvp alter column player_id drop not null;
alter table world_series_mvp alter column player_name set not null;

alter table world_series_mvp drop constraint if exists world_series_mvp_name_not_blank;
alter table world_series_mvp add constraint world_series_mvp_name_not_blank
  check (mvp_key(player_name) <> '');

-- ============================================================
-- scoring
-- ============================================================
-- Replaced rather than dropped; the column list is unchanged. Only the
-- mvp_points branch differs: it compares normalised names, and pays
-- nothing until the commissioner has recorded a winner.
create or replace view overall_leaderboard with (security_invoker = on) as
with series_points as (
  select user_id, coalesce(sum(points), 0) as series_points
  from bracket_pick_scores
  group by user_id
),
mvp_points as (
  select
    mp.user_id,
    case
      when wm.player_name is null then 0
      when mvp_key(mp.player_name) = mvp_key(wm.player_name) then c.mvp_points
      else 0
    end as mvp_points
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

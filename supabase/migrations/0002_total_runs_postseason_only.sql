-- The tiebreaker counts postseason runs, so it must count postseason games.
--
-- playoff_total_runs summed every final row in `games`. Nothing regular
-- season should ever land there — the sync only writes games it has
-- attached to a bracket slot — but "every final game" is the wrong rule to
-- state for a table filled from a public feed that covers both. A game
-- with no series_key is, by definition, not part of the bracket.
--
-- Replaced rather than dropped: overall_leaderboard reads this view.

create or replace view playoff_total_runs with (security_invoker = on) as
select
  coalesce(sum(home_score), 0) + coalesce(sum(away_score), 0) as total_runs,
  count(*) as games_final
from games
where status = 'final' and series_key is not null;

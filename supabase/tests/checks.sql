\set ON_ERROR_STOP on

-- ------------------------------------------------------------
-- helpers
-- ------------------------------------------------------------
create function assert_eq(actual anyelement, expected anyelement, what text)
returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL % — expected %, got %', what, expected, actual;
  end if;
  raise notice 'ok: %', what;
end;
$$;

create function team(p_code text) returns integer language sql stable as $$
  select id from teams where code = p_code;
$$;

-- ------------------------------------------------------------
-- seed data sanity
-- ------------------------------------------------------------
do $$ begin
  perform assert_eq((select count(*)::int from teams), 30, '30 teams seeded');
  perform assert_eq((select count(*)::int from teams where league = 'AL'), 15, '15 AL teams');
  perform assert_eq((select count(*)::int from series), 11, '11 series slots');
  perform assert_eq((select count(*)::int from series where round = 'WC'), 4, '4 wild card series');
  perform assert_eq((select count(*)::int from series where round = 'DS'), 4, '4 division series');
  perform assert_eq((select count(*)::int from series where best_of = 7), 3, '3 best-of-sevens');
  -- The bracket's most misremembered rule.
  perform assert_eq((select side_b_from_series from series where key = 'AL_DS_1'), 'AL_WC_45',
                    '1 seed draws the 4/5 winner');
  perform assert_eq((select side_b_from_series from series where key = 'AL_DS_2'), 'AL_WC_36',
                    '2 seed draws the 3/6 winner');
  perform assert_eq(wins_needed(3), 2, 'best-of-3 needs 2 wins');
  perform assert_eq(wins_needed(5), 3, 'best-of-5 needs 3 wins');
  perform assert_eq(wins_needed(7), 4, 'best-of-7 needs 4 wins');
end $$;

-- ------------------------------------------------------------
-- a playoff field
-- ------------------------------------------------------------
insert into playoff_seeds (league, seed, team_id) values
  ('AL', 1, team('NYY')), ('AL', 2, team('HOU')), ('AL', 3, team('CLE')),
  ('AL', 4, team('BOS')), ('AL', 5, team('SEA')), ('AL', 6, team('DET')),
  ('NL', 1, team('LAD')), ('NL', 2, team('PHI')), ('NL', 3, team('MIL')),
  ('NL', 4, team('SD')),  ('NL', 5, team('NYM')), ('NL', 6, team('ATL'));

-- Wild Card participants, as the sync would fill them from the seeds.
update series s set
  side_a_team_id = (select team_id from playoff_seeds where league = s.league and seed = s.side_a_from_seed),
  side_b_team_id = (select team_id from playoff_seeds where league = s.league and seed = s.side_b_from_seed)
where s.round = 'WC';

do $$ begin
  perform assert_eq((select side_a_team_id from series where key = 'AL_WC_36'), team('CLE'),
                    'AL 3 seed is on side A of the 3/6 series');
  perform assert_eq((select side_b_team_id from series where key = 'NL_WC_45'), team('NYM'),
                    'NL 5 seed is on side B of the 4/5 series');
end $$;

-- ------------------------------------------------------------
-- two players
-- ------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com', '{"display_name":"Alice"}'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com',   '{"display_name":"Bob"}');

do $$ begin
  perform assert_eq((select display_name from profiles where email = 'alice@example.com'), 'Alice',
                    'signup trigger created the profile');
end $$;

-- ------------------------------------------------------------
-- the game-count trigger
-- ------------------------------------------------------------
do $$
declare
  ok boolean := false;
begin
  begin
    insert into bracket_picks (user_id, series_key, predicted_team_id, predicted_games)
    values ('11111111-1111-1111-1111-111111111111', 'AL_WC_36', team('CLE'), 1);
  exception when others then
    ok := true;
  end;
  perform assert_eq(ok, true, 'a best-of-3 cannot be predicted to end in 1 game');

  ok := false;
  begin
    insert into bracket_picks (user_id, series_key, predicted_team_id, predicted_games)
    values ('11111111-1111-1111-1111-111111111111', 'AL_CS', team('NYY'), 8);
  exception when others then
    ok := true;
  end;
  perform assert_eq(ok, true, 'a best-of-7 cannot be predicted to end in 8 games');
end $$;

-- ------------------------------------------------------------
-- brackets
-- ------------------------------------------------------------
-- Alice: Cleveland over Detroit in 3, then Cleveland past Houston in 5.
-- Bob:   Detroit in 2, then Detroit past Houston in 4.
insert into bracket_picks (user_id, series_key, predicted_team_id, predicted_games) values
  ('11111111-1111-1111-1111-111111111111', 'AL_WC_36', team('CLE'), 3),
  ('11111111-1111-1111-1111-111111111111', 'AL_DS_2',  team('CLE'), 5),
  ('22222222-2222-2222-2222-222222222222', 'AL_WC_36', team('DET'), 2),
  ('22222222-2222-2222-2222-222222222222', 'AL_DS_2',  team('DET'), 4);

insert into tiebreaker_predictions (user_id, total_runs_guess) values
  ('11111111-1111-1111-1111-111111111111', 700),
  ('22222222-2222-2222-2222-222222222222', 640);

-- ------------------------------------------------------------
-- play the wild card series: Cleveland wins 2-1
-- ------------------------------------------------------------
insert into games (id, series_key, game_number, home_team_id, away_team_id, home_score, away_score, status, start_utc) values
  (1, 'AL_WC_36', 1, team('CLE'), team('DET'), 5, 2, 'final', '2026-09-29T16:00:00Z'),
  (2, 'AL_WC_36', 2, team('CLE'), team('DET'), 1, 4, 'final', '2026-09-30T16:00:00Z'),
  (3, 'AL_WC_36', 3, team('CLE'), team('DET'), 3, 0, 'final', '2026-10-01T16:00:00Z');

do $$ begin
  perform assert_eq((select winner_team_id from series_results where series_key = 'AL_WC_36'), team('CLE'),
                    'Cleveland wins the wild card series');
  perform assert_eq((select games_played::int from series_results where series_key = 'AL_WC_36'), 3,
                    'the series went 3 games');
  perform assert_eq((select side_a_wins::int from series_results where series_key = 'AL_WC_36'), 2,
                    'Cleveland has 2 wins');
  perform assert_eq((select side_b_wins::int from series_results where series_key = 'AL_WC_36'), 1,
                    'Detroit has 1 win');

  -- Alice had the winner and the length: 1 + 1.
  perform assert_eq((select points from bracket_pick_scores
                     where series_key = 'AL_WC_36' and user_id = '11111111-1111-1111-1111-111111111111'),
                    2.0::numeric, 'winner plus length bonus on a wild card series');
  perform assert_eq((select points from bracket_pick_scores
                     where series_key = 'AL_WC_36' and user_id = '22222222-2222-2222-2222-222222222222'),
                    0.0::numeric, 'wrong winner scores nothing');
end $$;

-- ------------------------------------------------------------
-- advance the bracket and play the ALDS
-- ------------------------------------------------------------
update series set
  side_a_team_id = (select team_id from playoff_seeds where league = 'AL' and seed = 2),
  side_b_team_id = (select winner_team_id from series_results where series_key = 'AL_WC_36')
where key = 'AL_DS_2';

-- Cleveland takes it 3-1, so it runs 4 games, not the 5 Alice called.
insert into games (id, series_key, game_number, home_team_id, away_team_id, home_score, away_score, status, start_utc) values
  (4, 'AL_DS_2', 1, team('HOU'), team('CLE'), 2, 3, 'final', '2026-10-03T16:00:00Z'),
  (5, 'AL_DS_2', 2, team('HOU'), team('CLE'), 6, 1, 'final', '2026-10-04T16:00:00Z'),
  (6, 'AL_DS_2', 3, team('CLE'), team('HOU'), 4, 0, 'final', '2026-10-06T16:00:00Z'),
  (7, 'AL_DS_2', 4, team('CLE'), team('HOU'), 7, 5, 'final', '2026-10-07T16:00:00Z');

do $$ begin
  perform assert_eq((select winner_team_id from series_results where series_key = 'AL_DS_2'), team('CLE'),
                    'Cleveland wins the division series');
  -- THE point of advancement scoring: Alice predicted Cleveland would beat
  -- Houston here and they did, so she scores the round; the fact that Bob
  -- had the wrong wild card winner is what costs him, not the matchup.
  perform assert_eq((select points from bracket_pick_scores
                     where series_key = 'AL_DS_2' and user_id = '11111111-1111-1111-1111-111111111111'),
                    2.0::numeric, 'right winner, wrong length: round points only');
  perform assert_eq((select correct from bracket_pick_scores
                     where series_key = 'AL_DS_2' and user_id = '11111111-1111-1111-1111-111111111111'),
                    true, 'the division series pick is marked correct');
  perform assert_eq((select length_correct from bracket_pick_scores
                     where series_key = 'AL_DS_2' and user_id = '11111111-1111-1111-1111-111111111111'),
                    false, 'the length is marked wrong');
end $$;

-- An unresolved series scores nothing and reads as unresolved.
do $$ begin
  perform assert_eq((select resolved from series_results sr
                     join bracket_pick_scores bp on bp.series_key = sr.series_key
                     where sr.series_key = 'AL_DS_2' limit 1), true, 'a decided series reads resolved');
  perform assert_eq((select count(*)::int from series_results where winner_team_id is null), 9,
                    'the other nine slots are still open');
end $$;

-- ------------------------------------------------------------
-- leaderboard and tiebreaker
-- ------------------------------------------------------------
do $$
declare
  total_runs integer := (select total_runs from playoff_total_runs);
begin
  perform assert_eq(total_runs, 43, 'total runs across every final game');
  perform assert_eq((select total_points from overall_leaderboard where display_name = 'Alice'),
                    4.0::numeric, 'Alice has 2 + 2');
  perform assert_eq((select total_points from overall_leaderboard where display_name = 'Bob'),
                    0.0::numeric, 'Bob has nothing');
  perform assert_eq((select tiebreaker_diff from overall_leaderboard where display_name = 'Alice'),
                    657::bigint, 'tiebreaker distance is measured against the running total');
  perform assert_eq((select display_name from overall_leaderboard limit 1), 'Alice',
                    'the leaderboard is ordered by points');
end $$;

-- ------------------------------------------------------------
-- scoring config is live, not baked in
-- ------------------------------------------------------------
update scoring_config set ds_points = 10;
do $$ begin
  perform assert_eq((select total_points from overall_leaderboard where display_name = 'Alice'),
                    12.0::numeric, 'changing a round value re-scores immediately');
end $$;
update scoring_config set ds_points = 2;

-- ------------------------------------------------------------
-- the lock, and pick privacy
-- ------------------------------------------------------------
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

update app_settings set value = '2099-01-01T00:00:00Z' where key = 'picks_lock_at';
do $$ begin
  perform assert_eq(picks_locked(), false, 'a future lock time means picks are open');
end $$;

-- Alice, before the lock: her own picks only.
set role authenticated;
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$ begin
  perform assert_eq((select count(*)::int from bracket_picks), 2,
                    'before the lock a player sees only their own picks');
  perform assert_eq((select count(*)::int from bracket_picks
                     where user_id = '22222222-2222-2222-2222-222222222222'), 0,
                    'and cannot see anyone else''s');
end $$;
reset role;

-- After the lock: everything is public, and nothing can be changed.
update app_settings set value = '2020-01-01T00:00:00Z' where key = 'picks_lock_at';
do $$ begin
  perform assert_eq(picks_locked(), true, 'a past lock time means picks are locked');
end $$;

set role authenticated;
set test.user_id = '11111111-1111-1111-1111-111111111111';
do $$
declare
  blocked boolean := false;
begin
  perform assert_eq((select count(*)::int from bracket_picks), 4,
                    'after the lock every bracket is visible');
  begin
    update bracket_picks set predicted_team_id = team('DET')
    where user_id = '11111111-1111-1111-1111-111111111111' and series_key = 'AL_WC_36';
    if not found then blocked := true; end if;
  exception when others then
    blocked := true;
  end;
  perform assert_eq(blocked, true, 'a pick cannot be changed after the lock');

  blocked := false;
  begin
    insert into bracket_picks (user_id, series_key, predicted_team_id, predicted_games)
    values ('11111111-1111-1111-1111-111111111111', 'NL_WC_36', team('MIL'), 3);
  exception when others then
    blocked := true;
  end;
  perform assert_eq(blocked, true, 'a pick cannot be added after the lock');
end $$;

-- A player cannot promote themselves.
do $$ begin
  update profiles set is_commissioner = true where id = '11111111-1111-1111-1111-111111111111';
  perform assert_eq((select is_commissioner from profiles
                     where id = '11111111-1111-1111-1111-111111111111'), false,
                    'a player cannot make themselves commissioner');
end $$;
reset role;

select 'ALL CHECKS PASSED' as result;

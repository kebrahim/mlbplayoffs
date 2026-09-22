-- Reference data: the 30 MLB teams and the 11 bracket slots.
--
-- Run once, after 0001_init.sql. Both tables are re-runnable — the inserts
-- are idempotent on their natural keys.

-- ============================================================
-- teams
-- ============================================================
-- `code` has to match the abbreviation ESPN's scoreboard uses, since that
-- is how synced games are mapped back to teams (see src/lib/domain/espn.ts
-- for the handful of exceptions). If a team's games are being skipped by
-- the sync, a wrong code here is the first thing to check — it's editable
-- on /admin.
insert into teams (name, short_name, code, league, division) values
  ('Baltimore Orioles',     'Orioles',      'BAL', 'AL', 'East'),
  ('Boston Red Sox',        'Red Sox',      'BOS', 'AL', 'East'),
  ('New York Yankees',      'Yankees',      'NYY', 'AL', 'East'),
  ('Tampa Bay Rays',        'Rays',         'TB',  'AL', 'East'),
  ('Toronto Blue Jays',     'Blue Jays',    'TOR', 'AL', 'East'),
  ('Chicago White Sox',     'White Sox',    'CHW', 'AL', 'Central'),
  ('Cleveland Guardians',   'Guardians',    'CLE', 'AL', 'Central'),
  ('Detroit Tigers',        'Tigers',       'DET', 'AL', 'Central'),
  ('Kansas City Royals',    'Royals',       'KC',  'AL', 'Central'),
  ('Minnesota Twins',       'Twins',        'MIN', 'AL', 'Central'),
  ('Athletics',             'Athletics',    'ATH', 'AL', 'West'),
  ('Houston Astros',        'Astros',       'HOU', 'AL', 'West'),
  ('Los Angeles Angels',    'Angels',       'LAA', 'AL', 'West'),
  ('Seattle Mariners',      'Mariners',     'SEA', 'AL', 'West'),
  ('Texas Rangers',         'Rangers',      'TEX', 'AL', 'West'),
  ('Atlanta Braves',        'Braves',       'ATL', 'NL', 'East'),
  ('Miami Marlins',         'Marlins',      'MIA', 'NL', 'East'),
  ('New York Mets',         'Mets',         'NYM', 'NL', 'East'),
  ('Philadelphia Phillies', 'Phillies',     'PHI', 'NL', 'East'),
  ('Washington Nationals',  'Nationals',    'WSH', 'NL', 'East'),
  ('Chicago Cubs',          'Cubs',         'CHC', 'NL', 'Central'),
  ('Cincinnati Reds',       'Reds',         'CIN', 'NL', 'Central'),
  ('Milwaukee Brewers',     'Brewers',      'MIL', 'NL', 'Central'),
  ('Pittsburgh Pirates',    'Pirates',      'PIT', 'NL', 'Central'),
  ('St. Louis Cardinals',   'Cardinals',    'STL', 'NL', 'Central'),
  ('Arizona Diamondbacks',  'Diamondbacks', 'ARI', 'NL', 'West'),
  ('Colorado Rockies',      'Rockies',      'COL', 'NL', 'West'),
  ('Los Angeles Dodgers',   'Dodgers',      'LAD', 'NL', 'West'),
  ('San Diego Padres',      'Padres',       'SD',  'NL', 'West'),
  ('San Francisco Giants',  'Giants',       'SF',  'NL', 'West')
on conflict (code) do nothing;

-- ============================================================
-- the 11 bracket slots
-- ============================================================
-- The shape is fixed by MLB's format and doesn't change year to year:
--
--   Seeds 1 and 2 get byes.
--   Wild Card:  3 vs 6, and 4 vs 5. Higher seed hosts every game.
--   Division:   1 plays the 4/5 winner; 2 plays the 3/6 winner. This is
--               the part people get backwards — the top seed draws the
--               wild-card pair, not the other division winner.
--   LCS:        the two Division Series winners in each league.
--   World Series: the two pennant winners.
--
-- Inserted in bracket order because later rows reference earlier ones.

-- Wild Card
insert into series (key, round, league, best_of, label, sort_order,
                    side_a_from_seed, side_b_from_seed) values
  ('AL_WC_36', 'WC', 'AL', 3, 'AL Wild Card: 3 vs 6', 1, 3, 6),
  ('AL_WC_45', 'WC', 'AL', 3, 'AL Wild Card: 4 vs 5', 2, 4, 5),
  ('NL_WC_36', 'WC', 'NL', 3, 'NL Wild Card: 3 vs 6', 3, 3, 6),
  ('NL_WC_45', 'WC', 'NL', 3, 'NL Wild Card: 4 vs 5', 4, 4, 5)
on conflict (key) do nothing;

-- Division Series
insert into series (key, round, league, best_of, label, sort_order,
                    side_a_from_seed, side_b_from_series) values
  ('AL_DS_1', 'DS', 'AL', 5, 'ALDS: 1 seed vs 4/5 winner', 5, 1, 'AL_WC_45'),
  ('AL_DS_2', 'DS', 'AL', 5, 'ALDS: 2 seed vs 3/6 winner', 6, 2, 'AL_WC_36'),
  ('NL_DS_1', 'DS', 'NL', 5, 'NLDS: 1 seed vs 4/5 winner', 7, 1, 'NL_WC_45'),
  ('NL_DS_2', 'DS', 'NL', 5, 'NLDS: 2 seed vs 3/6 winner', 8, 2, 'NL_WC_36')
on conflict (key) do nothing;

-- League Championship Series and World Series
insert into series (key, round, league, best_of, label, sort_order,
                    side_a_from_series, side_b_from_series) values
  ('AL_CS', 'CS', 'AL', 7, 'ALCS', 9, 'AL_DS_1', 'AL_DS_2'),
  ('NL_CS', 'CS', 'NL', 7, 'NLCS', 10, 'NL_DS_1', 'NL_DS_2'),
  ('WS',    'WS', null, 7, 'World Series', 11, 'AL_CS', 'NL_CS')
on conflict (key) do nothing;

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Game, PlayoffSeed, Series } from "@/lib/supabase/types";
import { resolveBracket, winnerOf } from "./advance";

// One league's half of the real bracket, shaped as seed.sql inserts it.
function slot(
  key: string,
  sortOrder: number,
  round: Series["round"],
  bestOf: number,
  sides: Partial<Series>,
): Series {
  return {
    key,
    round,
    league: "AL",
    best_of: bestOf,
    label: key,
    sort_order: sortOrder,
    side_a_from_seed: null,
    side_a_from_series: null,
    side_b_from_seed: null,
    side_b_from_series: null,
    side_a_team_id: null,
    side_b_team_id: null,
    ...sides,
  };
}

const BRACKET: Series[] = [
  slot("AL_WC_36", 1, "WC", 3, { side_a_from_seed: 3, side_b_from_seed: 6 }),
  slot("AL_WC_45", 2, "WC", 3, { side_a_from_seed: 4, side_b_from_seed: 5 }),
  slot("AL_DS_1", 5, "DS", 5, { side_a_from_seed: 1, side_b_from_series: "AL_WC_45" }),
  slot("AL_DS_2", 6, "DS", 5, { side_a_from_seed: 2, side_b_from_series: "AL_WC_36" }),
  slot("AL_CS", 9, "CS", 7, { side_a_from_series: "AL_DS_1", side_b_from_series: "AL_DS_2" }),
];

// Seeds 1-6 are teams 1-6.
const SEEDS: PlayoffSeed[] = [1, 2, 3, 4, 5, 6].map((seed) => ({
  league: "AL",
  seed,
  team_id: seed,
}));

let nextGameId = 1;
function game(home: number, away: number, homeScore: number | null, awayScore: number | null, day: number): Game {
  return {
    id: nextGameId++,
    series_key: null,
    game_number: null,
    home_team_id: home,
    away_team_id: away,
    home_score: homeScore,
    away_score: awayScore,
    status: homeScore === null ? "scheduled" : "final",
    start_utc: `2026-10-${String(day).padStart(2, "0")}T16:00:00Z`,
  };
}

test("the wild card slots fill from the seeds with no games at all", () => {
  const { series } = resolveBracket(BRACKET, SEEDS, []);
  const wc36 = series.find((s) => s.key === "AL_WC_36")!;
  assert.equal(wc36.side_a_team_id, 3);
  assert.equal(wc36.side_b_team_id, 6);

  // A division series knows its bye seed but not its opponent yet.
  const ds1 = series.find((s) => s.key === "AL_DS_1")!;
  assert.equal(ds1.side_a_team_id, 1);
  assert.equal(ds1.side_b_team_id, null);
});

test("games attach to a slot by their team pair, in either home/away order", () => {
  nextGameId = 1;
  const games = [game(3, 6, 5, 2, 1), game(6, 3, 1, 0, 2)];
  const { games: resolved } = resolveBracket(BRACKET, SEEDS, games);

  assert.equal(resolved[0].series_key, "AL_WC_36");
  assert.equal(resolved[1].series_key, "AL_WC_36");
});

test("games are numbered within their series by start time", () => {
  nextGameId = 1;
  // Handed over out of order on purpose.
  const games = [game(3, 6, 1, 0, 3), game(3, 6, 5, 2, 1), game(3, 6, 2, 4, 2)];
  const { games: resolved } = resolveBracket(BRACKET, SEEDS, games);

  const byDay = resolved.sort((a, b) => a.start_utc.localeCompare(b.start_utc));
  assert.deepEqual(byDay.map((g) => g.game_number), [1, 2, 3]);
});

test("a lead is not a win", () => {
  nextGameId = 1;
  // 1-0 in a best-of-three: nobody has clinched.
  const games = [game(3, 6, 5, 2, 1)];
  const { series, games: resolved } = resolveBracket(BRACKET, SEEDS, games);
  assert.equal(winnerOf(series, resolved, "AL_WC_36"), null);
});

test("winning the series advances the team into the next slot", () => {
  nextGameId = 1;
  const games = [game(3, 6, 5, 2, 1), game(3, 6, 1, 4, 2), game(3, 6, 3, 0, 3)];
  const { series, games: resolved } = resolveBracket(BRACKET, SEEDS, games);

  assert.equal(winnerOf(series, resolved, "AL_WC_36"), 3);
  // The 2 seed draws the 3/6 winner.
  const ds2 = series.find((s) => s.key === "AL_DS_2")!;
  assert.equal(ds2.side_a_team_id, 2);
  assert.equal(ds2.side_b_team_id, 3);
});

test("a whole league resolves in one call, round after round", () => {
  nextGameId = 1;
  const games = [
    // Wild Card: 3 beats 6 in two, 5 beats 4 in two.
    game(3, 6, 5, 2, 1),
    game(3, 6, 4, 1, 2),
    game(4, 5, 1, 2, 1),
    game(4, 5, 0, 3, 2),
    // Division Series: a best-of-five needs three wins, not a 2-1 lead.
    // 5 upsets the 1 seed in four, 3 beats the 2 seed in four.
    game(1, 5, 0, 1, 4),
    game(1, 5, 5, 4, 5),
    game(5, 1, 2, 0, 6),
    game(5, 1, 3, 1, 7),
    game(2, 3, 1, 2, 4),
    game(2, 3, 3, 1, 5),
    game(3, 2, 4, 2, 6),
    game(3, 2, 6, 5, 7),
  ];

  const { series, games: resolved } = resolveBracket(BRACKET, SEEDS, games);

  assert.equal(winnerOf(series, resolved, "AL_WC_45"), 5);
  assert.equal(winnerOf(series, resolved, "AL_DS_1"), 5);
  assert.equal(winnerOf(series, resolved, "AL_DS_2"), 3);

  // Both division series winners land in the championship series.
  const cs = series.find((s) => s.key === "AL_CS")!;
  assert.equal(cs.side_a_team_id, 5);
  assert.equal(cs.side_b_team_id, 3);
  assert.equal(winnerOf(series, resolved, "AL_CS"), null);
});

test("a scheduled game counts for nothing", () => {
  nextGameId = 1;
  const games = [game(3, 6, 5, 2, 1), game(3, 6, null, null, 2), game(3, 6, null, null, 3)];
  const { series, games: resolved } = resolveBracket(BRACKET, SEEDS, games);
  assert.equal(winnerOf(series, resolved, "AL_WC_36"), null);
});

test("re-running the sync changes nothing the second time", () => {
  nextGameId = 1;
  const games = [game(3, 6, 5, 2, 1), game(3, 6, 4, 1, 2)];
  const first = resolveBracket(BRACKET, SEEDS, games);
  const second = resolveBracket(first.series, SEEDS, first.games);

  assert.equal(second.changedSeries.length, 0);
  assert.equal(second.changedGames.length, 0);
});

test("a game between two teams no slot expects is left alone", () => {
  nextGameId = 1;
  // A regular-season game that slipped into the date window.
  const games = [game(11, 12, 3, 1, 1)];
  const { games: resolved } = resolveBracket(BRACKET, SEEDS, games);
  assert.equal(resolved[0].series_key, null);
});

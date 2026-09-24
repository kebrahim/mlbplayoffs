import { test } from "node:test";
import assert from "node:assert/strict";
import type { ScoringConfig, Series } from "@/lib/supabase/types";
import { DEFAULT_SCORING, maxPossibleScore, roundPoints, scorePick, stillPossibleGameCounts } from "./scoring";

const CONFIG: ScoringConfig = { id: true, updated_at: "", ...DEFAULT_SCORING };

test("each round is worth its configured value", () => {
  assert.equal(roundPoints("WC", CONFIG), 1);
  assert.equal(roundPoints("DS", CONFIG), 2);
  assert.equal(roundPoints("CS", CONFIG), 3);
  assert.equal(roundPoints("WS", CONFIG), 5);
});

test("an undecided series scores nothing and reads unresolved", () => {
  const score = scorePick(1, 5, { round: "DS", winnerTeamId: null, gamesPlayed: 2 }, CONFIG);
  assert.deepEqual(score, { resolved: false, correct: null, lengthCorrect: false, points: 0 });
});

test("the right winner and the right length pays both", () => {
  const score = scorePick(7, 5, { round: "DS", winnerTeamId: 7, gamesPlayed: 5 }, CONFIG);
  assert.deepEqual(score, { resolved: true, correct: true, lengthCorrect: true, points: 3 });
});

test("the right winner and the wrong length pays the round only", () => {
  const score = scorePick(7, 5, { round: "DS", winnerTeamId: 7, gamesPlayed: 4 }, CONFIG);
  assert.deepEqual(score, { resolved: true, correct: true, lengthCorrect: false, points: 2 });
});

test("no length picked means the round only, never the bonus", () => {
  // The game count is optional at rest: the form leaves it unset until
  // someone chooses. An unanswered question can't be right.
  const score = scorePick(7, null, { round: "DS", winnerTeamId: 7, gamesPlayed: 4 }, CONFIG);
  assert.deepEqual(score, { resolved: true, correct: true, lengthCorrect: false, points: 2 });
});

test("the wrong winner pays nothing, even with the length right", () => {
  const score = scorePick(8, 4, { round: "DS", winnerTeamId: 7, gamesPlayed: 4 }, CONFIG);
  assert.deepEqual(score, { resolved: true, correct: false, lengthCorrect: false, points: 0 });
});

test("scoring values are live, not baked in", () => {
  const generous: ScoringConfig = { ...CONFIG, ws_points: 10, length_bonus: 4 };
  const score = scorePick(7, 6, { round: "WS", winnerTeamId: 7, gamesPlayed: 6 }, generous);
  assert.equal(score.points, 14);
});

test("a perfect bracket is worth 37 under the defaults", () => {
  const rounds: Array<[Series["round"], number]> = [
    ["WC", 4],
    ["DS", 4],
    ["CS", 2],
    ["WS", 1],
  ];
  const allSeries = rounds.flatMap(([round, count]) =>
    Array.from({ length: count }, (_, i): Series => ({
      key: `${round}${i}`,
      round,
      league: "AL",
      best_of: round === "WC" ? 3 : round === "DS" ? 5 : 7,
      label: "",
      sort_order: i,
      side_a_from_seed: null,
      side_a_from_series: null,
      side_b_from_seed: null,
      side_b_from_series: null,
      side_a_team_id: null,
      side_b_team_id: null,
    })),
  );

  // 23 for the winners, 11 length bonuses, 3 for the MVP.
  assert.equal(maxPossibleScore(allSeries, CONFIG), 37);
});

test("a length pick dies once the series outruns it", () => {
  assert.deepEqual(stillPossibleGameCounts(7, 0), [4, 5, 6, 7]);
  assert.deepEqual(stillPossibleGameCounts(7, 5), [5, 6, 7]);
  assert.deepEqual(stillPossibleGameCounts(3, 3), [3]);
});

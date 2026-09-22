import { test } from "node:test";
import assert from "node:assert/strict";
import type { League, Series } from "@/lib/supabase/types";
import {
  candidatesFor,
  isBracketComplete,
  possibleGameCounts,
  prunePicks,
  sidesFor,
  winsNeeded,
} from "./bracket";

// A miniature of one league's half of the bracket, shaped exactly like the
// rows seed.sql inserts.
function series(
  key: string,
  sortOrder: number,
  round: Series["round"],
  bestOf: number,
  sides: Partial<Pick<Series, "side_a_from_seed" | "side_a_from_series" | "side_b_from_seed" | "side_b_from_series">>,
): Series {
  return {
    key,
    round,
    league: "AL",
    best_of: bestOf,
    label: key,
    sort_order: sortOrder,
    side_a_from_seed: sides.side_a_from_seed ?? null,
    side_a_from_series: sides.side_a_from_series ?? null,
    side_b_from_seed: sides.side_b_from_seed ?? null,
    side_b_from_series: sides.side_b_from_series ?? null,
    side_a_team_id: null,
    side_b_team_id: null,
  };
}

const AL_BRACKET: Series[] = [
  series("AL_WC_36", 1, "WC", 3, { side_a_from_seed: 3, side_b_from_seed: 6 }),
  series("AL_WC_45", 2, "WC", 3, { side_a_from_seed: 4, side_b_from_seed: 5 }),
  series("AL_DS_1", 5, "DS", 5, { side_a_from_seed: 1, side_b_from_series: "AL_WC_45" }),
  series("AL_DS_2", 6, "DS", 5, { side_a_from_seed: 2, side_b_from_series: "AL_WC_36" }),
  series("AL_CS", 9, "CS", 7, { side_a_from_series: "AL_DS_1", side_b_from_series: "AL_DS_2" }),
];

// Seeds 1-6 are teams 101-106.
const seedTeam = (_league: League, seed: number) => 100 + seed;

test("series lengths follow from the format", () => {
  assert.equal(winsNeeded(3), 2);
  assert.equal(winsNeeded(5), 3);
  assert.equal(winsNeeded(7), 4);
  assert.deepEqual(possibleGameCounts(3), [2, 3]);
  assert.deepEqual(possibleGameCounts(5), [3, 4, 5]);
  assert.deepEqual(possibleGameCounts(7), [4, 5, 6, 7]);
});

test("wild card sides come straight from the seeds", () => {
  const sides = sidesFor(AL_BRACKET[0], seedTeam, () => null);
  assert.deepEqual(sides, { a: 103, b: 106 });
});

test("a division series is half known before the wild card round is picked", () => {
  const ds1 = AL_BRACKET[2];
  assert.deepEqual(sidesFor(ds1, seedTeam, () => null), { a: 101, b: null });
  assert.deepEqual(candidatesFor(ds1, seedTeam, () => null), [101]);

  // Once the player picks the 4/5 series, the other side appears.
  const winnerOf = (key: string) => (key === "AL_WC_45" ? 105 : null);
  assert.deepEqual(sidesFor(ds1, seedTeam, winnerOf), { a: 101, b: 105 });
  assert.deepEqual(candidatesFor(ds1, seedTeam, winnerOf), [101, 105]);
});

test("the 1 seed draws the 4/5 winner and the 2 seed the 3/6 winner", () => {
  // The rule everyone misremembers, so it gets its own assertion.
  const winnerOf = (key: string) =>
    key === "AL_WC_45" ? 104 : key === "AL_WC_36" ? 106 : null;
  assert.deepEqual(sidesFor(AL_BRACKET[2], seedTeam, winnerOf), { a: 101, b: 104 });
  assert.deepEqual(sidesFor(AL_BRACKET[3], seedTeam, winnerOf), { a: 102, b: 106 });
});

test("a whole bracket resolves from one player's picks", () => {
  const picks = new Map([
    ["AL_WC_36", 103],
    ["AL_WC_45", 105],
    ["AL_DS_1", 105],
    ["AL_DS_2", 103],
  ]);
  const winnerOf = (key: string) => picks.get(key) ?? null;

  // Their ALCS is between the two teams they advanced, not the top seeds.
  assert.deepEqual(sidesFor(AL_BRACKET[4], seedTeam, winnerOf), { a: 105, b: 103 });
});

test("prunePicks keeps a bracket that hangs together", () => {
  const picks = [
    { series_key: "AL_WC_36", predicted_team_id: 103 },
    { series_key: "AL_WC_45", predicted_team_id: 105 },
    { series_key: "AL_DS_1", predicted_team_id: 105 },
    { series_key: "AL_DS_2", predicted_team_id: 102 },
    { series_key: "AL_CS", predicted_team_id: 105 },
  ];
  assert.deepEqual(prunePicks(picks, AL_BRACKET, seedTeam), picks);
});

test("prunePicks drops what an earlier change orphaned", () => {
  // The player moves the 3/6 series from team 103 to team 106, but their
  // ALDS and ALCS picks still say 103 — which can no longer get there.
  const picks = [
    { series_key: "AL_WC_36", predicted_team_id: 106 },
    { series_key: "AL_WC_45", predicted_team_id: 105 },
    { series_key: "AL_DS_1", predicted_team_id: 105 },
    { series_key: "AL_DS_2", predicted_team_id: 103 },
    { series_key: "AL_CS", predicted_team_id: 103 },
  ];

  const kept = prunePicks(picks, AL_BRACKET, seedTeam);
  assert.deepEqual(
    kept.map((p) => p.series_key),
    ["AL_WC_36", "AL_WC_45", "AL_DS_1"],
  );
});

test("prunePicks drops a pick whose own slot never allowed it", () => {
  // Team 999 is not in the playoff field at all.
  const picks = [{ series_key: "AL_WC_36", predicted_team_id: 999 }];
  assert.deepEqual(prunePicks(picks, AL_BRACKET, seedTeam), []);
});

test("a bracket is complete only when every slot has a pick", () => {
  const partial = [{ series_key: "AL_WC_36", predicted_team_id: 103 }];
  assert.equal(isBracketComplete(partial, AL_BRACKET), false);

  const full = AL_BRACKET.map((s) => ({ series_key: s.key, predicted_team_id: 101 }));
  assert.equal(isBracketComplete(full, AL_BRACKET), true);
});

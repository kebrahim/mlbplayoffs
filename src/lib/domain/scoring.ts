import type { Round, ScoringConfig, Series } from "@/lib/supabase/types";
import { possibleGameCounts } from "./bracket";

// Mirrors the bracket_pick_scores SQL view in
// supabase/migrations/0001_init.sql — keep the two in sync if the formula
// changes, and add a case to supabase/tests/checks.sql when it does.
//
// The values themselves are not constants: they live in `scoring_config`
// and the commissioner edits them on /admin. What is fixed is the shape —
// a correct winner earns that round's value, and the length bonus is paid
// on top of it, never instead of it.

export const DEFAULT_SCORING: Omit<ScoringConfig, "id" | "updated_at"> = {
  wc_points: 1,
  ds_points: 2,
  cs_points: 3,
  ws_points: 5,
  length_bonus: 1,
  mvp_points: 3,
};

export interface PickScore {
  resolved: boolean;
  correct: boolean | null;
  lengthCorrect: boolean;
  points: number;
}

export function roundPoints(round: Round, config: ScoringConfig): number {
  switch (round) {
    case "WC":
      return config.wc_points;
    case "DS":
      return config.ds_points;
    case "CS":
      return config.cs_points;
    case "WS":
      return config.ws_points;
  }
}

export interface SeriesOutcome {
  round: Round;
  winnerTeamId: number | null;
  gamesPlayed: number;
}

/**
 * Scores one pick against one series.
 *
 * Scoring is on advancement: the only question a slot asks is who came out
 * of it, so the opponent never enters the calculation. A player whose
 * earlier pick was wrong can still score every round after it.
 */
export function scorePick(
  predictedTeamId: number,
  predictedGames: number,
  outcome: SeriesOutcome,
  config: ScoringConfig,
): PickScore {
  if (outcome.winnerTeamId === null) {
    return { resolved: false, correct: null, lengthCorrect: false, points: 0 };
  }

  const correct = predictedTeamId === outcome.winnerTeamId;
  if (!correct) {
    return { resolved: true, correct: false, lengthCorrect: false, points: 0 };
  }

  const lengthCorrect = predictedGames === outcome.gamesPlayed;
  const points = roundPoints(outcome.round, config) + (lengthCorrect ? config.length_bonus : 0);
  return { resolved: true, correct: true, lengthCorrect, points };
}

/**
 * The most a perfect bracket could be worth — every series winner, every
 * series length, and the MVP. Shown on the home page so the scoring has a
 * ceiling people can picture.
 */
export function maxPossibleScore(allSeries: Series[], config: ScoringConfig): number {
  const seriesTotal = allSeries.reduce(
    (sum, s) => sum + roundPoints(s.round, config) + config.length_bonus,
    0,
  );
  return seriesTotal + config.mvp_points;
}

/**
 * How many games a pick can still be right about, given where the series
 * currently stands — used to grey out picks that are already dead.
 */
export function stillPossibleGameCounts(bestOf: number, gamesPlayedSoFar: number): number[] {
  return possibleGameCounts(bestOf).filter((n) => n >= gamesPlayedSoFar);
}

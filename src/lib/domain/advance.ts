import type { Game, League, PlayoffSeed, Series } from "@/lib/supabase/types";
import { winsNeeded } from "./bracket";

// Turning a flat list of synced games into a bracket.
//
// The two jobs feed each other. A slot's participants come from the seeds
// or from the winner of an earlier slot, and a game can only be attached to
// a slot once that slot's participants are known — but the winner of a slot
// can only be known once its games are attached. So this runs both to a
// fixed point rather than in one pass.
//
// It is deliberately pure: the sync route hands it what the database has,
// applies what comes back, and holds no bracket logic of its own.

export interface ResolvedBracket {
  series: Series[];
  games: Game[];
  /** Slots whose participants changed, and games that were attached. */
  changedSeries: Series[];
  changedGames: Game[];
}

export function resolveBracket(
  allSeries: Series[],
  seeds: PlayoffSeed[],
  allGames: Game[],
): ResolvedBracket {
  const series = allSeries
    .map((s) => ({ ...s }))
    .sort((x, y) => x.sort_order - y.sort_order);
  const games = allGames.map((g) => ({ ...g }));

  const seedTeam = (league: League | null, seed: number): number | null =>
    league === null
      ? null
      : (seeds.find((s) => s.league === league && s.seed === seed)?.team_id ?? null);

  const changedSeriesKeys = new Set<string>();
  const changedGameIds = new Set<number>();

  // Four rounds of bracket, so four passes is always enough; the guard is
  // there so a cycle in the slot definitions can't hang a cron job.
  for (let pass = 0; pass < allSeries.length + 1; pass++) {
    let changed = false;

    for (const s of series) {
      const side = (fromSeed: number | null, fromSeries: string | null): number | null =>
        fromSeed !== null
          ? seedTeam(s.league, fromSeed)
          : fromSeries
            ? winnerOf(series, games, fromSeries)
            : null;

      const a = side(s.side_a_from_seed, s.side_a_from_series);
      const b = side(s.side_b_from_seed, s.side_b_from_series);

      // Only ever fill in a participant, never clear one: a team that has
      // already played games in a slot doesn't get removed because a later
      // sync arrived with a partial picture.
      if (a !== null && s.side_a_team_id !== a) {
        s.side_a_team_id = a;
        changedSeriesKeys.add(s.key);
        changed = true;
      }
      if (b !== null && s.side_b_team_id !== b) {
        s.side_b_team_id = b;
        changedSeriesKeys.add(s.key);
        changed = true;
      }
    }

    for (const game of games) {
      if (game.series_key !== null) continue;

      // Two teams meet in exactly one series per postseason — you only play
      // a team again after beating them, which can't happen — so the
      // unordered pair identifies the slot on its own, with no dependence
      // on ESPN's own series metadata.
      const slot = series.find(
        (s) =>
          s.side_a_team_id !== null &&
          s.side_b_team_id !== null &&
          ((s.side_a_team_id === game.home_team_id && s.side_b_team_id === game.away_team_id) ||
            (s.side_a_team_id === game.away_team_id && s.side_b_team_id === game.home_team_id)),
      );

      if (slot) {
        game.series_key = slot.key;
        changedGameIds.add(game.id);
        changed = true;
      }
    }

    if (!changed) break;
  }

  // Number the games within each slot by start time, so "in 5" means the
  // fifth game of that series.
  for (const s of series) {
    const inSeries = games
      .filter((g) => g.series_key === s.key)
      .sort((x, y) => Date.parse(x.start_utc) - Date.parse(y.start_utc));

    inSeries.forEach((game, index) => {
      if (game.game_number !== index + 1) {
        game.game_number = index + 1;
        changedGameIds.add(game.id);
      }
    });
  }

  return {
    series,
    games,
    changedSeries: series.filter((s) => changedSeriesKeys.has(s.key)),
    changedGames: games.filter((g) => changedGameIds.has(g.id)),
  };
}

/**
 * Who won a slot, from the games attached to it. Null until a side has
 * actually clinched — a 2-1 lead in a best-of-seven is not a winner.
 *
 * Mirrors the series_results SQL view.
 */
export function winnerOf(allSeries: Series[], games: Game[], seriesKey: string): number | null {
  const series = allSeries.find((s) => s.key === seriesKey);
  if (!series || series.side_a_team_id === null || series.side_b_team_id === null) return null;

  let aWins = 0;
  let bWins = 0;
  for (const game of games) {
    if (game.series_key !== seriesKey) continue;
    if (game.status !== "final") continue;
    if (game.home_score === null || game.away_score === null) continue;

    const winner =
      game.home_score > game.away_score
        ? game.home_team_id
        : game.away_score > game.home_score
          ? game.away_team_id
          : null;

    if (winner === series.side_a_team_id) aWins++;
    else if (winner === series.side_b_team_id) bWins++;
  }

  const needed = winsNeeded(series.best_of);
  if (aWins >= needed) return series.side_a_team_id;
  if (bWins >= needed) return series.side_b_team_id;
  return null;
}

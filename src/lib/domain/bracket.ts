import type { League, Series } from "@/lib/supabase/types";

// The bracket is a tree: a slot's two sides are either a seed in the
// playoff field or the winner of an earlier slot. When a player fills in
// their bracket, the "winner of an earlier slot" side is *their own
// prediction* for that slot, not the real result — which is what makes the
// entry form a tree walk rather than eleven independent dropdowns.
//
// The same two functions serve both readings. Pass the real results to see
// the actual bracket; pass a player's picks to see theirs.

export interface BracketSides {
  a: number | null;
  b: number | null;
}

export type SeedLookup = (league: League, seed: number) => number | null;
export type WinnerLookup = (seriesKey: string) => number | null;

/**
 * The two teams in a slot, as far as they are known. A side is null when
 * the series feeding it hasn't been decided (or predicted) yet.
 */
export function sidesFor(
  series: Series,
  seedTeam: SeedLookup,
  winnerOf: WinnerLookup,
): BracketSides {
  const resolve = (fromSeed: number | null, fromSeries: string | null): number | null => {
    if (fromSeed !== null) {
      // Only the Wild Card and Division Series draw directly from seeds,
      // and both are within one league, so `series.league` is always set
      // on the slots that reach this branch.
      return series.league ? seedTeam(series.league, fromSeed) : null;
    }
    return fromSeries ? winnerOf(fromSeries) : null;
  };

  return {
    a: resolve(series.side_a_from_seed, series.side_a_from_series),
    b: resolve(series.side_b_from_seed, series.side_b_from_series),
  };
}

/** The teams a player may pick in a slot — one or both sides, once known. */
export function candidatesFor(
  series: Series,
  seedTeam: SeedLookup,
  winnerOf: WinnerLookup,
): number[] {
  const { a, b } = sidesFor(series, seedTeam, winnerOf);
  return [a, b].filter((id): id is number => id !== null);
}

export interface PickLike {
  series_key: string;
  predicted_team_id: number;
}

/**
 * Drops picks that a player's own earlier picks have made impossible.
 *
 * Changing your mind about a Wild Card series can orphan everything
 * downstream of it — if you move the AL 3/6 series from Cleveland to
 * Detroit, a later pick of Cleveland in the ALCS is no longer reachable.
 * Rather than silently scoring a dead pick, the form clears it and asks
 * again.
 *
 * One forward pass over the slots in bracket order is enough: a slot only
 * ever depends on slots that sort before it.
 */
export function prunePicks<T extends PickLike>(
  picks: T[],
  allSeries: Series[],
  seedTeam: SeedLookup,
): T[] {
  const ordered = [...allSeries].sort((x, y) => x.sort_order - y.sort_order);
  const byKey = new Map(picks.map((p) => [p.series_key, p]));
  const kept = new Map<string, T>();

  const winnerOf: WinnerLookup = (key) => kept.get(key)?.predicted_team_id ?? null;

  for (const series of ordered) {
    const pick = byKey.get(series.key);
    if (!pick) continue;

    const allowed = candidatesFor(series, seedTeam, winnerOf);
    if (allowed.includes(pick.predicted_team_id)) {
      kept.set(series.key, pick);
    }
  }

  return ordered.map((s) => kept.get(s.key)).filter((p): p is T => p !== undefined);
}

/** A best-of-N series runs from `winsNeeded` to N games. */
export function winsNeeded(bestOf: number): number {
  return Math.floor(bestOf / 2) + 1;
}

export function possibleGameCounts(bestOf: number): number[] {
  const counts: number[] = [];
  for (let n = winsNeeded(bestOf); n <= bestOf; n++) counts.push(n);
  return counts;
}

/** True once every slot has a pick — what the entry form gates "done" on. */
export function isBracketComplete(picks: PickLike[], allSeries: Series[]): boolean {
  const picked = new Set(picks.map((p) => p.series_key));
  return allSeries.every((s) => picked.has(s.key));
}

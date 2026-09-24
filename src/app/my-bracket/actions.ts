"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/current-user";
import { getOpenAt, picksLocked, picksOpen } from "@/lib/domain/settings";
import { prunePicks } from "@/lib/domain/bracket";
import type { League, Series } from "@/lib/supabase/types";

export interface BracketSubmission {
  picks: { series_key: string; predicted_team_id: number; predicted_games: number | null }[];
  mvpPlayerId: number | null;
  totalRunsGuess: number | null;
}

/**
 * Saves a bracket, complete or not — people fill these in over a couple of
 * days and come back, so a partial save is a normal save, not an error.
 *
 * The picks are re-pruned server-side against the real playoff field
 * before anything is written. The form already prunes as you click, but it
 * is the client, so it doesn't get the last word on what's reachable.
 */
export async function saveBracket(submission: BracketSubmission): Promise<string | null> {
  const profile = await getCurrentProfile();
  if (!profile) return "Sign in first.";

  if (await picksLocked()) {
    return "Entries are closed — the first pitch has already been thrown.";
  }

  // The other end of the window. The seeds can still move before this, so
  // a bracket saved now would be a bracket against matchups that no longer
  // exist.
  if (!(await picksOpen())) {
    const openAt = await getOpenAt();
    return openAt
      ? `Entry doesn't open until ${openAt.toLocaleString("en-US", {
          timeZone: "America/New_York",
          weekday: "long",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        })}.`
      : "Entry isn't open yet.";
  }

  const supabase = await createClient();

  const [{ data: series }, { data: seeds }] = await Promise.all([
    supabase.from("series").select("*").order("sort_order"),
    supabase.from("playoff_seeds").select("*"),
  ]);
  if (!series?.length) return "The bracket isn't set up yet.";
  if (!seeds?.length) return "The playoff field hasn't been set yet.";

  const seedTeam = (league: League, seed: number) =>
    seeds.find((s) => s.league === league && s.seed === seed)?.team_id ?? null;

  const valid = prunePicks(submission.picks, series as Series[], seedTeam);

  // Replace rather than merge: a pick the player removed has to actually
  // disappear, and pruning can remove several at once.
  const { error: clearError } = await supabase
    .from("bracket_picks")
    .delete()
    .eq("user_id", profile.id);
  if (clearError) return clearError.message;

  if (valid.length > 0) {
    const { error } = await supabase
      .from("bracket_picks")
      .insert(valid.map((p) => ({ ...p, user_id: profile.id })));
    if (error) return error.message;
  }

  if (submission.mvpPlayerId !== null) {
    const { error } = await supabase
      .from("mvp_picks")
      .upsert({ user_id: profile.id, player_id: submission.mvpPlayerId });
    if (error) return error.message;
  } else {
    await supabase.from("mvp_picks").delete().eq("user_id", profile.id);
  }

  if (submission.totalRunsGuess !== null) {
    if (submission.totalRunsGuess <= 0) return "The tiebreaker has to be a positive number.";
    const { error } = await supabase
      .from("tiebreaker_predictions")
      .upsert({ user_id: profile.id, total_runs_guess: submission.totalRunsGuess });
    if (error) return error.message;
  } else {
    await supabase.from("tiebreaker_predictions").delete().eq("user_id", profile.id);
  }

  revalidatePath("/", "layout");
  return null;
}

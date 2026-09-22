"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/current-user";
import type { League } from "@/lib/supabase/types";
import { easternWallClockToUtc } from "@/lib/domain/time";

// Every action re-checks the commissioner flag server-side. RLS would
// reject the write anyway, but failing here gives a usable message instead
// of a policy violation.
async function requireCommissioner() {
  const profile = await getCurrentProfile();
  if (!profile?.is_commissioner) throw new Error("Commissioner only.");
  return profile;
}

const LEAGUES: League[] = ["AL", "NL"];
const SEEDS = [1, 2, 3, 4, 5, 6];

/**
 * Replaces the whole playoff field in one go.
 *
 * All twelve seeds are written together because a partial field is worse
 * than none: `playoff_seeds` has a unique constraint on team_id, so moving
 * one team from the 5 seed to the 4 seed would collide with itself if the
 * rows were updated one at a time.
 */
export async function setPlayoffField(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireCommissioner();
  const supabase = await createClient();

  const rows: { league: League; seed: number; team_id: number }[] = [];
  for (const league of LEAGUES) {
    for (const seed of SEEDS) {
      const raw = String(formData.get(`${league}_${seed}`) ?? "");
      if (!raw) return `Every seed needs a team — ${league} ${seed} is empty.`;
      rows.push({ league, seed, team_id: Number(raw) });
    }
  }

  const teamIds = rows.map((r) => r.team_id);
  if (new Set(teamIds).size !== teamIds.length) {
    return "A team can only appear once in the field.";
  }

  const { error: clearError } = await supabase
    .from("playoff_seeds")
    .delete()
    .in("league", LEAGUES);
  if (clearError) return clearError.message;

  const { error } = await supabase.from("playoff_seeds").insert(rows);
  if (error) return error.message;

  // The Wild Card slots draw straight from the seeds, so they can be filled
  // the moment the field is known — which is what makes the bracket
  // fillable. Later rounds wait on results.
  const { data: wildCards } = await supabase
    .from("series")
    .select("*")
    .eq("round", "WC");

  for (const series of wildCards ?? []) {
    const side = (seed: number | null) =>
      seed === null
        ? null
        : (rows.find((r) => r.league === series.league && r.seed === seed)?.team_id ?? null);

    await supabase
      .from("series")
      .update({
        side_a_team_id: side(series.side_a_from_seed),
        side_b_team_id: side(series.side_b_from_seed),
      })
      .eq("key", series.key);
  }

  revalidatePath("/", "layout");
  return null;
}

export async function setScoring(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireCommissioner();
  const supabase = await createClient();

  const fields = [
    "wc_points",
    "ds_points",
    "cs_points",
    "ws_points",
    "length_bonus",
    "mvp_points",
  ] as const;

  const values: Record<string, number> = {};
  for (const field of fields) {
    const value = Number(formData.get(field));
    if (!Number.isFinite(value) || value < 0) return `${field} must be zero or more.`;
    values[field] = value;
  }

  const { error } = await supabase
    .from("scoring_config")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return error.message;

  revalidatePath("/", "layout");
  return null;
}

export async function setLockTime(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireCommissioner();

  // datetime-local gives a wall-clock string with no zone. The deadline is
  // first pitch, which people think about in Eastern time, so interpret it
  // there rather than in whatever zone the server happens to run in.
  const local = String(formData.get("lock_at") ?? "");
  if (!local) return "Pick a date and time.";

  const at = easternWallClockToUtc(local);
  if (!at) return "That date didn't parse.";

  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .update({ value: at.toISOString() })
    .eq("key", "picks_lock_at");
  if (error) return error.message;

  revalidatePath("/", "layout");
  return null;
}

export async function setWorldSeriesMvp(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireCommissioner();

  const playerId = Number(formData.get("player_id"));
  if (!playerId) return "Pick a player.";

  const supabase = await createClient();
  const { error } = await supabase
    .from("world_series_mvp")
    .upsert({ id: true, player_id: playerId });
  if (error) return error.message;

  revalidatePath("/", "layout");
  return null;
}

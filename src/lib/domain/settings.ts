import { createClient } from "@/lib/supabase/server";
import type { ScoringConfig } from "@/lib/supabase/types";

export async function getSetting(key: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("value").eq("key", key).single();
  return data?.value ?? null;
}

async function getInstant(key: string): Promise<Date | null> {
  const value = await getSetting(key);
  if (!value) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}

export function getLockAt(): Promise<Date | null> {
  return getInstant("picks_lock_at");
}

/**
 * When entry opens. Null means it was never held shut.
 *
 * The seeds are not final until the last out of the regular season, and
 * they get corrected afterwards, so the commissioner can keep the bracket
 * readable while nothing can be saved against a field that may still move.
 */
export function getOpenAt(): Promise<Date | null> {
  return getInstant("picks_open_at");
}

/**
 * Whether entries are closed.
 *
 * Asks the database rather than comparing clocks here: picks_locked() is
 * the same function the RLS policies are written against, so the page can
 * never disagree with what a write will actually be allowed to do.
 */
export async function picksLocked(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("picks_locked");
  return data ?? false;
}

/** Whether the entry window has opened. Same reasoning as picksLocked(). */
export async function picksOpen(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("picks_open");
  return data ?? true;
}

/**
 * Whether a bracket can be written right now — open, and not yet locked.
 *
 * This is the one the pages and the save action ask. It is the same
 * function the write policies are written against, so the page can never
 * offer a save the database is going to refuse.
 */
export async function picksEditable(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("picks_editable");
  return data ?? false;
}

export async function getScoringConfig(): Promise<ScoringConfig | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("scoring_config").select("*").single();
  return data;
}

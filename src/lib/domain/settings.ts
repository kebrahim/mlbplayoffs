import { createClient } from "@/lib/supabase/server";
import type { ScoringConfig } from "@/lib/supabase/types";

export async function getSetting(key: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("value").eq("key", key).single();
  return data?.value ?? null;
}

export async function getLockAt(): Promise<Date | null> {
  const value = await getSetting("picks_lock_at");
  if (!value) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
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

export async function getScoringConfig(): Promise<ScoringConfig | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("scoring_config").select("*").single();
  return data;
}

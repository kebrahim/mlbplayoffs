import { createClient } from "@/lib/supabase/server";

const STALE_AFTER_MS = 10 * 60 * 1000;

export async function getLastSyncedAt(): Promise<Date | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "last_synced_at")
    .single();
  if (!data?.value) return null;
  const at = new Date(data.value);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * Kicks off a sync if the scores are more than ten minutes old.
 *
 * This is what actually keeps the site current. Vercel's Hobby plan allows
 * one cron run per day per job, which would leave the leaderboard a day
 * stale during a postseason where games finish late at night — so pages
 * trigger the work themselves when someone looks at them.
 *
 * Deliberately fire-and-forget and deliberately silent: it runs on a page
 * render, so it must never delay or fail one. The fresh numbers land on the
 * next load.
 */
export async function syncIfStale(): Promise<void> {
  const lastSyncedAt = await getLastSyncedAt();
  if (lastSyncedAt && Date.now() - lastSyncedAt.getTime() < STALE_AFTER_MS) return;

  const { performSync } = await import("@/app/api/sync/games/route");
  try {
    await performSync();
  } catch {
    // An ESPN hiccup isn't a reason to fail the page the visitor asked for.
  }
}

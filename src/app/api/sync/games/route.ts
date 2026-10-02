import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  easternDaysInRange,
  fetchScoreboardDay,
  fromEspnCode,
  mapStatus,
  type EspnEvent,
} from "@/lib/domain/espn";
import { easternDayStart } from "@/lib/domain/time";
import { resolveBracket } from "@/lib/domain/advance";
import type { Game } from "@/lib/supabase/types";

// Pulls postseason scores from ESPN's public (unofficial) scoreboard and
// folds them into the bracket. Three ways in:
//
//   GET  with `Authorization: Bearer $CRON_SECRET` — Vercel Cron.
//   POST from a signed-in commissioner — the /admin button.
//   Internally from syncIfStale(), when a page load finds stale data.
//
// The last one carries the load. Vercel's Hobby plan runs a cron job at
// most once a day, which is no use for a postseason where games end at
// 11pm and people look at the leaderboard at 11:05 — so the crons are a
// floor and page loads do the real work.
//
// Everything here is idempotent: games are upserted by ESPN's event id and
// every standing, series result and score is derived in SQL, so a re-run
// can't double-count.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return run();
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_commissioner")
    .eq("id", user.id)
    .single();
  if (!profile?.is_commissioner) {
    return NextResponse.json({ error: "Commissioner only" }, { status: 403 });
  }

  return run();
}

async function run() {
  try {
    return NextResponse.json(await performSync());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export type SyncResult = {
  synced: number;
  attached: number;
  advanced?: string[];
  postseasonEvents?: number;
  unattached?: number;
  unknownCodes?: string[];
  reason?: string;
};

/**
 * Runs a sync and writes down how it went, success or failure, so /admin
 * can say why the scores aren't moving. A sync that ran off a page load
 * has nobody watching it — before this, a failure there left no trace but
 * an old "scores as of".
 */
export async function performSync(): Promise<SyncResult> {
  const db = createServiceRoleClient();
  try {
    const result = await syncInto(db);
    await recordOutcome(db, { at: new Date().toISOString(), ok: true, result });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordOutcome(db, { at: new Date().toISOString(), ok: false, error: message });
    throw error;
  }
}

async function syncInto(db: ReturnType<typeof createServiceRoleClient>): Promise<SyncResult> {
  const [{ data: teams }, { data: seeds }, { data: series }, { data: existingGames }, { data: lockSetting }] =
    await Promise.all([
      db.from("teams").select("*"),
      db.from("playoff_seeds").select("*"),
      db.from("series").select("*").order("sort_order"),
      db.from("games").select("*"),
      db.from("app_settings").select("value").eq("key", "picks_lock_at").single(),
    ]);

  if (!series?.length) throw new Error("The bracket slots aren't seeded.");
  if (!seeds?.length) {
    // Nothing to sync into: without the field, no slot has participants and
    // every game would be unattachable anyway.
    await recordSyncedAt(db);
    return { synced: 0, attached: 0, reason: "The playoff field hasn't been set yet." };
  }

  const teamIdByCode = new Map((teams ?? []).map((t) => [t.code, t.id]));

  // Only games from the postseason onward. ESPN's September scoreboard is
  // mostly regular season, and two teams meeting in the Wild Card round
  // have almost certainly played each other earlier that month — those
  // games would attach to the slot and be counted as part of the series.
  const cutoff = lockSetting?.value ? easternDayStart(new Date(lockSetting.value)) : null;
  if (!cutoff) {
    await recordSyncedAt(db);
    return { synced: 0, attached: 0, reason: "No postseason start date is set." };
  }

  const events = await fetchEvents(cutoff);
  let postseasonEvents = 0;

  const unknownCodes = new Set<string>();
  const fetched: Game[] = [];

  for (const event of events) {
    const competitors = event.competitions?.[0]?.competitors ?? [];
    const home = competitors.find((c) => c.homeAway === "home");
    const away = competitors.find((c) => c.homeAway === "away");
    if (!home?.team?.abbreviation || !away?.team?.abbreviation) continue;

    if (Date.parse(event.date) < cutoff.getTime()) continue;
    postseasonEvents++;

    const homeCode = fromEspnCode(home.team.abbreviation);
    const awayCode = fromEspnCode(away.team.abbreviation);
    const homeTeamId = teamIdByCode.get(homeCode);
    const awayTeamId = teamIdByCode.get(awayCode);
    if (!homeTeamId) unknownCodes.add(home.team.abbreviation);
    if (!awayTeamId) unknownCodes.add(away.team.abbreviation);
    if (!homeTeamId || !awayTeamId) continue;

    const status = mapStatus(event.status?.type?.name);
    const score = (raw: string | undefined) =>
      status === "scheduled" || raw == null ? null : Number(raw);

    fetched.push({
      id: Number(event.id),
      series_key: null,
      game_number: null,
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      home_score: score(home.score),
      away_score: score(away.score),
      status,
      start_utc: event.date,
    });
  }

  // Merge over what's already stored so an attachment made on an earlier
  // run isn't thrown away, then let the bracket resolve itself.
  const byId = new Map<number, Game>((existingGames ?? []).map((g) => [g.id, g]));
  for (const game of fetched) {
    const existing = byId.get(game.id);
    byId.set(game.id, existing ? { ...game, series_key: existing.series_key, game_number: existing.game_number } : game);
  }

  const resolved = resolveBracket(series, seeds, [...byId.values()]);
  const fetchedIds = new Set(fetched.map((g) => g.id));

  // Only games that belong to a bracket slot are stored. Anything else in
  // the feed is not this contest's business, and letting it in would skew
  // the total-runs tiebreaker.
  const toStore = resolved.games.filter((g) => g.series_key !== null);
  if (toStore.length > 0) {
    const { error } = await db.from("games").upsert(toStore, { onConflict: "id" });
    if (error) throw new Error(error.message);
  }

  for (const slot of resolved.changedSeries) {
    const { error } = await db
      .from("series")
      .update({
        side_a_team_id: slot.side_a_team_id,
        side_b_team_id: slot.side_b_team_id,
      })
      .eq("key", slot.key);
    if (error) throw new Error(error.message);
  }

  await recordSyncedAt(db);

  return {
    synced: toStore.length,
    attached: resolved.changedGames.length,
    advanced: resolved.changedSeries.map((s) => s.key),
    // Games ESPN listed since the postseason began, and how many of those
    // matched no bracket slot. Zero of the first means the feed came back
    // without them; lots of the second means the field or a team code is
    // wrong.
    postseasonEvents,
    unattached: resolved.games.filter((g) => g.series_key === null && fetchedIds.has(g.id)).length,
    // Surfaced rather than swallowed: an abbreviation we don't recognise
    // means that team's games are being dropped, and the fix is to correct
    // its code on /admin.
    unknownCodes: [...unknownCodes],
  };
}

async function fetchEvents(cutoff: Date): Promise<EspnEvent[]> {
  // From the start of the postseason to a few days past today, so scheduled
  // games for the next round are visible as well as finished ones. One
  // request per day (see easternDaysInRange for why), a few at a time.
  const end = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const days = easternDaysInRange(cutoff, end);
  const byId = new Map<string, EspnEvent>();

  const CONCURRENCY = 6;
  for (let i = 0; i < days.length; i += CONCURRENCY) {
    const batch = await Promise.all(days.slice(i, i + CONCURRENCY).map(fetchScoreboardDay));
    for (const event of batch.flat()) byId.set(event.id, event);
  }

  return [...byId.values()];
}

async function recordSyncedAt(db: ReturnType<typeof createServiceRoleClient>) {
  await db
    .from("app_settings")
    .update({ value: new Date().toISOString() })
    .eq("key", "last_synced_at");
}

export type SyncOutcome =
  | { at: string; ok: true; result: SyncResult }
  | { at: string; ok: false; error: string };

async function recordOutcome(db: ReturnType<typeof createServiceRoleClient>, outcome: SyncOutcome) {
  // An upsert because the row doesn't exist until the first sync writes it.
  // Best effort: failing to record the outcome mustn't mask the outcome.
  await db
    .from("app_settings")
    .upsert({ key: "last_sync_result", value: JSON.stringify(outcome) }, { onConflict: "key" });
}

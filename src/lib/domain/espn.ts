import { utcToEasternWallClock } from "./time";

// ESPN's MLB endpoints use their own team abbreviations, which mostly match
// the codes in `teams` but not always.
//
// This map is a best effort: ESPN has renamed abbreviations before (Oakland
// to the Athletics, Arizona between ARI and AZ), and the sync can't be
// tested against a live feed until it's deployed. A code that doesn't map
// shows up in the sync response's `unknownCodes`, and the fix is to correct
// that team's `code` on /admin — no deploy needed.
const OUR_CODE_BY_ESPN_CODE: Record<string, string> = {
  AZ: "ARI",
  WAS: "WSH",
  CWS: "CHW",
  CHA: "CHW",
  CHN: "CHC",
  SFG: "SF",
  SDP: "SD",
  TBR: "TB",
  KCR: "KC",
  OAK: "ATH",
};

export function fromEspnCode(espnCode: string): string {
  const upper = espnCode.toUpperCase();
  return OUR_CODE_BY_ESPN_CODE[upper] ?? upper;
}

export function toEspnCode(code: string): string {
  const match = Object.entries(OUR_CODE_BY_ESPN_CODE).find(([, ours]) => ours === code);
  return (match?.[0] ?? code).toLowerCase();
}

// ESPN's endpoint is unofficial and sits behind bot protection that
// fingerprints the TLS handshake against the claimed User-Agent: a UA that
// claims to be Chrome from a server that doesn't handshake like Chrome gets
// 403'd, while a plain non-browser UA passes. So no browser impersonation,
// and a couple of variants in case one is temporarily blocked.
export const ESPN_USER_AGENTS = ["curl/8.7.1", "canofcorn-sync/1.0", ""];

export const ESPN_MLB_SCOREBOARD =
  "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard";

export interface EspnCompetitor {
  homeAway: "home" | "away";
  score?: string;
  team?: { abbreviation?: string };
}

export interface EspnEvent {
  id: string;
  date: string;
  status?: { type?: { name?: string } };
  competitions?: { competitors?: EspnCompetitor[] }[];
}

export function mapStatus(espnStatusName: string | undefined): "scheduled" | "live" | "final" {
  if (espnStatusName === "STATUS_SCHEDULED") return "scheduled";
  if (espnStatusName === "STATUS_FINAL") return "final";
  return "live";
}

/**
 * Every Eastern calendar day from `start` to `end` inclusive, as ESPN's
 * `dates=YYYYMMDD` parameter.
 *
 * One request per day, not per month. A month is what the NFL contest this
 * was modelled on asks for, and it works there because a month of NFL is
 * about seventy games. A September of MLB is nearly four hundred, with the
 * Wild Card round in its last three days — and when the first Wild Card
 * round finished, the sync had stored none of it. An unofficial endpoint
 * capping a response that size is the likeliest reason, though it couldn't
 * be confirmed from where this was written. A day is never more than
 * sixteen games, so the question doesn't arise.
 *
 * Days are counted in Eastern time because that is how ESPN dates a game:
 * a 10pm first pitch on the 29th is the 29th's game, though it is the 30th
 * in UTC.
 */
export function easternDaysInRange(start: Date, end: Date): string[] {
  const days: string[] = [];
  const ymd = (at: Date) => utcToEasternWallClock(at).slice(0, 10);
  const [sy, sm, sd] = ymd(start).split("-").map(Number);
  const last = ymd(end);

  // Calendar arithmetic on the date alone, so DST can't skip or repeat one.
  const cursor = new Date(Date.UTC(sy, sm - 1, sd));
  for (let guard = 0; guard < 400; guard++) {
    const iso = cursor.toISOString().slice(0, 10);
    days.push(iso.replace(/-/g, ""));
    if (iso >= last) break;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export async function fetchScoreboardDay(day: string): Promise<EspnEvent[]> {
  const url = `${ESPN_MLB_SCOREBOARD}?dates=${day}`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < ESPN_USER_AGENTS.length; attempt++) {
    const userAgent = ESPN_USER_AGENTS[attempt];
    if (attempt > 0) await new Promise((r) => setTimeout(r, 500 * attempt));

    const res = await fetch(url, {
      cache: "no-store",
      headers: userAgent ? { "User-Agent": userAgent } : {},
    });

    if (res.ok) {
      const data = (await res.json()) as { events?: EspnEvent[] };
      return data.events ?? [];
    }

    const body = await res.text().catch(() => "");
    lastError = new Error(
      `ESPN scoreboard ${day} failed: ${res.status} (UA: ${userAgent || "none"}) ${body.slice(0, 200)}`,
    );
    // Only a bot-detection style rejection is worth another UA.
    if (res.status !== 403 && res.status !== 429) break;
  }

  throw lastError ?? new Error(`ESPN scoreboard ${day} failed.`);
}

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
 * The months a date range touches, as ESPN's `dates=YYYYMM` parameter.
 *
 * ESPN stopped accepting `dates=YYYYMMDD-YYYYMMDD` ranges in September
 * 2026 — a single day, month or year still works — so the sync asks for
 * one month at a time. The postseason spans two.
 */
export function monthsInRange(start: Date, end: Date): string[] {
  const months: string[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (cursor <= last) {
    months.push(`${cursor.getUTCFullYear()}${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

export async function fetchScoreboardMonth(month: string): Promise<EspnEvent[]> {
  const url = `${ESPN_MLB_SCOREBOARD}?dates=${month}`;
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
      `ESPN scoreboard ${month} failed: ${res.status} (UA: ${userAgent || "none"}) ${body.slice(0, 200)}`,
    );
    // Only a bot-detection style rejection is worth another UA.
    if (res.status !== 403 && res.status !== 429) break;
  }

  throw lastError ?? new Error(`ESPN scoreboard ${month} failed.`);
}

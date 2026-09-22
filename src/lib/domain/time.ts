/**
 * Reads a `datetime-local` value like "2026-09-29T12:05" as a wall clock in
 * America/New_York and returns the instant it names.
 *
 * The entry deadline is first pitch, which everyone thinks about in Eastern
 * time, and the postseason runs into the November DST change — so this
 * probes the zone's real offset at that moment instead of assuming -4 or
 * -5.
 */
const WALL_CLOCK = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function easternWallClockToUtc(local: string): Date | null {
  // Checked against the format first: Date's parser is lenient enough to
  // turn junk into a real instant (it reads "not a date:00Z" as the year
  // 2000), which would silently set a nonsense deadline.
  if (!WALL_CLOCK.test(local)) return null;

  const naive = new Date(`${local}:00Z`);
  if (Number.isNaN(naive.getTime())) return null;

  // One correction lands on the right instant except exactly at a DST
  // boundary; a second settles those.
  let guess = new Date(naive.getTime() - easternOffsetMs(naive));
  guess = new Date(naive.getTime() - easternOffsetMs(guess));
  return guess;
}

/** How far America/New_York is from UTC at a given instant, in ms. */
function easternOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return asUtc - instant.getTime();
}

/** The inverse, for filling the admin form's input from a stored instant. */
export function utcToEasternWallClock(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour") === "24" ? "00" : get("hour")}:${get("minute")}`;
}

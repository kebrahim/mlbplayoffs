import type { SyncResult } from "@/app/api/sync/games/route";

/** One line saying what a sync did, for the /admin Scores section. */
export function describeSync(result: SyncResult): string {
  if (result.reason) return result.reason;

  const parts = [
    `Stored ${result.synced} games` +
      (result.advanced?.length ? `, advanced ${result.advanced.join(", ")}` : "") +
      ".",
  ];
  if (result.postseasonEvents !== undefined) {
    parts.push(
      `ESPN listed ${result.postseasonEvents} games since the postseason began` +
        (result.unattached ? `, ${result.unattached} of them matching no series` : "") +
        ".",
    );
  }
  if (result.unknownCodes?.length) {
    parts.push(`Unrecognised team codes: ${result.unknownCodes.join(", ")}. Fix those teams' codes below.`);
  }
  return parts.join(" ");
}

import { getLastSyncedAt } from "@/lib/domain/sync-status";

/**
 * When the scores were last pulled. Worth showing: the sync runs off page
 * loads rather than a frequent cron, so "how current is this" is a fair
 * question for anyone reading a score.
 */
export async function LastSynced() {
  const at = await getLastSyncedAt();
  if (!at) return <span className="font-mono text-xs text-dead">not synced yet</span>;

  return (
    <span className="font-mono text-xs text-ink-muted">
      scores as of{" "}
      {at.toLocaleString("en-US", {
        timeZone: "America/New_York",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      })}
    </span>
  );
}

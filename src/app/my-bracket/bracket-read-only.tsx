import type { Player, Series, Team } from "@/lib/supabase/types";

interface Pick {
  series_key: string;
  predicted_team_id: number;
  predicted_games: number | null;
}

/**
 * A bracket after the lock. Deliberately plain: once entries close this is
 * a record of what you said, and how it is doing belongs on /series and
 * the leaderboard, where the real results are.
 */
export function BracketReadOnly({
  series,
  teams,
  players,
  picks,
  mvpPlayerId,
  tiebreaker,
}: {
  series: Series[];
  teams: Team[];
  players: Player[];
  picks: Pick[];
  mvpPlayerId: number | null;
  tiebreaker: number | null;
}) {
  const teamName = (id: number) => teams.find((t) => t.id === id)?.short_name ?? "—";
  const mvp = players.find((p) => p.id === mvpPlayerId);

  return (
    <div className="space-y-6">
      <ul className="divide-y divide-border rounded border border-border bg-surface">
        {series.map((s) => {
          const pick = picks.find((p) => p.series_key === s.key);
          return (
            <li key={s.key} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="text-ink-muted">{s.label}</span>
              <span className="font-mono">
                {pick ? (
                  // A length is optional at rest, so a bracket left half
                  // finished says so rather than implying a number.
                  `${teamName(pick.predicted_team_id)}${
                    pick.predicted_games === null ? ", no length" : ` in ${pick.predicted_games}`
                  }`
                ) : (
                  <span className="text-dead">no pick</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <dl className="grid max-w-md grid-cols-2 gap-y-2 text-sm">
        <dt className="text-ink-muted">World Series MVP</dt>
        <dd className="text-right font-mono">{mvp?.full_name ?? <span className="text-dead">—</span>}</dd>
        <dt className="text-ink-muted">Total runs</dt>
        <dd className="text-right font-mono">{tiebreaker ?? <span className="text-dead">—</span>}</dd>
      </dl>
    </div>
  );
}

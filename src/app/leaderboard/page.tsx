import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/current-user";
import { picksLocked } from "@/lib/domain/settings";
import { syncIfStale } from "@/lib/domain/sync-status";
import { LastSynced } from "@/app/last-synced";
import { EveryonesPicks } from "./everyones-picks";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  await syncIfStale();

  const supabase = await createClient();
  const [
    locked,
    { data: standings },
    { data: participants },
    { data: picks },
    { data: runs },
    { data: series },
    { data: teams },
    { data: mvpPicks },
    { data: tiebreakers },
    { data: scores },
    { data: results },
    { data: mvpWinner },
  ] = await Promise.all([
    picksLocked(),
    supabase.from("overall_leaderboard").select("*"),
    supabase.from("profiles").select("id, display_name").order("display_name"),
    supabase
      .from("bracket_picks")
      .select("user_id, series_key, predicted_team_id, predicted_games"),
    supabase.from("playoff_total_runs").select("*").single(),
    supabase.from("series").select("*").order("sort_order"),
    supabase.from("teams").select("*"),
    supabase.from("mvp_picks").select("user_id, player_name"),
    supabase.from("tiebreaker_predictions").select("user_id, total_runs_guess"),
    supabase.from("bracket_pick_scores").select("*"),
    supabase.from("series_results").select("*"),
    supabase.from("world_series_mvp").select("player_name").maybeSingle(),
  ]);

  // Before the lock these three queries come back holding only this
  // player's own rows unless they are the commissioner — the policies do
  // the filtering, not this page. After it, everyone's are readable.
  const everyonesPicks = (
    <EveryonesPicks
      series={series ?? []}
      teams={teams ?? []}
      people={participants ?? []}
      picks={picks ?? []}
      mvpPicks={mvpPicks ?? []}
      tiebreakers={tiebreakers ?? []}
      scores={scores ?? []}
      results={results ?? []}
      mvpWinner={mvpWinner?.player_name ?? null}
    />
  );

  if (!locked && !profile.is_commissioner) {
    const entered = new Set((picks ?? []).map((p) => p.user_id));
    return (
      <div className="max-w-xl">
        <h1 className="font-heading text-3xl tracking-wide uppercase">Leaderboard</h1>
        <p className="mt-3 mb-8 text-sm text-ink-muted">
          Brackets stay private until the deadline, so there&apos;s nothing to rank yet — just who
          has started.
        </p>
        <ul className="divide-y divide-border rounded border border-border bg-surface">
          {(participants ?? []).map((person) => (
            <li key={person.id} className="flex justify-between px-4 py-3 text-sm">
              <span>{person.display_name}</span>
              <span className={entered.has(person.id) ? "text-good" : "text-dead"}>
                {entered.has(person.id) ? "started" : "nothing yet"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (!locked) {
    return (
      <div>
        <h1 className="font-heading text-3xl tracking-wide uppercase">Leaderboard</h1>
        <p className="mt-3 mb-8 max-w-2xl text-sm text-ink-muted">
          Nothing to rank until the deadline. Everyone&apos;s brackets are below because you&apos;re
          the commissioner — nobody else can see this until the lock.
        </p>
        {everyonesPicks}
      </div>
    );
  }

  const rows = standings ?? [];

  // Series points split by round, summed from the same per-pick view the
  // standings total comes from, so the columns always add up to it.
  const ROUNDS = [
    { round: "WC", label: "WC" },
    { round: "DS", label: "LDS" },
    { round: "CS", label: "LCS" },
    { round: "WS", label: "WS" },
  ] as const;
  const roundPoints = (userId: string, round: string) =>
    (scores ?? [])
      .filter((p) => p.user_id === userId && p.round === round)
      .reduce((sum, p) => sum + Number(p.points), 0);
  const leader = rows[0]?.total_points ?? 0;
  const tiedAtTop = rows.filter((r) => r.total_points === leader).length > 1;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1 className="font-heading text-3xl tracking-wide uppercase">Leaderboard</h1>
        <LastSynced />
      </div>

      <div className="-mx-6 mt-8 overflow-x-auto px-6">
        <table className="w-full min-w-max text-sm">
          <thead className="border-b border-border text-left text-ink-muted">
            <tr>
              <th className="py-2 font-normal">Player</th>
              {ROUNDS.map((r) => (
                <th key={r.round} className="py-2 pl-3 text-right font-normal">
                  {r.label}
                </th>
              ))}
              <th className="py-2 pl-3 text-right font-normal">MVP</th>
              <th className="py-2 pl-3 text-right font-normal">Total</th>
              <th className="py-2 pl-3 text-right font-normal whitespace-nowrap">Runs guess</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.user_id}>
                <td className="py-2.5">{row.display_name}</td>
                {ROUNDS.map((r) => (
                  <td
                    key={r.round}
                    className="py-2.5 pl-3 text-right font-mono tabular-nums text-ink-muted"
                  >
                    {roundPoints(row.user_id, r.round)}
                  </td>
                ))}
                <td className="py-2.5 pl-3 text-right font-mono tabular-nums text-ink-muted">
                  {row.mvp_points}
                </td>
                <td className="py-2.5 pl-3 text-right font-mono font-semibold tabular-nums">
                  {row.total_points}
                </td>
                <td className="py-2.5 pl-3 text-right font-mono tabular-nums text-ink-muted">
                  {row.total_runs_guess ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-sm text-ink-muted">
        {runs
          ? `${runs.total_runs} runs scored across ${runs.games_final} postseason games.`
          : null}{" "}
        {tiedAtTop
          ? "The top is tied, so the closest runs guess wins it."
          : "The runs guess only matters if the top ends up tied."}
      </p>

      <h2 className="font-heading mt-12 mb-4 text-xl tracking-wide uppercase">
        Everyone&apos;s brackets
      </h2>
      {everyonesPicks}
    </div>
  );
}

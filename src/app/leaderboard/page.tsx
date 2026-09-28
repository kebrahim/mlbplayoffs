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
    />
  );

  if (!locked && !profile.is_commissioner) {
    const entered = new Set((picks ?? []).map((p) => p.user_id));
    return (
      <div className="max-w-xl">
        <h1 className="font-heading text-3xl tracking-wide uppercase">Leaderboard</h1>
        <p className="mt-3 mb-8 text-sm text-ink-muted">
          Brackets stay private until the deadline, so there&apos;s nothing to rank yet — just
          who has started.
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
          Nothing to rank until the deadline. Everyone&apos;s brackets are below because
          you&apos;re the commissioner — nobody else can see this until the lock.
        </p>
        {everyonesPicks}
      </div>
    );
  }

  const rows = standings ?? [];
  const leader = rows[0]?.total_points ?? 0;
  const tiedAtTop = rows.filter((r) => r.total_points === leader).length > 1;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1 className="font-heading text-3xl tracking-wide uppercase">Leaderboard</h1>
        <LastSynced />
      </div>

      <table className="mt-8 w-full text-sm">
        <thead className="border-b border-border text-left text-ink-muted">
          <tr>
            <th className="py-2 font-normal">Player</th>
            <th className="py-2 text-right font-normal">Series</th>
            <th className="py-2 text-right font-normal">MVP</th>
            <th className="py-2 text-right font-normal">Total</th>
            <th className="py-2 text-right font-normal">Runs guess</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.user_id}>
              <td className="py-2.5">{row.display_name}</td>
              <td className="py-2.5 text-right font-mono tabular-nums">{row.series_points}</td>
              <td className="py-2.5 text-right font-mono tabular-nums">{row.mvp_points}</td>
              <td className="py-2.5 text-right font-mono tabular-nums">{row.total_points}</td>
              <td className="py-2.5 text-right font-mono tabular-nums text-ink-muted">
                {row.total_runs_guess ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-4 text-sm text-ink-muted">
        {runs ? `${runs.total_runs} runs scored across ${runs.games_final} postseason games.` : null}{" "}
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

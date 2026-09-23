import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/current-user";
import { syncIfStale } from "@/lib/domain/sync-status";
import { LastSynced } from "@/app/last-synced";
import type { Game, SeriesResult, Team } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const ROUND_TITLES = {
  WC: "Wild Card",
  DS: "Division Series",
  CS: "League Championship Series",
  WS: "World Series",
} as const;

export default async function SeriesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  await syncIfStale();

  const supabase = await createClient();
  const [{ data: results }, { data: games }, { data: teams }] = await Promise.all([
    supabase.from("series_results").select("*").order("sort_order"),
    supabase.from("games").select("*").order("start_utc"),
    supabase.from("teams").select("*"),
  ]);

  const allResults = (results ?? []) as SeriesResult[];
  const allGames = (games ?? []) as Game[];
  const teamById = new Map((teams ?? []).map((t: Team) => [t.id, t]));
  const name = (id: number | null) => (id === null ? "TBD" : (teamById.get(id)?.short_name ?? "TBD"));

  const rounds = ["WC", "DS", "CS", "WS"] as const;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1 className="font-heading text-3xl tracking-wide uppercase">Series</h1>
        <LastSynced />
      </div>

      <div className="mt-8 space-y-10">
        {rounds.map((round) => {
          const inRound = allResults.filter((r) => r.round === round);
          if (inRound.length === 0) return null;

          return (
            <section key={round}>
              <h2 className="font-heading mb-4 text-xl tracking-wide uppercase">
                {ROUND_TITLES[round]}
              </h2>
              <div className="space-y-3">
                {inRound.map((series) => {
                  const seriesGames = allGames.filter((g) => g.series_key === series.series_key);
                  const decided = series.winner_team_id !== null;

                  return (
                    <div
                      key={series.series_key}
                      className="rounded border border-border bg-surface p-4"
                    >
                      <div className="flex items-baseline justify-between gap-4">
                        <p className="text-sm text-ink-muted">{series.label}</p>
                        <p className="font-mono text-sm">
                          {series.side_a_team_id === null && series.side_b_team_id === null ? (
                            <span className="text-dead">waiting on an earlier round</span>
                          ) : (
                            <>
                              <span className={winnerClass(series, series.side_a_team_id)}>
                                {name(series.side_a_team_id)}
                              </span>{" "}
                              {series.side_a_wins}–{series.side_b_wins}{" "}
                              <span className={winnerClass(series, series.side_b_team_id)}>
                                {name(series.side_b_team_id)}
                              </span>
                            </>
                          )}
                        </p>
                      </div>

                      {decided && (
                        <p className="mt-1 text-xs text-good">
                          {name(series.winner_team_id)} in {series.games_played}
                        </p>
                      )}

                      {seriesGames.length > 0 && (
                        <ul className="mt-3 space-y-1 font-mono text-xs text-ink-muted">
                          {seriesGames.map((game) => (
                            <li key={game.id} className="flex justify-between">
                              <span>
                                Game {game.game_number ?? "?"}: {name(game.away_team_id)} at{" "}
                                {name(game.home_team_id)}
                              </span>
                              <span>
                                {game.status === "scheduled"
                                  ? new Date(game.start_utc).toLocaleString("en-US", {
                                      timeZone: "America/New_York",
                                      weekday: "short",
                                      hour: "numeric",
                                      minute: "2-digit",
                                    })
                                  : `${game.away_score}–${game.home_score}${game.status === "live" ? " (live)" : ""}`}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function winnerClass(series: SeriesResult, teamId: number | null): string {
  if (series.winner_team_id === null || teamId === null) return "";
  return series.winner_team_id === teamId ? "text-ink" : "text-dead";
}

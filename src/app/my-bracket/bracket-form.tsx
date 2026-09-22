"use client";

import { useMemo, useState, useTransition } from "react";
import type { League, Player, PlayoffSeed, Series, Team } from "@/lib/supabase/types";
import { candidatesFor, isBracketComplete, possibleGameCounts, prunePicks } from "@/lib/domain/bracket";
import { saveBracket } from "./actions";

interface Pick {
  series_key: string;
  predicted_team_id: number;
  predicted_games: number;
}

const ROUND_TITLES: Record<Series["round"], string> = {
  WC: "Wild Card",
  DS: "Division Series",
  CS: "League Championship Series",
  WS: "World Series",
};

export function BracketForm({
  series,
  teams,
  seeds,
  players,
  initialPicks,
  initialMvp,
  initialTiebreaker,
}: {
  series: Series[];
  teams: Team[];
  seeds: PlayoffSeed[];
  players: Player[];
  initialPicks: Pick[];
  initialMvp: number | null;
  initialTiebreaker: number | null;
}) {
  const [picks, setPicks] = useState<Pick[]>(initialPicks);
  const [mvp, setMvp] = useState<number | null>(initialMvp);
  const [tiebreaker, setTiebreaker] = useState<string>(
    initialTiebreaker === null ? "" : String(initialTiebreaker),
  );
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const seedTeam = useMemo(
    () => (league: League, seed: number) =>
      seeds.find((s) => s.league === league && s.seed === seed)?.team_id ?? null,
    [seeds],
  );

  const pickFor = (key: string) => picks.find((p) => p.series_key === key);
  const winnerOf = (key: string) => pickFor(key)?.predicted_team_id ?? null;

  function choose(seriesKey: string, teamId: number) {
    setSaved(false);
    setPicks((current) => {
      const existing = current.find((p) => p.series_key === seriesKey);
      const next = [
        ...current.filter((p) => p.series_key !== seriesKey),
        {
          series_key: seriesKey,
          predicted_team_id: teamId,
          // Keep the game count when only the team changed; otherwise start
          // at the shortest a series of this length can run.
          predicted_games:
            existing?.predicted_games ??
            possibleGameCounts(series.find((s) => s.key === seriesKey)!.best_of)[0],
        },
      ];
      // Changing a pick can orphan later ones — drop those rather than
      // leaving a team in a round it can no longer reach.
      return prunePicks(next, series, seedTeam);
    });
  }

  function chooseGames(seriesKey: string, games: number) {
    setSaved(false);
    setPicks((current) =>
      current.map((p) => (p.series_key === seriesKey ? { ...p, predicted_games: games } : p)),
    );
  }

  function save() {
    setError(null);
    startSaving(async () => {
      const message = await saveBracket({
        picks,
        mvpPlayerId: mvp,
        totalRunsGuess: tiebreaker === "" ? null : Number(tiebreaker),
      });
      if (message) setError(message);
      else setSaved(true);
    });
  }

  const complete =
    isBracketComplete(picks, series) && mvp !== null && tiebreaker.trim() !== "";
  const rounds: Series["round"][] = ["WC", "DS", "CS", "WS"];

  return (
    <div className="space-y-10">
      {rounds.map((round) => (
        <section key={round}>
          <h2 className="font-heading mb-4 text-xl tracking-wide uppercase">
            {ROUND_TITLES[round]}
          </h2>
          <div className="space-y-3">
            {series
              .filter((s) => s.round === round)
              .map((s) => {
                const candidates = candidatesFor(s, seedTeam, winnerOf);
                const pick = pickFor(s.key);

                return (
                  <div key={s.key} className="rounded border border-border bg-surface p-4">
                    <p className="mb-3 text-sm text-ink-muted">{s.label}</p>

                    {candidates.length < 2 ? (
                      <p className="text-sm text-dead">
                        Pick the earlier rounds first — this one depends on them.
                      </p>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        {candidates.map((teamId) => {
                          const chosen = pick?.predicted_team_id === teamId;
                          return (
                            <button
                              key={teamId}
                              type="button"
                              onClick={() => choose(s.key, teamId)}
                              className={
                                chosen
                                  ? "rounded border border-accent bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink"
                                  : "rounded border border-border px-3 py-1.5 text-sm text-ink-muted transition-colors hover:border-ink-muted hover:text-ink"
                              }
                            >
                              {teamById.get(teamId)?.short_name ?? teamId}
                            </button>
                          );
                        })}

                        {pick && (
                          <span className="ml-2 flex items-center gap-2 text-sm text-ink-muted">
                            in
                            {possibleGameCounts(s.best_of).map((n) => (
                              <button
                                key={n}
                                type="button"
                                onClick={() => chooseGames(s.key, n)}
                                className={
                                  pick.predicted_games === n
                                    ? "rounded border border-accent px-2 py-1 font-mono text-sm text-ink"
                                    : "rounded border border-border px-2 py-1 font-mono text-sm text-ink-muted transition-colors hover:text-ink"
                                }
                              >
                                {n}
                              </button>
                            ))}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </section>
      ))}

      <section>
        <h2 className="font-heading mb-4 text-xl tracking-wide uppercase">World Series MVP</h2>
        {players.length === 0 ? (
          <p className="text-sm text-dead">Rosters aren&apos;t loaded yet.</p>
        ) : (
          <select
            value={mvp ?? ""}
            onChange={(e) => {
              setSaved(false);
              setMvp(e.target.value === "" ? null : Number(e.target.value));
            }}
            className="w-full max-w-md rounded border border-border bg-surface px-3 py-2 text-sm"
          >
            <option value="">—</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name} ({teamById.get(p.team_id)?.short_name ?? ""})
              </option>
            ))}
          </select>
        )}
      </section>

      <section>
        <h2 className="font-heading mb-2 text-xl tracking-wide uppercase">Tiebreaker</h2>
        <p className="mb-3 text-sm text-ink-muted">
          Total runs scored by both teams across every game of the postseason. Only used if the
          top of the leaderboard ends up tied.
        </p>
        <input
          type="number"
          min="1"
          value={tiebreaker}
          onChange={(e) => {
            setSaved(false);
            setTiebreaker(e.target.value);
          }}
          className="w-32 rounded border border-border bg-surface px-3 py-2 text-right font-mono text-sm"
        />
      </section>

      <div className="sticky bottom-0 -mx-6 border-t border-border bg-surface px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded bg-accent px-5 py-2 font-medium text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save bracket"}
          </button>
          <span className="text-sm text-ink-muted">
            {error ? (
              <span className="text-accent">{error}</span>
            ) : saved ? (
              complete ? (
                "Saved. Your bracket is complete."
              ) : (
                "Saved. You can come back and finish it."
              )
            ) : (
              `${picks.length} of ${series.length} series picked`
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

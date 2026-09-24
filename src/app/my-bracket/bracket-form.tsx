"use client";

import { useMemo, useState, useTransition } from "react";
import type { League, Player, PlayoffSeed, Series, Team } from "@/lib/supabase/types";
import {
  bracketGaps,
  candidatesFor,
  isBracketComplete,
  possibleGameCounts,
  prunePicks,
} from "@/lib/domain/bracket";
import { saveBracket } from "./actions";

interface Pick {
  series_key: string;
  predicted_team_id: number;
  // Null until the player says how long the series goes. Picking a team
  // deliberately does not pick a length for them.
  predicted_games: number | null;
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
  canSave,
  opensAt,
}: {
  series: Series[];
  teams: Team[];
  seeds: PlayoffSeed[];
  players: Player[];
  initialPicks: Pick[];
  initialMvp: number | null;
  initialTiebreaker: number | null;
  /** False before the entry window opens: the bracket is explorable, but nothing is written. */
  canSave: boolean;
  opensAt: string | null;
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
          // Keep the length when only the team changed; a new pick starts
          // with no length, because nobody has chosen one yet.
          predicted_games: existing?.predicted_games ?? null,
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

  const gaps = bracketGaps(picks, series);
  const needsMvp = mvp === null;
  const needsTiebreaker = tiebreaker.trim() === "";
  const complete = isBracketComplete(picks, series) && !needsMvp && !needsTiebreaker;

  // Spelled out rather than counted, because "9 of 11" doesn't say which
  // nine or what is wrong with the other two.
  const todo = [
    gaps.needWinner.length > 0 &&
      `${gaps.needWinner.length} series still ${gaps.needWinner.length === 1 ? "needs" : "need"} a winner`,
    gaps.needGames.length > 0 &&
      `${gaps.needGames.length} series still ${gaps.needGames.length === 1 ? "needs" : "need"} a number of games`,
    needsMvp && "World Series MVP",
    needsTiebreaker && "Tiebreaker",
  ].filter((line): line is string => typeof line === "string");

  const rounds: Series["round"][] = ["WC", "DS", "CS", "WS"];

  return (
    <div className="space-y-10">
      {!canSave && (
        <div className="rounded border border-accent bg-surface p-4">
          <p className="font-medium">Entry isn&apos;t open yet.</p>
          <p className="mt-1 text-sm text-ink-muted">
            Look around and try out matchups. Nothing here is being saved yet, so anything you
            choose will be gone when you come back.
            {opensAt ? <> Entry opens {opensAt}.</> : null}
          </p>
        </div>
      )}

      <div
        className={
          complete
            ? "rounded border border-good bg-surface p-4"
            : "rounded border border-border bg-surface p-4"
        }
      >
        {complete ? (
          <p className="text-sm text-good">
            Your bracket is complete — every series has a winner and a length.
          </p>
        ) : (
          <>
            <p className="font-heading tracking-wide uppercase">Still to do</p>
            <ul className="mt-2 space-y-1 text-sm text-ink-muted">
              {todo.map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <span aria-hidden className="text-accent">
                    •
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {rounds.map((round) => {
        const inRound = series.filter((s) => s.round === round);
        const doneInRound = inRound.filter(
          (s) => !gaps.needWinner.includes(s.key) && !gaps.needGames.includes(s.key),
        ).length;

        return (
          <section key={round}>
            <h2 className="font-heading mb-4 flex items-baseline gap-3 text-xl tracking-wide uppercase">
              {ROUND_TITLES[round]}
              <span
                className={
                  doneInRound === inRound.length
                    ? "font-mono text-sm tracking-normal text-good normal-case"
                    : "font-mono text-sm tracking-normal text-accent normal-case"
                }
              >
                {doneInRound} of {inRound.length} done
              </span>
            </h2>
            <div className="space-y-3">
              {inRound.map((s) => {
                const candidates = candidatesFor(s, seedTeam, winnerOf);
                const pick = pickFor(s.key);
                const waiting = candidates.length < 2;
                const needsWinner = !pick && !waiting;
                const needsGames = pick !== undefined && pick.predicted_games === null;

                return (
                  <div
                    key={s.key}
                    className={
                      needsWinner || needsGames
                        ? "rounded border border-border border-l-4 border-l-accent bg-surface p-4"
                        : "rounded border border-border border-l-4 border-l-transparent bg-surface p-4"
                    }
                  >
                    <p className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
                      {s.label}
                      {needsWinner && <Flag>Pick a winner</Flag>}
                      {needsGames && <Flag>Pick a number of games</Flag>}
                    </p>

                    {waiting ? (
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
                                    ? "rounded border border-accent bg-accent px-2 py-1 font-mono text-sm text-accent-ink"
                                    : needsGames
                                      ? "rounded border border-accent px-2 py-1 font-mono text-sm text-ink transition-colors hover:bg-surface-2"
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
        );
      })}

      <section>
        <h2 className="font-heading mb-4 flex items-baseline gap-3 text-xl tracking-wide uppercase">
          World Series MVP
          {needsMvp && <Flag>Not picked</Flag>}
        </h2>
        {players.length === 0 ? (
          <p className="text-sm text-dead">Rosters aren&apos;t loaded yet.</p>
        ) : (
          <select
            value={mvp ?? ""}
            onChange={(e) => {
              setSaved(false);
              setMvp(e.target.value === "" ? null : Number(e.target.value));
            }}
            className={
              needsMvp
                ? "w-full max-w-md rounded border border-accent bg-surface px-3 py-2 text-sm"
                : "w-full max-w-md rounded border border-border bg-surface px-3 py-2 text-sm"
            }
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
        <h2 className="font-heading mb-2 flex items-baseline gap-3 text-xl tracking-wide uppercase">
          Tiebreaker
          {needsTiebreaker && <Flag>Not picked</Flag>}
        </h2>
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
          className={
            needsTiebreaker
              ? "w-32 rounded border border-accent bg-surface px-3 py-2 text-right font-mono text-sm"
              : "w-32 rounded border border-border bg-surface px-3 py-2 text-right font-mono text-sm"
          }
        />
      </section>

      <div className="sticky bottom-0 -mx-6 border-t border-border bg-surface px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={save}
            disabled={saving || !canSave}
            className="rounded bg-accent px-5 py-2 font-medium text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {!canSave ? "Saving isn't open yet" : saving ? "Saving…" : "Save bracket"}
          </button>
          <span className="text-sm text-ink-muted">
            {error ? (
              <span className="text-accent">{error}</span>
            ) : !canSave ? (
              opensAt ? (
                `Entry opens ${opensAt}.`
              ) : (
                "Entry isn't open yet."
              )
            ) : complete ? (
              <span className="text-good">{saved ? "Saved. " : ""}Complete.</span>
            ) : (
              `${saved ? "Saved. " : ""}Not complete — ${todo.join(", ").toLowerCase()}.`
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

/** The one marker used everywhere something is still unanswered. */
function Flag({ children }: { children: string }) {
  return (
    <span className="rounded border border-accent px-1.5 py-0.5 text-xs font-medium tracking-normal text-accent normal-case">
      {children}
    </span>
  );
}

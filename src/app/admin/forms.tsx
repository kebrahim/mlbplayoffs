"use client";

import { useActionState } from "react";
import type { PlayoffSeed, ScoringConfig, Team } from "@/lib/supabase/types";
import { setLockTime, setOpenTime, setPlayoffField, setScoring, setWorldSeriesMvp } from "./actions";

const SEEDS = [1, 2, 3, 4, 5, 6];

function SaveRow({ error, pending, label }: { error: string | null; pending: boolean; label: string }) {
  return (
    <div className="mt-4 flex items-center gap-4">
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? "Saving…" : label}
      </button>
      {error && <p className="text-sm text-accent">{error}</p>}
    </div>
  );
}

export function PlayoffFieldForm({
  teams,
  seeds,
}: {
  teams: Team[];
  seeds: PlayoffSeed[];
}) {
  const [result, formAction, pending] = useActionState(setPlayoffField, null);
  const current = (league: string, seed: number) =>
    seeds.find((s) => s.league === league && s.seed === seed)?.team_id ?? "";

  return (
    <form action={formAction}>
      <div className="grid gap-8 sm:grid-cols-2">
        {(["AL", "NL"] as const).map((league) => (
          <div key={league}>
            <h3 className="font-heading mb-3 tracking-wide uppercase">{league}</h3>
            <div className="space-y-2">
              {SEEDS.map((seed) => (
                <label key={seed} className="flex items-center gap-3">
                  <span className="w-16 font-mono text-sm text-ink-muted">
                    {seed} seed
                  </span>
                  <select
                    name={`${league}_${seed}`}
                    defaultValue={current(league, seed)}
                    className="flex-1 rounded border border-border bg-surface px-2 py-1.5 text-sm"
                  >
                    <option value="">—</option>
                    {teams
                      .filter((t) => t.league === league)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm text-ink-muted">
        Saving the field also sets the four Wild Card matchups, which is what makes brackets
        fillable. Seeds 1 and 2 have byes. Correcting it later re-checks every bracket already
        entered and clears any pick the new field no longer allows.
      </p>
      <SaveRow error={result?.error ?? null} pending={pending} label="Save the field" />
      {result && !result.error && (
        <p className="mt-2 text-sm text-ink-muted">
          {result.clearedPicks
            ? `Saved. ${result.clearedPicks} pick${result.clearedPicks === 1 ? "" : "s"} no longer reachable were cleared — tell whoever entered them.`
            : "Saved."}
        </p>
      )}
    </form>
  );
}

const SCORING_FIELDS: { name: keyof ScoringConfig; label: string }[] = [
  { name: "wc_points", label: "Wild Card winner" },
  { name: "ds_points", label: "Division Series winner" },
  { name: "cs_points", label: "LCS winner" },
  { name: "ws_points", label: "World Series winner" },
  { name: "length_bonus", label: "Right number of games" },
  { name: "mvp_points", label: "World Series MVP" },
];

export function ScoringForm({ config }: { config: ScoringConfig }) {
  const [error, formAction, pending] = useActionState(setScoring, null);

  return (
    <form action={formAction}>
      <div className="grid max-w-md gap-2">
        {SCORING_FIELDS.map((field) => (
          <label key={field.name} className="flex items-center justify-between gap-4">
            <span className="text-sm text-ink-muted">{field.label}</span>
            <input
              name={field.name}
              type="number"
              step="0.5"
              min="0"
              defaultValue={String(config[field.name])}
              className="w-24 rounded border border-border bg-surface px-2 py-1.5 text-right font-mono text-sm"
            />
          </label>
        ))}
      </div>
      <p className="mt-4 text-sm text-ink-muted">
        Changing a value re-scores every bracket immediately, including series that are
        already decided.
      </p>
      <SaveRow error={error} pending={pending} label="Save scoring" />
    </form>
  );
}

export function LockTimeForm({ value }: { value: string }) {
  const [error, formAction, pending] = useActionState(setLockTime, null);

  return (
    <form action={formAction}>
      <label className="flex items-center gap-3">
        <input
          name="lock_at"
          type="datetime-local"
          defaultValue={value}
          className="rounded border border-border bg-surface px-2 py-1.5 font-mono text-sm"
        />
        <span className="text-sm text-ink-muted">Eastern time</span>
      </label>
      <p className="mt-4 text-sm text-ink-muted">
        First pitch of the first Wild Card game. Brackets can&apos;t be entered or changed
        after this, and everyone&apos;s picks become visible to everyone.
      </p>
      <SaveRow error={error} pending={pending} label="Save deadline" />
    </form>
  );
}

export function OpenTimeForm({ value }: { value: string }) {
  const [error, formAction, pending] = useActionState(setOpenTime, null);

  return (
    <form action={formAction}>
      <label className="flex items-center gap-3">
        <input
          name="open_at"
          type="datetime-local"
          defaultValue={value}
          className="rounded border border-border bg-surface px-2 py-1.5 font-mono text-sm"
        />
        <span className="text-sm text-ink-muted">Eastern time</span>
      </label>
      <p className="mt-4 max-w-2xl text-sm text-ink-muted">
        Until this time the bracket page is readable and nothing can be saved — use it to keep
        people from entering against seeds that might still change. Leave it empty to open entry
        straight away.
      </p>
      <SaveRow error={error} pending={pending} label="Save opening time" />
    </form>
  );
}

export function MvpForm({
  current,
  picks,
}: {
  current: string | null;
  picks: { display_name: string; player_name: string }[];
}) {
  const [error, formAction, pending] = useActionState(setWorldSeriesMvp, null);

  return (
    <form action={formAction}>
      <label className="flex items-center gap-3">
        <input
          name="player_name"
          type="text"
          defaultValue={current ?? ""}
          placeholder="e.g. Aaron Judge"
          className="w-full max-w-md rounded border border-border bg-surface px-3 py-2 text-sm"
        />
      </label>
      <p className="mt-4 max-w-2xl text-sm text-ink-muted">
        Spelling and punctuation are ignored when matching, but the name isn&apos;t. Everyone
        who wrote this player down gets the bonus; nothing is paid until you fill this in.
      </p>

      {picks.length > 0 && (
        <>
          <p className="font-heading mt-6 mb-2 tracking-wide uppercase">What people picked</p>
          <ul className="divide-y divide-border rounded border border-border">
            {picks.map((p) => (
              <li key={p.display_name} className="flex justify-between px-3 py-2 text-sm">
                <span className="text-ink-muted">{p.display_name}</span>
                <span className="font-mono">{p.player_name}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-ink-muted">
            Five names, read once — if one is a nickname or a misspelling you can see it here
            before you record the winner.
          </p>
        </>
      )}

      <SaveRow error={error} pending={pending} label="Record the MVP" />
    </form>
  );
}

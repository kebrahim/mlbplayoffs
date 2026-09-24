import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLockAt, getOpenAt, getScoringConfig, picksLocked, picksOpen } from "@/lib/domain/settings";
import { maxPossibleScore } from "@/lib/domain/scoring";
import type { Series } from "@/lib/supabase/types";

export const revalidate = 60;

export default async function HomePage() {
  const supabase = await createClient();
  const [{ data: series }, lockAt, openAt, scoring, locked, entryOpen] = await Promise.all([
    supabase.from("series").select("*").order("sort_order"),
    getLockAt(),
    getOpenAt(),
    getScoringConfig(),
    picksLocked(),
    picksOpen(),
  ]);

  const allSeries = (series ?? []) as Series[];
  const perfect = scoring ? maxPossibleScore(allSeries, scoring) : null;

  return (
    <div className="space-y-10">
      <section>
        <h1 className="font-heading text-4xl tracking-wide uppercase">The bracket</h1>
        <p className="mt-3 max-w-2xl text-ink-muted">
          Pick the winner of all {allSeries.length || 11} playoff series and how many games each
          one takes, plus a World Series MVP and a total-runs tiebreaker. Everything is due
          before the first pitch of the Wild Card round.
        </p>

        <div className="mt-6">
          {locked ? (
            <p className="text-sm text-ink-muted">
              Entries closed. <Link href="/leaderboard" className="text-accent hover:underline">See where everyone stands →</Link>
            </p>
          ) : (
            <Link
              href="/my-bracket"
              className="inline-block rounded bg-accent px-5 py-2.5 font-medium text-accent-ink transition-colors hover:bg-accent-hover"
            >
              {entryOpen ? "Fill out your bracket" : "Look at the bracket"}
            </Link>
          )}
        </div>

        {!locked && !entryOpen && openAt && (
          <p className="mt-3 font-mono text-sm text-accent">Entry opens {shortWhen(openAt)}</p>
        )}

        {lockAt && (
          <p className="mt-3 font-mono text-sm text-ink-muted">
            {locked ? "Locked" : "Locks"} {shortWhen(lockAt)}
          </p>
        )}
      </section>

      <section>
        <h2 className="font-heading text-xl tracking-wide uppercase">Scoring</h2>
        {scoring && (
          <dl className="mt-4 grid max-w-md grid-cols-2 gap-y-2 font-mono text-sm">
            <Row label="Wild Card winner" value={scoring.wc_points} />
            <Row label="Division Series winner" value={scoring.ds_points} />
            <Row label="LCS winner" value={scoring.cs_points} />
            <Row label="World Series winner" value={scoring.ws_points} />
            <Row label="Right number of games" value={scoring.length_bonus} />
            <Row label="World Series MVP" value={scoring.mvp_points} />
          </dl>
        )}
        <ul className="mt-5 max-w-2xl list-disc space-y-1.5 pl-5 text-sm text-ink-muted">
          <li>
            Series are scored on who advances, not on the matchup — getting the opponent wrong
            costs you nothing, so one upset doesn&apos;t sink the rest of your bracket.
          </li>
          <li>The games bonus only pays if you also picked the winner.</li>
          <li>
            The tiebreaker is every run scored by both teams across the whole postseason, and
            only matters if the top of the leaderboard is tied.
          </li>
          {perfect !== null && <li>A perfect bracket is worth {perfect} points.</li>}
        </ul>
      </section>
    </div>
  );
}

function shortWhen(at: Date): string {
  return at.toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </>
  );
}

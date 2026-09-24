import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/current-user";
import { getLockAt, getOpenAt, picksEditable, picksLocked } from "@/lib/domain/settings";
import { BracketForm } from "./bracket-form";
import { BracketReadOnly } from "./bracket-read-only";

export default async function MyBracketPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const [
    { data: series },
    { data: teams },
    { data: seeds },
    { data: players },
    { data: picks },
    { data: mvp },
    { data: tiebreaker },
    locked,
    editable,
    lockAt,
    openAt,
  ] = await Promise.all([
    supabase.from("series").select("*").order("sort_order"),
    supabase.from("teams").select("*").order("name"),
    supabase.from("playoff_seeds").select("*"),
    supabase.from("players").select("*").order("full_name"),
    supabase
      .from("bracket_picks")
      .select("series_key, predicted_team_id, predicted_games")
      .eq("user_id", profile.id),
    supabase.from("mvp_picks").select("player_id").eq("user_id", profile.id).maybeSingle(),
    supabase
      .from("tiebreaker_predictions")
      .select("total_runs_guess")
      .eq("user_id", profile.id)
      .maybeSingle(),
    picksLocked(),
    picksEditable(),
    getLockAt(),
    getOpenAt(),
  ]);

  const when = (at: Date) =>
    at.toLocaleString("en-US", {
      timeZone: "America/New_York",
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });

  if ((seeds ?? []).length === 0) {
    return (
      <div className="max-w-xl">
        <h1 className="font-heading text-3xl tracking-wide uppercase">My bracket</h1>
        <p className="mt-4 text-ink-muted">
          The playoff field isn&apos;t set yet — it can&apos;t be until the regular season
          ends. Check back once the twelve teams are locked in.
        </p>
      </div>
    );
  }

  if (locked) {
    return (
      <div>
        <h1 className="font-heading text-3xl tracking-wide uppercase">My bracket</h1>
        <p className="mt-3 mb-8 text-sm text-ink-muted">
          Entries closed.{" "}
          <Link href="/leaderboard" className="text-accent hover:underline">
            Everyone&apos;s brackets are on the leaderboard →
          </Link>
        </p>
        <BracketReadOnly
          series={series ?? []}
          teams={teams ?? []}
          players={players ?? []}
          picks={picks ?? []}
          mvpPlayerId={mvp?.player_id ?? null}
          tiebreaker={tiebreaker?.total_runs_guess ?? null}
        />
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-heading text-3xl tracking-wide uppercase">My bracket</h1>
      <p className="mt-3 mb-8 max-w-2xl text-sm text-ink-muted">
        Work forward through the rounds — each one offers the teams your own earlier picks left
        alive. Every series needs both a winner and a length. Save as often as you like; nothing
        is final until the deadline
        {lockAt && <> ({when(lockAt)})</>}.
      </p>

      <BracketForm
        series={series ?? []}
        teams={teams ?? []}
        seeds={seeds ?? []}
        players={players ?? []}
        initialPicks={picks ?? []}
        initialMvp={mvp?.player_id ?? null}
        initialTiebreaker={tiebreaker?.total_runs_guess ?? null}
        canSave={editable}
        opensAt={openAt ? when(openAt) : null}
      />
    </div>
  );
}

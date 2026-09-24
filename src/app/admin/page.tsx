import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/current-user";
import { getLockAt, getOpenAt, picksOpen } from "@/lib/domain/settings";
import { utcToEasternWallClock } from "@/lib/domain/time";
import { Section } from "./section";
import { LockTimeForm, MvpForm, OpenTimeForm, PlayoffFieldForm, ScoringForm } from "./forms";
import { SyncButton } from "./sync-button";
import { LastSynced } from "@/app/last-synced";

export default async function AdminPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!profile.is_commissioner) redirect("/");

  const supabase = await createClient();
  const [
    { data: teams },
    { data: seeds },
    { data: scoring },
    { data: players },
    { data: participants },
    { data: picks },
    { data: mvp },
    lockAt,
    openAt,
    entryOpen,
  ] = await Promise.all([
    supabase.from("teams").select("*").order("name"),
    supabase.from("playoff_seeds").select("*"),
    supabase.from("scoring_config").select("*").single(),
    supabase.from("players").select("*").order("full_name"),
    supabase.from("profiles").select("*").order("display_name"),
    supabase.from("bracket_picks").select("user_id, series_key, predicted_games"),
    supabase.from("world_series_mvp").select("player_id").maybeSingle(),
    getLockAt(),
    getOpenAt(),
    picksOpen(),
  ]);

  // Counted as "done" only with a length as well as a winner, so a bracket
  // that reads 11/11 here really is finished.
  const doneByUser = new Map<string, number>();
  const missingLengthByUser = new Map<string, number>();
  for (const pick of picks ?? []) {
    if (pick.predicted_games === null) {
      missingLengthByUser.set(pick.user_id, (missingLengthByUser.get(pick.user_id) ?? 0) + 1);
    } else {
      doneByUser.set(pick.user_id, (doneByUser.get(pick.user_id) ?? 0) + 1);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="font-heading text-3xl tracking-wide uppercase">Admin</h1>

      <Section title="Participants" open>
        <ul className="divide-y divide-border">
          {(participants ?? []).map((person) => {
            const done = doneByUser.get(person.id) ?? 0;
            const missingLength = missingLengthByUser.get(person.id) ?? 0;
            return (
              <li key={person.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {person.display_name}
                  {person.is_commissioner && (
                    <span className="ml-2 text-xs text-ink-muted">commissioner</span>
                  )}
                </span>
                <span className={done === 11 ? "font-mono text-good" : "font-mono text-ink-muted"}>
                  {done} / 11 series complete
                  {missingLength > 0 && (
                    <span className="ml-2 text-accent">
                      {missingLength} without a length
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section
        title="Playoff field"
        description="The twelve teams and their seeds, once the regular season ends. Enter them here — MLB's seeding isn't something the scoreboard feed reports, so it isn't pulled automatically."
        open={(seeds ?? []).length === 0}
      >
        <PlayoffFieldForm teams={teams ?? []} seeds={seeds ?? []} />
      </Section>

      <Section title="Scoring">
        {scoring && <ScoringForm config={scoring} />}
      </Section>

      <Section
        title="Entry opens"
        description={
          entryOpen
            ? "Entry is open — brackets can be saved."
            : "Entry is held shut. People can look at the bracket, but nothing saves."
        }
        open={!entryOpen}
      >
        <OpenTimeForm value={openAt ? utcToEasternWallClock(openAt) : ""} />
      </Section>

      <Section title="Entry deadline">
        <LockTimeForm value={lockAt ? utcToEasternWallClock(lockAt) : ""} />
      </Section>

      <Section
        title="Scores"
        description="Scores sync themselves whenever anyone loads a page and the data is more than ten minutes old. This button is for when you don't want to wait."
      >
        <div className="space-y-3">
          <LastSynced />
          <SyncButton />
        </div>
      </Section>

      <Section title="World Series MVP">
        <MvpForm players={players ?? []} teams={teams ?? []} current={mvp?.player_id ?? null} />
      </Section>
    </div>
  );
}

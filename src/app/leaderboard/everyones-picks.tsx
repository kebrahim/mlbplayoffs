import type { BracketPickScore, SeriesResult, Series, Team } from "@/lib/supabase/types";
import { mvpKey } from "@/lib/domain/scoring";

interface Pick {
  user_id: string;
  series_key: string;
  predicted_team_id: number;
  predicted_games: number | null;
}

interface Person {
  id: string;
  display_name: string;
}

/**
 * Every bracket side by side: series down, people across.
 *
 * The commissioner sees this before the lock as well, which is the whole
 * point of it — chasing the two people who haven't finished is impossible
 * from a list that only says "started". Everyone else sees it once the
 * lock has passed and the brackets are public anyway.
 *
 * A matrix rather than a bracket per person because the question being
 * asked of it is "who is missing what", and that reads down a column.
 *
 * Once results come in, each cell turns green for a winner that came good
 * and red for one that didn't — including a pick that can no longer come
 * good because the team is already out, even though its series hasn't been
 * played. Whether a pick was right comes from bracket_pick_scores, the
 * same view the standings are summed from, so the colours can't disagree
 * with the points.
 */
export function EveryonesPicks({
  series,
  teams,
  people,
  picks,
  mvpPicks,
  tiebreakers,
  scores,
  results,
  mvpWinner,
  totals,
}: {
  series: Series[];
  teams: Team[];
  people: Person[];
  picks: Pick[];
  mvpPicks: { user_id: string; player_name: string }[];
  tiebreakers: { user_id: string; total_runs_guess: number }[];
  scores: BracketPickScore[];
  results: SeriesResult[];
  mvpWinner: string | null;
  /** Each person's total points, once the lock has passed; before it, the
   *  header shows how much of the bracket they've filled in instead. */
  totals?: Map<string, number>;
}) {
  const teamName = (id: number) => teams.find((t) => t.id === id)?.short_name ?? String(id);
  const pickFor = (userId: string, key: string) =>
    picks.find((p) => p.user_id === userId && p.series_key === key);
  const mvpFor = (userId: string) => mvpPicks.find((m) => m.user_id === userId)?.player_name;
  const runsFor = (userId: string) =>
    tiebreakers.find((t) => t.user_id === userId)?.total_runs_guess;

  const doneCount = (userId: string) =>
    series.filter((s) => {
      const pick = pickFor(userId, s.key);
      return pick !== undefined && pick.predicted_games !== null;
    }).length;

  const scoreFor = (userId: string, key: string) =>
    scores.find((p) => p.user_id === userId && p.series_key === key);

  // A team that lost a finished series is out, so any later pick on it is
  // already wrong, whatever its own series says.
  const eliminated = new Set<number>();
  for (const r of results) {
    if (r.winner_team_id === null) continue;
    for (const side of [r.side_a_team_id, r.side_b_team_id]) {
      if (side !== null && side !== r.winner_team_id) eliminated.add(side);
    }
  }

  type Verdict = "right" | "wrong" | "out" | null;
  const verdictFor = (userId: string, key: string, teamId: number): Verdict => {
    const score = scoreFor(userId, key);
    if (score?.resolved) return score.correct ? "right" : "wrong";
    return eliminated.has(teamId) ? "out" : null;
  };

  const cellTone: Record<Exclude<Verdict, null>, string> = {
    right: "bg-good/20 text-ink",
    wrong: "bg-accent/20 text-ink-muted line-through decoration-accent",
    out: "bg-accent/20 text-ink-muted line-through decoration-accent",
  };

  if (people.length === 0) return null;

  const missing = <span className="text-dead">—</span>;

  return (
    <div className="-mx-6 overflow-x-auto px-6">
      <table className="w-full min-w-max text-sm">
        <thead className="border-b border-border text-left text-ink-muted">
          <tr>
            <th className="py-2 pr-6 font-normal">Series</th>
            {people.map((person) => {
              const done = doneCount(person.id);
              const total = totals?.get(person.id) ?? 0;
              return (
                <th key={person.id} className="py-2 pr-2 pl-2 font-normal whitespace-nowrap">
                  <span className="text-ink">{person.display_name}</span>{" "}
                  {totals ? (
                    // Once brackets are being scored, what a column owes
                    // the reader is how it's doing, not whether it's full.
                    <span className="font-mono text-xs text-good">
                      {total} {total === 1 ? "pt" : "pts"}
                    </span>
                  ) : (
                    <span
                      className={
                        done === series.length
                          ? "font-mono text-xs text-good"
                          : "font-mono text-xs text-accent"
                      }
                    >
                      {done}/{series.length}
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {series.map((s) => (
            <tr key={s.key}>
              <td className="py-2 pr-6 whitespace-nowrap text-ink-muted">{s.label}</td>
              {people.map((person) => {
                const pick = pickFor(person.id, s.key);
                const verdict = pick ? verdictFor(person.id, s.key, pick.predicted_team_id) : null;
                const score = scoreFor(person.id, s.key);
                return (
                  <td key={person.id} className="py-1 pr-2 font-mono whitespace-nowrap">
                    <span
                      className={`inline-block rounded px-2 py-1 ${verdict ? cellTone[verdict] : ""}`}
                    >
                      {!pick ? (
                        missing
                      ) : (
                        <>
                          {teamName(pick.predicted_team_id)}{" "}
                          {pick.predicted_games === null ? (
                            <span className="text-accent">in ?</span>
                          ) : verdict === "right" && !score?.length_correct ? (
                            // Right team, wrong length: the winner scored but
                            // the bonus didn't, so only the length is struck.
                            <span className="text-ink-muted line-through">
                              in {pick.predicted_games}
                            </span>
                          ) : (
                            <>in {pick.predicted_games}</>
                          )}
                          {/* Written out rather than left to a hover tooltip,
                              which phones never show and desktops show late. */}
                          {verdict === "right" && score && (
                            <span className="ml-1.5 text-xs text-good">+{score.points}</span>
                          )}
                        </>
                      )}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}

          <tr className="border-t-2 border-border">
            <td className="py-2 pr-6 whitespace-nowrap text-ink-muted">World Series MVP</td>
            {people.map((person) => {
              const pick = mvpFor(person.id);
              const tone =
                !pick || !mvpWinner
                  ? ""
                  : mvpKey(pick) === mvpKey(mvpWinner)
                    ? cellTone.right
                    : cellTone.wrong;
              return (
                <td key={person.id} className="py-1 pr-2 font-mono whitespace-nowrap">
                  <span className={`inline-block rounded px-2 py-1 ${tone}`}>
                    {pick ?? missing}
                  </span>
                </td>
              );
            })}
          </tr>
          <tr>
            <td className="py-2 pr-6 whitespace-nowrap text-ink-muted">Total runs</td>
            {people.map((person) => (
              <td
                key={person.id}
                className="py-2 pr-2 pl-2 font-mono whitespace-nowrap tabular-nums"
              >
                {runsFor(person.id) ?? missing}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

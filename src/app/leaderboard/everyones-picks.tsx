import type { Series, Team } from "@/lib/supabase/types";

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
 */
export function EveryonesPicks({
  series,
  teams,
  people,
  picks,
  mvpPicks,
  tiebreakers,
}: {
  series: Series[];
  teams: Team[];
  people: Person[];
  picks: Pick[];
  mvpPicks: { user_id: string; player_name: string }[];
  tiebreakers: { user_id: string; total_runs_guess: number }[];
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
              return (
                <th key={person.id} className="py-2 pr-6 font-normal whitespace-nowrap">
                  <span className="text-ink">{person.display_name}</span>{" "}
                  <span
                    className={
                      done === series.length ? "font-mono text-xs text-good" : "font-mono text-xs text-accent"
                    }
                  >
                    {done}/{series.length}
                  </span>
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
                return (
                  <td key={person.id} className="py-2 pr-6 font-mono whitespace-nowrap">
                    {!pick ? (
                      missing
                    ) : pick.predicted_games === null ? (
                      <>
                        {teamName(pick.predicted_team_id)}{" "}
                        <span className="text-accent">in ?</span>
                      </>
                    ) : (
                      `${teamName(pick.predicted_team_id)} in ${pick.predicted_games}`
                    )}
                  </td>
                );
              })}
            </tr>
          ))}

          <tr className="border-t-2 border-border">
            <td className="py-2 pr-6 whitespace-nowrap text-ink-muted">World Series MVP</td>
            {people.map((person) => (
              <td key={person.id} className="py-2 pr-6 font-mono whitespace-nowrap">
                {mvpFor(person.id) ?? missing}
              </td>
            ))}
          </tr>
          <tr>
            <td className="py-2 pr-6 whitespace-nowrap text-ink-muted">Total runs</td>
            {people.map((person) => (
              <td key={person.id} className="py-2 pr-6 font-mono whitespace-nowrap tabular-nums">
                {runsFor(person.id) ?? missing}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

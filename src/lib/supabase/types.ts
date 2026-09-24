// Hand-maintained mirror of supabase/migrations/. If a migration adds a
// column, add it here too. Once the Supabase project exists this can be
// regenerated instead:
//   npx supabase gen types typescript --project-id <id> > src/lib/supabase/types.ts
//
// These are type aliases rather than interfaces on purpose: postgrest-js
// constrains each Row to Record<string, unknown>, and an interface has no
// implicit index signature, so interfaces here silently resolve every
// query result to `never`.

export type League = "AL" | "NL";
export type Round = "WC" | "DS" | "CS" | "WS";
export type GameStatus = "scheduled" | "live" | "final";

export type Profile = {
  id: string;
  display_name: string;
  email: string;
  is_commissioner: boolean;
  created_at: string;
}

export type Team = {
  id: number;
  name: string;
  short_name: string;
  code: string;
  league: League;
  division: "East" | "Central" | "West";
}

export type Player = {
  id: number;
  espn_id: number | null;
  team_id: number;
  full_name: string;
  position: string | null;
}

export type PlayoffSeed = {
  league: League;
  seed: number;
  team_id: number;
}

export type Series = {
  key: string;
  round: Round;
  league: League | null;
  best_of: number;
  label: string;
  sort_order: number;
  side_a_from_seed: number | null;
  side_a_from_series: string | null;
  side_b_from_seed: number | null;
  side_b_from_series: string | null;
  side_a_team_id: number | null;
  side_b_team_id: number | null;
}

export type Game = {
  id: number;
  series_key: string | null;
  game_number: number | null;
  home_team_id: number;
  away_team_id: number;
  home_score: number | null;
  away_score: number | null;
  status: GameStatus;
  start_utc: string;
}

export type ScoringConfig = {
  id: boolean;
  wc_points: number;
  ds_points: number;
  cs_points: number;
  ws_points: number;
  length_bonus: number;
  mvp_points: number;
  updated_at: string;
}

export type BracketPick = {
  user_id: string;
  series_key: string;
  predicted_team_id: number;
  // Null until the player picks a length — picking a team no longer picks
  // a game count for them.
  predicted_games: number | null;
  updated_at: string;
}

export type MvpPick = {
  user_id: string;
  player_id: number;
  updated_at: string;
}

export type TiebreakerPrediction = {
  user_id: string;
  total_runs_guess: number;
  updated_at: string;
}

export type SeriesResult = {
  series_key: string;
  round: Round;
  league: League | null;
  best_of: number;
  label: string;
  sort_order: number;
  side_a_team_id: number | null;
  side_b_team_id: number | null;
  games_played: number;
  side_a_wins: number;
  side_b_wins: number;
  wins_needed: number;
  winner_team_id: number | null;
}

export type BracketPickScore = {
  user_id: string;
  series_key: string;
  predicted_team_id: number;
  predicted_games: number | null;
  round: Round;
  winner_team_id: number | null;
  games_played: number;
  resolved: boolean;
  correct: boolean | null;
  length_correct: boolean;
  points: number;
}

export type LeaderboardRow = {
  user_id: string;
  display_name: string;
  series_points: number;
  mvp_points: number;
  total_points: number;
  total_runs_guess: number | null;
  tiebreaker_diff: number | null;
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string; display_name: string; email: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
      teams: {
        Row: Team;
        Insert: Omit<Team, "id">;
        Update: Partial<Team>;
        Relationships: [];
      };
      players: {
        Row: Player;
        Insert: Omit<Player, "id">;
        Update: Partial<Player>;
        Relationships: [];
      };
      playoff_seeds: {
        Row: PlayoffSeed;
        Insert: PlayoffSeed;
        Update: Partial<PlayoffSeed>;
        Relationships: [];
      };
      series: {
        Row: Series;
        Insert: Series;
        Update: Partial<Series>;
        Relationships: [];
      };
      games: {
        Row: Game;
        Insert: Game;
        Update: Partial<Game>;
        Relationships: [];
      };
      scoring_config: {
        Row: ScoringConfig;
        Insert: Partial<ScoringConfig>;
        Update: Partial<ScoringConfig>;
        Relationships: [];
      };
      bracket_picks: {
        Row: BracketPick;
        Insert: Omit<BracketPick, "updated_at">;
        Update: Partial<BracketPick>;
        Relationships: [];
      };
      mvp_picks: {
        Row: MvpPick;
        Insert: Omit<MvpPick, "updated_at">;
        Update: Partial<MvpPick>;
        Relationships: [];
      };
      tiebreaker_predictions: {
        Row: TiebreakerPrediction;
        Insert: Omit<TiebreakerPrediction, "updated_at">;
        Update: Partial<TiebreakerPrediction>;
        Relationships: [];
      };
      app_settings: {
        Row: { key: string; value: string | null; updated_at: string };
        Insert: { key: string; value: string | null };
        Update: { value: string | null };
        Relationships: [];
      };
      world_series_mvp: {
        Row: { id: boolean; player_id: number; set_at: string };
        Insert: { id?: boolean; player_id: number };
        Update: { player_id: number };
        Relationships: [];
      };
    };
    Views: {
      series_results: { Row: SeriesResult; Relationships: [] };
      bracket_pick_scores: { Row: BracketPickScore; Relationships: [] };
      overall_leaderboard: { Row: LeaderboardRow; Relationships: [] };
      playoff_total_runs: { Row: { total_runs: number; games_final: number }; Relationships: [] };
    };
    Functions: {
      picks_locked: { Args: Record<string, never>; Returns: boolean };
      picks_open: { Args: Record<string, never>; Returns: boolean };
      picks_editable: { Args: Record<string, never>; Returns: boolean };
      is_commissioner: { Args: Record<string, never>; Returns: boolean };
    };
  };
}

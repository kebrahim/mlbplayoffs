import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Bypasses RLS — only ever import this inside trusted server-side code
// (Route Handlers) after doing your own auth/authorization checks. Never
// expose SUPABASE_SERVICE_ROLE_KEY to the client.
export function createServiceRoleClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

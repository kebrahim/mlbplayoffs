import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

// Creates a Supabase client for use in Server Components, Server Actions,
// and Route Handlers. Must be called fresh per request (not cached/reused).
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component during rendering, where cookies
            // can't be set. Safe to ignore as long as the proxy is also
            // refreshing the session (see src/proxy.ts).
          }
        },
      },
    },
  );
}

import { createClient } from "@/lib/supabase/server";
import type { Profile } from "./types";

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, email, is_commissioner, created_at")
    .eq("id", user.id)
    .single();

  return profile;
}

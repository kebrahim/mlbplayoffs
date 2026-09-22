"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function signIn(_prev: string | null, formData: FormData): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (error) return error.message;

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signUp(_prev: string | null, formData: FormData): Promise<string | null> {
  const displayName = String(formData.get("display_name") ?? "").trim();
  if (!displayName) return "Pick a name for the leaderboard.";

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    // handle_new_user reads this to fill profiles.display_name.
    options: { data: { display_name: displayName } },
  });
  if (error) return error.message;

  revalidatePath("/", "layout");
  redirect("/");
}

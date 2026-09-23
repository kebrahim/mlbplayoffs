"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/current-user";

export async function setDisplayName(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const profile = await getCurrentProfile();
  if (!profile) return "Sign in first.";

  const displayName = String(formData.get("display_name") ?? "").trim();
  if (!displayName) return "A name can't be blank.";

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName })
    .eq("id", profile.id);
  if (error) return error.message;

  revalidatePath("/", "layout");
  return null;
}

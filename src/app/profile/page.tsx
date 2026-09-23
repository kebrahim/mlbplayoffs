import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/supabase/current-user";
import { DisplayNameForm } from "./display-name-form";

export default async function ProfilePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  return (
    <div>
      <h1 className="font-heading text-3xl tracking-wide uppercase">Profile</h1>
      <p className="mt-3 mb-8 font-mono text-sm text-ink-muted">{profile.email}</p>
      <DisplayNameForm current={profile.display_name} />
    </div>
  );
}

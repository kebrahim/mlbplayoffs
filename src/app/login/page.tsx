import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/");

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="font-heading mb-2 text-3xl tracking-wide uppercase">October</h1>
      <p className="mb-8 text-sm text-ink-muted">
        Pick every series of the playoffs before the first pitch.
      </p>
      <LoginForm />
    </div>
  );
}

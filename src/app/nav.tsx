import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

const LINKS = [
  { href: "/my-bracket", label: "My Bracket" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/series", label: "Series" },
  { href: "/profile", label: "Profile" },
];

export async function Nav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isCommissioner = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_commissioner")
      .eq("id", user.id)
      .single();
    isCommissioner = profile?.is_commissioner ?? false;
  }

  return (
    <header className="border-b border-border bg-surface">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="font-heading text-lg font-semibold tracking-wide text-accent uppercase"
        >
          October
        </Link>

        {user && (
          <div className="flex items-center gap-6 text-sm font-medium">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-ink-muted transition-colors hover:text-ink"
              >
                {link.label}
              </Link>
            ))}
            {isCommissioner && (
              <Link href="/admin" className="text-ink-muted transition-colors hover:text-ink">
                Admin
              </Link>
            )}
            <form action={signOut}>
              <button type="submit" className="text-ink-muted transition-colors hover:text-ink">
                Sign out
              </button>
            </form>
          </div>
        )}
      </nav>
    </header>
  );
}

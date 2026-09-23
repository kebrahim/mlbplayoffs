"use client";

import { useActionState } from "react";
import { setDisplayName } from "./actions";

export function DisplayNameForm({ current }: { current: string }) {
  const [error, formAction, pending] = useActionState(setDisplayName, null);

  return (
    <form action={formAction} className="max-w-sm">
      <label className="block">
        <span className="mb-1 block text-sm text-ink-muted">
          How you show up on the leaderboard
        </span>
        <input
          name="display_name"
          defaultValue={current}
          className="w-full rounded border border-border bg-surface px-3 py-2 outline-none focus:border-accent"
        />
      </label>
      <div className="mt-4 flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {error && <p className="text-sm text-accent">{error}</p>}
      </div>
    </form>
  );
}

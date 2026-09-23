"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SyncButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | string>("idle");

  async function sync() {
    setState("running");
    try {
      const res = await fetch("/api/sync/games", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setState(body.error ?? "The sync failed.");
        return;
      }
      setState(
        body.reason ??
          `Stored ${body.synced} games${body.advanced?.length ? `, advanced ${body.advanced.join(", ")}` : ""}.` +
            (body.unknownCodes?.length
              ? ` Unrecognised team codes: ${body.unknownCodes.join(", ")} — fix those teams' codes below.`
              : ""),
      );
      router.refresh();
    } catch (error) {
      setState(error instanceof Error ? error.message : "The sync failed.");
    }
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={sync}
        disabled={state === "running"}
        className="rounded bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {state === "running" ? "Syncing…" : "Sync scores now"}
      </button>
      {state !== "idle" && state !== "running" && (
        <p className="text-sm text-ink-muted">{state}</p>
      )}
    </div>
  );
}

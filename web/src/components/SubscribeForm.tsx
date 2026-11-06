"use client";

import { useEffect, useState } from "react";
import { kicker } from "@/components/Boxed";
import { cn } from "@/lib/cn";

/** `invalid` marks the address the server rejected, described by the page's #subscribe-status message. */
export function SubscribeForm({ tone, invalid = false }: { tone: "dark" | "light"; invalid?: boolean }) {
  const dark = tone === "dark";
  // Disables the button once the form posts, so a second click cannot send a second confirmation email.
  const [pending, setPending] = useState(false);
  useEffect(() => {
    // Going back to this page can restore it from the back/forward cache with the button still disabled.
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setPending(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);
  return (
    <form method="post" action="/api/subscribe" onSubmit={() => setPending(true)} className="@container max-w-md">
      <p className={cn("mb-4 text-sm", dark ? "text-charcoal-200" : "text-charcoal-800")}>
        One email when new figures are loaded: a new budget book or audited statement. Nothing else.
      </p>
      <div className="flex flex-col gap-3 @sm:flex-row">
        <label className="flex min-w-0 flex-1">
          <span className="sr-only">Email address</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            spellCheck={false}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? "subscribe-status" : undefined}
            autoFocus={invalid}
            placeholder="you@example.com"
            className={cn(
              "w-full min-w-0 border-2 bg-transparent px-4 py-2 font-mono text-base sm:text-sm",
              dark
                ? "border-charcoal-300 text-background placeholder:text-charcoal-300"
                : "border-foreground placeholder:text-charcoal-600",
            )}
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className={cn(
            kicker,
            "whitespace-nowrap border-2 px-6 py-2 disabled:cursor-progress disabled:opacity-60",
            dark
              ? "border-charcoal-300 text-background enabled:hover:bg-charcoal-300 enabled:hover:text-foreground"
              : "border-foreground enabled:hover:bg-foreground enabled:hover:text-background",
          )}
        >
          {pending ? "Sending…" : "Get alerts"}
        </button>
      </div>
      {/* Bots fill every field; the API drops a sign-up that fills this one. */}
      <div aria-hidden="true" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
        <label>
          Leave blank
          <input type="text" name="_honey" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
    </form>
  );
}

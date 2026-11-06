import { kicker } from "@/components/Boxed";
import { cn } from "@/lib/cn";

export function SubscribeForm({ tone }: { tone: "dark" | "light"; invalid?: boolean }) {
  const dark = tone === "dark";
  return (
    <form method="post" action="/api/subscribe" className="@container max-w-md">
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
            placeholder="you@example.com"
            className={cn(
              "w-full min-w-0 border-2 bg-transparent px-4 py-2 font-mono text-sm placeholder:text-charcoal-500 focus:outline-2 focus:outline-offset-2",
              dark
                ? "border-charcoal-300 text-background focus:outline-background"
                : "border-foreground focus:outline-foreground",
            )}
          />
        </label>
        <button
          type="submit"
          className={cn(
            kicker,
            "whitespace-nowrap border-2 px-6 py-2",
            dark
              ? "border-charcoal-300 text-background hover:bg-charcoal-300 hover:text-foreground"
              : "border-foreground hover:bg-foreground hover:text-background",
          )}
        >
          Get alerts
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

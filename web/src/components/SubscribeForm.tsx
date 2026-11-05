import { kicker } from "@/components/Boxed";
import { cn } from "@/lib/cn";

export function SubscribeForm({ tone }: { tone: "dark" | "light" }) {
  const dark = tone === "dark";
  return (
    <form method="post" action="/api/subscribe" className="max-w-md">
      <p className={cn("mb-4 text-sm", dark ? "text-charcoal-200" : "text-charcoal-800")}>
        One email when new figures are loaded: a new budget book or audited statement. Nothing else.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="subscribe-email" className="sr-only">
          Email address
        </label>
        <input
          id="subscribe-email"
          type="email"
          name="email"
          required
          placeholder="you@example.com"
          className={cn(
            "flex-1 border-2 bg-transparent px-4 py-2 font-mono text-sm placeholder:text-charcoal-500 focus:outline-2 focus:outline-offset-2",
            dark
              ? "border-charcoal-300 text-background focus:outline-background"
              : "border-foreground focus:outline-foreground",
          )}
        />
        <button
          type="submit"
          className={cn(
            kicker,
            "border-2 px-6 py-2",
            dark
              ? "border-charcoal-300 text-background hover:bg-charcoal-300 hover:text-foreground"
              : "border-foreground hover:bg-foreground hover:text-background",
          )}
        >
          Get alerts
        </button>
      </div>
      {/* Honeypot: positioned off-screen and hidden from AT; bots fill it, triggering a silent discard */}
      <div aria-hidden="true" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
        <label htmlFor="subscribe-honey">Leave blank</label>
        <input id="subscribe-honey" type="text" name="_honey" tabIndex={-1} autoComplete="off" />
      </div>
    </form>
  );
}

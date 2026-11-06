import { kicker } from "@/components/Boxed";
import { cn } from "@/lib/cn";

/** `invalid` marks the address the server rejected, described by the page's #subscribe-status message. */
export function SubscribeForm({ tone, invalid = false }: { tone: "dark" | "light"; invalid?: boolean }) {
  const dark = tone === "dark";
  return (
    // data-subscribe: SUBSCRIBE_SCRIPT disables the button once the form posts.
    <form method="post" action="/api/subscribe" data-subscribe className="@container max-w-md">
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
          className={cn(
            kicker,
            "whitespace-nowrap border-2 px-6 py-2 disabled:cursor-progress disabled:opacity-60",
            dark
              ? "border-charcoal-300 text-background enabled:hover:bg-charcoal-300 enabled:hover:text-foreground"
              : "border-foreground enabled:hover:bg-foreground enabled:hover:text-background",
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

/**
 * Disables a sign-up form's button once it posts, so a second click cannot send a second confirmation email.
 * Going back can restore the page from the back/forward cache with the button still disabled, so that re-enables it.
 */
export const SUBSCRIBE_SCRIPT = `document.addEventListener("submit",function(e){var f=e.target;if(!(f instanceof HTMLFormElement)||!f.hasAttribute("data-subscribe"))return;var b=f.querySelector("button[type=submit]");if(b){b.disabled=true;b.textContent="Sending…"}});addEventListener("pageshow",function(e){if(!e.persisted)return;document.querySelectorAll("form[data-subscribe] button[type=submit]").forEach(function(b){b.disabled=false;b.textContent="Get alerts"})})`;

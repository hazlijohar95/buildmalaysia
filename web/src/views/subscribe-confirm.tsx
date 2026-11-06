import { Band, PageHeader, kicker } from "@/components/Boxed";
import { getSubscribeEnv } from "@/lib/subscribe/env";
import { STATUS_COPY } from "@/lib/subscribe/types";
import { verifyToken, type TokenResult } from "@/lib/subscribe/token";
import { cn } from "@/lib/cn";
import type { Page, RouteContext } from "@/lib/route";

export default async function subscribeConfirmPage({ searchParams }: RouteContext): Promise<Page> {
  const token = searchParams.get("token") ?? undefined;
  const { subscribeSecret } = getSubscribeEnv();

  if (!subscribeSecret) {
    return {
      head: { title: "Confirm subscription" },
      body: (
        <>
          <PageHeader eyebrow="Alerts" title="Confirm subscription" />
          <Band>
            <p className="max-w-lg">{STATUS_COPY.unavailable}</p>
          </Band>
        </>
      ),
    };
  }

  const result: TokenResult = token ? await verifyToken(token, subscribeSecret) : { ok: false, reason: "invalid" };

  if (!result.ok) {
    const copy = result.reason === "expired" ? STATUS_COPY["token-expired"] : STATUS_COPY["token-invalid"];
    return {
      head: { title: "Confirm subscription" },
      body: (
        <>
          <PageHeader eyebrow="Alerts" title="Confirm subscription" />
          <Band>
            <p className="mb-6 max-w-lg">{copy}</p>
            <a href="/subscribe" className={cn(kicker, "inline-block border-2 border-foreground px-5 py-2")}>
              Get a new link
            </a>
          </Band>
        </>
      ),
    };
  }

  return {
    head: { title: "Confirm subscription" },
    body: (
      <>
        <PageHeader
          eyebrow="Alerts"
          title="Confirm subscription"
          intro={<p>We will email you when new figures are loaded.</p>}
        />
        <Band>
          <form method="post" action="/api/subscribe/confirm">
            <input type="hidden" name="token" value={token} />
            <button
              type="submit"
              className={cn(
                kicker,
                "border-2 border-foreground bg-background px-6 py-3 hover:bg-foreground hover:text-background",
              )}
            >
              Confirm subscription
            </button>
          </form>
        </Band>
      </>
    ),
  };
}

import { Band, PageHeader } from "@/components/Boxed";
import { Logo } from "@/components/brand/Logo";
import { SubscribeForm } from "@/components/SubscribeForm";
import { cn } from "@/lib/cn";
import { FEED_PATH } from "@/lib/feed";
import { STATUS_COPY, type SubscribeStatus } from "@/lib/subscribe/types";
import type { Page, RouteContext } from "@/lib/route";

function pickStatus(sent: string | null, confirmed: string | null, error: string | null): SubscribeStatus | null {
  if (sent) return "sent";
  if (confirmed) return "confirmed";
  if (error === "invalid") return "invalid";
  if (error === "busy") return "busy";
  if (error === "unavailable") return "unavailable";
  if (error === "retry") return "retry";
  return null;
}

export default async function subscribePage({ searchParams }: RouteContext): Promise<Page> {
  const status = pickStatus(searchParams.get("sent"), searchParams.get("confirmed"), searchParams.get("error"));

  return {
    head: {
      title: "Get alerts",
      description:
        "One email when Build Malaysia loads new figures: a new budget book or audited statement. Nothing else.",
    },
    body: (
      <>
        <PageHeader eyebrow="Alerts" title="Get alerts" />
        <Band>
          {status && (
            <div
              id="subscribe-status"
              className={cn(
                "mb-8 max-w-lg border-2 border-foreground p-4 text-sm",
                (status === "sent" || status === "confirmed") && "status-in flex items-center gap-4",
              )}
              role="status"
            >
              {status === "confirmed" && <Logo unit={1} decorative className="celebrate shrink-0" />}
              <span>{STATUS_COPY[status]}</span>
            </div>
          )}
          {status !== "unavailable" && <SubscribeForm tone="light" invalid={status === "invalid"} />}
          <p className="mt-8 max-w-md text-sm text-charcoal-800">
            Or follow the <a href={FEED_PATH}>source documents feed</a> in a feed reader: one entry for each document as
            it is loaded.
          </p>
        </Band>
      </>
    ),
  };
}

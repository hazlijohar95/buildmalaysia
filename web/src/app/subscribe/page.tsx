import type { Metadata } from "next";
import { Band, PageHeader } from "@/components/Boxed";
import { Logo } from "@/components/brand/Logo";
import { SubscribeForm } from "@/components/SubscribeForm";
import { cn } from "@/lib/cn";
import { STATUS_COPY, type SubscribeStatus } from "@/lib/subscribe/types";

export const metadata: Metadata = {
  title: "Get alerts",
};

function pickStatus(params: { sent?: string; confirmed?: string; error?: string }): SubscribeStatus | null {
  if (params.sent) return "sent";
  if (params.confirmed) return "confirmed";
  if (params.error === "invalid") return "invalid";
  if (params.error === "busy") return "busy";
  if (params.error === "unavailable") return "unavailable";
  if (params.error === "retry") return "retry";
  return null;
}

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; confirmed?: string; error?: string }>;
}) {
  const params = await searchParams;
  const status = pickStatus(params);

  return (
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
      </Band>
    </>
  );
}

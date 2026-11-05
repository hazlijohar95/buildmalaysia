import Link from "next/link";
import { Band, PageHeader, kicker } from "@/components/Boxed";
import { getSubscribeEnv } from "@/lib/subscribe/env";
import { STATUS_COPY } from "@/lib/subscribe/types";
import { verifyToken } from "@/lib/subscribe/token";
import { cn } from "@/lib/cn";

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const env = getSubscribeEnv();

  if (!token || !env.subscribeSecret) {
    return (
      <>
        <PageHeader eyebrow="Alerts" title="Confirm subscription" />
        <Band>
          <p>{STATUS_COPY["token-invalid"]}</p>
        </Band>
      </>
    );
  }

  const result = await verifyToken(token, env.subscribeSecret);

  if (!result.ok) {
    const copy = result.reason === "expired" ? STATUS_COPY["token-expired"] : STATUS_COPY["token-invalid"];
    return (
      <>
        <PageHeader eyebrow="Alerts" title="Confirm subscription" />
        <Band>
          <p className="mb-6 max-w-lg">{copy}</p>
          {result.reason === "expired" && (
            <Link href="/subscribe" className={cn(kicker, "inline-block border-2 border-foreground px-5 py-2")}>
              Subscribe again
            </Link>
          )}
        </Band>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Alerts"
        title="Confirm subscription"
        intro={<p>Click below to confirm. We will email you when new budget figures are published.</p>}
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
  );
}

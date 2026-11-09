import type { ReactNode } from "react";
import { Band } from "@/components/Boxed";
import { LOAD_FAILED_MARKER } from "@/lib/route";

/**
 * A page body, or the deferred part of one, that loads after the layout has streamed (see PageSkeleton and
 * PageBody.astro). By then the 200 status and the header are sent, so a failure can't become an error page: it
 * renders a notice in place, rather than cutting the page off under a skeleton that never leaves. `load` must not
 * decide a 404 or a redirect; do that before streaming starts.
 */
export default async function Streamed({
  load,
  scope = "page",
}: {
  load: () => Promise<ReactNode>;
  /** A section sits under a heading the page already sent, so its notice takes no <h1>. */
  scope?: "page" | "section";
}) {
  try {
    return await load();
  } catch (error) {
    console.error(error);
    const Title = scope === "page" ? "h1" : "h2";
    return (
      <div {...{ [LOAD_FAILED_MARKER]: "" }}>
        <Band>
          <Title className="m-0 font-display text-3xl font-semibold tracking-tight">
            {scope === "page" ? "This page didn\u2019t load" : "The rest of this page didn\u2019t load"}
          </Title>
          <p className="mt-4 max-w-2xl text-lg text-charcoal-800">
            The figures couldn&apos;t be read from the database just now. <a href="">Try again</a> in a moment.
          </p>
        </Band>
      </div>
    );
  }
}

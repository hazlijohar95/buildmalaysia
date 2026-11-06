import type { ReactNode } from "react";
import { Band } from "@/components/Boxed";
import { LOAD_FAILED_MARKER } from "@/lib/route";

/**
 * A page body that loads after the layout has streamed (see PageSkeleton). By then the 200 status and the header
 * are sent, so a failure can't become an error page: it renders a notice in place, rather than cutting the page off
 * under a skeleton that never leaves. `load` must not decide a 404 or a redirect; do that before streaming starts.
 */
export default async function Streamed({ load }: { load: () => Promise<ReactNode> }) {
  try {
    return await load();
  } catch (error) {
    console.error(error);
    return (
      <div {...{ [LOAD_FAILED_MARKER]: "" }}>
        <Band>
          <h1 className="m-0 font-display text-3xl font-semibold tracking-tight">This page didn&apos;t load</h1>
          <p className="mt-4 max-w-2xl text-lg text-charcoal-800">
            The figures couldn&apos;t be read from the database just now. <a href="">Try again</a> in a moment.
          </p>
        </Band>
      </div>
    );
  }
}

import type { ReactNode } from "react";

/** Lets an .astro page render markup a view built in React, with no JavaScript sent for it. */
export default function Static({ node }: { node: ReactNode }) {
  return <>{node}</>;
}

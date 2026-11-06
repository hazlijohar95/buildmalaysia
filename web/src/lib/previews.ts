import type { Head } from "@/lib/route";

type Preview = NonNullable<Head["og"]>;

/** The link-preview images under src/pages/**\/opengraph-image.ts. A page uses its nearest ancestor's. */
export const previews = {
  site: { path: "/opengraph-image", alt: "Build Malaysia: the facts about government spending" },
  spending: { path: "/spending/opengraph-image", alt: "Where the money went: federal spending, year by year" },
  revenue: { path: "/revenue/opengraph-image", alt: "Where the government's money comes from" },
  tax: { path: "/tax/opengraph-image", alt: "Where your income tax goes" },
  year: (year: number): Preview => ({ path: `/${year}/opengraph-image`, alt: "Federal spending for the year" }),
  budget: (budgetYear: number): Preview => ({
    path: `/budget/${budgetYear}/opengraph-image`,
    alt: "The federal budget as tabled",
  }),
  ministry: (slug: string): Preview => ({
    path: `/ministries/${slug}/opengraph-image`,
    alt: "What this ministry spent",
  }),
} satisfies Record<string, Preview | ((key: never) => Preview)>;

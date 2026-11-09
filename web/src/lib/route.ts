import type { ReactNode } from "react";

/** What a route's URL gives its page. */
export interface RouteContext {
  params: Record<string, string | undefined>;
  searchParams: URLSearchParams;
}

/** The page's head; src/layouts/Base.astro fills in the site defaults. */
export interface Head {
  /** The page's own title; the site name is appended. Omit on the home page. */
  title?: string;
  description?: string;
  /** The link-preview image route. Pages without one use the site's. Width and height default to 1200 × 630. */
  og?: { path: string; alt: string; width?: number; height?: number };
  /** The path search engines should index when several URLs show this page. */
  canonical?: string;
  noindex?: boolean;
}

/** A page rendered once on the server: its data is loaded before the markup is built. */
export interface Page {
  head: Head;
  body: ReactNode;
  /**
   * The rest of the page, when it waits on slower queries: `body` is sent at once, `skeleton` holds its place, and
   * `load` streams in behind it (PageBody.astro). Decide a 404 or redirect before returning, not in `load`.
   */
  deferred?: { skeleton: ReactNode; load: () => Promise<ReactNode> };
}

/** Marks a page whose body failed after the layout had streamed (Streamed.tsx); worker.ts never caches it. */
export const LOAD_FAILED_MARKER = "data-load-failed";

import type { APIRoute } from "astro";
import { renderFeed } from "@/lib/feed";
import { getSourceDocuments } from "@/lib/queries/sources";

export const GET: APIRoute = async ({ site, url }) =>
  new Response(renderFeed(await getSourceDocuments(), site ?? url), {
    headers: { "content-type": "application/atom+xml; charset=utf-8" },
  });

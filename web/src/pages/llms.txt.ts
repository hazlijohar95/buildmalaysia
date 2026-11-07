import type { APIRoute } from "astro";
import { renderLlmsTxt } from "@/lib/llms";
import { loadNav } from "@/lib/nav";
import { getSourceDocuments } from "@/lib/queries/sources";

export const GET: APIRoute = async ({ site, url }) => {
  const [nav, docs] = await Promise.all([loadNav(), getSourceDocuments()]);
  return new Response(renderLlmsTxt(nav, docs, site ?? url), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
};

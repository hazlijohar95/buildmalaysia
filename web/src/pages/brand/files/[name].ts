import type { APIRoute } from "astro";
import { BRAND_FILES } from "@/brand/files";
import { svgPng } from "@/brand/og";

export const GET: APIRoute = ({ params }) => {
  const file = BRAND_FILES.find((f) => f.name === params.name);
  if (!file) return new Response("Not found", { status: 404 });
  if (file.format === "svg") {
    return new Response(file.svg, { headers: { "content-type": "image/svg+xml; charset=utf-8" } });
  }
  return svgPng(file.svg, { width: file.width, height: file.height });
};

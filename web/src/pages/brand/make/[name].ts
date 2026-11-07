import type { APIRoute } from "astro";
import { fileResponse } from "@/brand/download";
import { makeFile } from "@/brand/make";
import { parseMakeName } from "@/brand/make-spec";

export const GET: APIRoute = ({ params }) => {
  const spec = parseMakeName(params.name ?? "");
  return spec ? fileResponse(makeFile(spec)) : new Response("Not found", { status: 404 });
};

import type { APIRoute } from "astro";
import { fileResponse, zipResponse } from "@/brand/download";
import { BRAND_FILES } from "@/brand/files";
import { BRAND_ZIP } from "@/brand/paths";

export const GET: APIRoute = ({ params }) => {
  if (params.name === BRAND_ZIP) return zipResponse();
  const file = BRAND_FILES.find((f) => f.name === params.name);
  if (!file) return new Response("Not found", { status: 404 });
  return fileResponse(file);
};

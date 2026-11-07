// The builder's form submits here when JavaScript is off; the choices become a file name with its own URL.
import type { APIRoute } from "astro";
import { makeUrl, parseMakeQuery } from "@/brand/make-spec";

export const GET: APIRoute = ({ url, redirect }) => {
  const spec = parseMakeQuery(url.searchParams);
  return redirect(spec ? makeUrl(spec) : "/brand#files", 303);
};

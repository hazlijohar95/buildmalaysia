import type { APIRoute } from "astro";
import { PALETTE } from "@/brand/carta";
import { brandFileUrl } from "@/brand/files";
import { colours } from "@/styles/colours";

const MANIFEST = {
  name: "Build Malaysia",
  short_name: "Build Malaysia",
  description: "The facts about Malaysian government spending, from the official documents.",
  start_url: "/",
  display: "browser",
  background_color: colours.linen["100"],
  theme_color: PALETTE.biru.hex,
  icons: [
    { src: brandFileUrl("icon.svg"), type: "image/svg+xml", sizes: "any" },
    { src: brandFileUrl("icon-192.png"), type: "image/png", sizes: "192x192" },
    { src: brandFileUrl("icon-512.png"), type: "image/png", sizes: "512x512" },
    { src: brandFileUrl("icon-maskable-512.png"), type: "image/png", sizes: "512x512", purpose: "maskable" },
  ],
};

export const GET: APIRoute = () =>
  new Response(JSON.stringify(MANIFEST), { headers: { "content-type": "application/manifest+json" } });

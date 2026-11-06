import type { APIRoute } from "astro";
import { ogImage } from "@/brand/og";

export const GET: APIRoute = () => ogImage({ kicker: "Your taxes", title: "Where your income tax goes" });

import type { APIRoute } from "astro";
import { getSubscribeEnv } from "@/lib/subscribe/env";
import { subscribe } from "@/lib/subscribe/handlers";

export const POST: APIRoute = ({ request }) => subscribe(request, getSubscribeEnv());

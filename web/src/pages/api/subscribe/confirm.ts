import type { APIRoute } from "astro";
import { getSubscribeEnv } from "@/lib/subscribe/env";
import { confirm } from "@/lib/subscribe/handlers";

export const POST: APIRoute = ({ request }) => confirm(request, getSubscribeEnv());

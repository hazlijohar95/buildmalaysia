import { env } from "cloudflare:workers";
import type { AlertList } from "@/lib/subscribe/resend";

export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface SubscribeEnv {
  resendApiKey: string | undefined;
  subscribeSecret: string | undefined;
  alertList: AlertList | undefined;
  subscribeLimiter: RateLimiter | undefined;
}

/** The sign-up settings from the Worker's bindings. Secrets are unset until `wrangler secret put`. */
export function getSubscribeEnv(): SubscribeEnv {
  const { RESEND_SEGMENT_ID: segmentId, RESEND_TOPIC_ID: topicId } = env;
  return {
    resendApiKey: env.RESEND_API_KEY || undefined,
    subscribeSecret: env.SUBSCRIBE_SECRET || undefined,
    alertList: segmentId && topicId ? { segmentId, topicId } : undefined,
    subscribeLimiter: env.SUBSCRIBE_LIMITER,
  };
}

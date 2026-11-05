import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { AlertList } from "@/lib/subscribe/resend";

const onWorkers = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface SubscribeEnv {
  resendApiKey: string | undefined;
  subscribeSecret: string | undefined;
  alertList: AlertList | undefined;
  subscribeLimiter: RateLimiter | undefined;
}

function alertList(segmentId: string | undefined, topicId: string | undefined): AlertList | undefined {
  return segmentId && topicId ? { segmentId, topicId } : undefined;
}

export function getSubscribeEnv(): SubscribeEnv {
  if (onWorkers) {
    const env = getCloudflareContext().env;
    return {
      resendApiKey: env.RESEND_API_KEY,
      subscribeSecret: env.SUBSCRIBE_SECRET,
      alertList: alertList(env.RESEND_SEGMENT_ID, env.RESEND_TOPIC_ID),
      subscribeLimiter: env.SUBSCRIBE_LIMITER,
    };
  }
  return {
    resendApiKey: process.env.RESEND_API_KEY,
    subscribeSecret: process.env.SUBSCRIBE_SECRET,
    alertList: alertList(process.env.RESEND_SEGMENT_ID, process.env.RESEND_TOPIC_ID),
    subscribeLimiter: undefined,
  };
}

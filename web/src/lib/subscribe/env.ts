import { getCloudflareContext } from "@opennextjs/cloudflare";

const onWorkers = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface SubscribeEnv {
  resendApiKey: string | undefined;
  subscribeSecret: string | undefined;
  resendSegmentId: string | undefined;
  subscribeLimiter: RateLimiter | undefined;
}

export function getSubscribeEnv(): SubscribeEnv {
  if (onWorkers) {
    const env = getCloudflareContext().env;
    return {
      resendApiKey: env.RESEND_API_KEY,
      subscribeSecret: env.SUBSCRIBE_SECRET,
      resendSegmentId: env.RESEND_SEGMENT_ID,
      subscribeLimiter: env.SUBSCRIBE_LIMITER,
    };
  }
  return {
    resendApiKey: process.env.RESEND_API_KEY,
    subscribeSecret: process.env.SUBSCRIBE_SECRET,
    resendSegmentId: process.env.RESEND_SEGMENT_ID,
    subscribeLimiter: undefined,
  };
}

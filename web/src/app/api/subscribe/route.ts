import { isValidEmail, normalizeEmail } from "@/lib/subscribe/email";
import { getSubscribeEnv } from "@/lib/subscribe/env";
import { sendConfirmEmail } from "@/lib/subscribe/resend";
import { createToken } from "@/lib/subscribe/token";

function redirect(to: string): Response {
  return new Response(null, { status: 303, headers: { Location: to } });
}

export async function POST(request: Request): Promise<Response> {
  const env = getSubscribeEnv();

  if (!env.resendApiKey || !env.subscribeSecret) {
    return redirect("/subscribe?error=unavailable");
  }

  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "unknown";

  if (env.subscribeLimiter) {
    const { success } = await env.subscribeLimiter.limit({ key: ip });
    if (!success) return redirect("/subscribe?error=busy");
  }

  let body: URLSearchParams;
  try {
    body = new URLSearchParams(await request.text());
  } catch {
    return redirect("/subscribe?error=invalid");
  }

  // Honeypot: bots fill this in; real users never see it. Silent discard.
  if (body.get("_honey")) return redirect("/subscribe?sent=1");

  const rawEmail = body.get("email") ?? "";
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) return redirect("/subscribe?error=invalid");

  const token = await createToken(email, env.subscribeSecret);
  const confirmUrl = `https://buildmalaysia.com/subscribe/confirm?token=${encodeURIComponent(token)}`;

  const result = await sendConfirmEmail({ to: email, confirmUrl, apiKey: env.resendApiKey });
  if (!result.ok) {
    console.error("[subscribe] Resend send failed", result.status, result.body);
    return redirect("/subscribe?error=retry");
  }

  return redirect("/subscribe?sent=1");
}

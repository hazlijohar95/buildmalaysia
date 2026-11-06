import { isValidEmail, normalizeEmail } from "@/lib/subscribe/email";
import type { SubscribeEnv } from "@/lib/subscribe/env";
import { sendConfirmEmail, upsertContact } from "@/lib/subscribe/resend";
import { createToken, verifyToken } from "@/lib/subscribe/token";

function redirect(to: string): Response {
  return new Response(null, { status: 303, headers: { Location: to } });
}

/** POST /api/subscribe: emails a confirmation link. Every outcome redirects back to /subscribe with its status. */
export async function subscribe(request: Request, env: SubscribeEnv): Promise<Response> {
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

/** POST /api/subscribe/confirm: adds a confirmed address to the alert list. */
export async function confirm(request: Request, env: SubscribeEnv): Promise<Response> {
  if (!env.resendApiKey || !env.subscribeSecret || !env.alertList) {
    return redirect("/subscribe?error=retry");
  }

  let body: URLSearchParams;
  try {
    body = new URLSearchParams(await request.text());
  } catch {
    return redirect("/subscribe");
  }

  const token = body.get("token") ?? "";
  const verified = await verifyToken(token, env.subscribeSecret);

  if (!verified.ok) {
    // Redirect back to the confirm page, which re-verifies and shows the right error state.
    return redirect(`/subscribe/confirm?token=${encodeURIComponent(token)}`);
  }

  const result = await upsertContact({
    email: verified.email,
    list: env.alertList,
    apiKey: env.resendApiKey,
  });

  if (!result.ok) {
    console.error("[subscribe/confirm] Resend contact failed", result.status, result.body);
    return redirect("/subscribe?error=retry");
  }

  return redirect("/subscribe?confirmed=1");
}

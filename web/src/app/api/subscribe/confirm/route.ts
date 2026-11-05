import { getSubscribeEnv } from "@/lib/subscribe/env";
import { upsertContact } from "@/lib/subscribe/resend";
import { verifyToken } from "@/lib/subscribe/token";

function redirect(to: string): Response {
  return new Response(null, { status: 303, headers: { Location: to } });
}

export async function POST(request: Request): Promise<Response> {
  const env = getSubscribeEnv();

  if (!env.resendApiKey || !env.subscribeSecret || !env.resendSegmentId) {
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
    segmentId: env.resendSegmentId,
    apiKey: env.resendApiKey,
  });

  if (!result.ok) {
    console.error("[subscribe/confirm] Resend contact failed", result.status, result.body);
    return redirect("/subscribe?error=retry");
  }

  return redirect("/subscribe?confirmed=1");
}

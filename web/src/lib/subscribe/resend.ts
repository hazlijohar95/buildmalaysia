// Resend REST API calls via fetch (no SDK).
// Emails: https://resend.com/docs/api-reference/emails/send-email
// Contacts: https://resend.com/docs/api-reference/contacts/create-contact

const RESEND_BASE = "https://api.resend.com";

export type ResendResult = { ok: true } | { ok: false; status: number; body: string };

async function post(path: string, apiKey: string, body: unknown): Promise<ResendResult> {
  let res: Response;
  try {
    res = await fetch(`${RESEND_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, status: 0, body: String(err) };
  }
  if (res.ok) return { ok: true };
  const text = await res.text().catch(() => "");
  return { ok: false, status: res.status, body: text };
}

export function sendConfirmEmail(opts: { to: string; confirmUrl: string; apiKey: string }): Promise<ResendResult> {
  return post("/emails", opts.apiKey, {
    from: "Build Malaysia <alerts@buildmalaysia.com>",
    to: [opts.to],
    subject: "Confirm your Build Malaysia alert subscription",
    html: [
      "<p>Thanks for signing up. Click the link below to confirm your subscription.</p>",
      `<p><a href="${opts.confirmUrl}">Confirm subscription</a></p>`,
      "<p>The link expires in 7 days. If you did not request this, ignore this email.</p>",
    ].join(""),
    text: [
      "Thanks for signing up. Visit the link below to confirm your subscription.",
      "",
      opts.confirmUrl,
      "",
      "The link expires in 7 days. If you did not request this, ignore this email.",
    ].join("\n"),
  });
}

export async function upsertContact(opts: { email: string; segmentId: string; apiKey: string }): Promise<ResendResult> {
  const result = await post("/contacts", opts.apiKey, {
    email: opts.email,
    unsubscribed: false,
    segments: [{ id: opts.segmentId }],
  });

  // Resend may return 409 or a "already exists" error for duplicate contacts.
  // Treat that as success: the address is in the list either way.
  if (!result.ok && result.status >= 400 && result.status < 500) {
    if (result.status === 409 || result.body.toLowerCase().includes("already")) {
      return { ok: true };
    }
  }

  return result;
}

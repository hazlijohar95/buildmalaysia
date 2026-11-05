// Resend REST API calls via fetch (no SDK).
// Emails: https://resend.com/docs/api-reference/emails/send-email
// Contacts: https://resend.com/docs/api-reference/contacts/create-contact

const RESEND_BASE = "https://api.resend.com";

export type ResendResult = { ok: true } | { ok: false; status: number; body: string };

const post = (path: string, apiKey: string, body: unknown) => request("POST", path, apiKey, body);

async function request(method: "POST" | "PATCH", path: string, apiKey: string, body?: unknown): Promise<ResendResult> {
  let res: Response;
  try {
    res = await fetch(`${RESEND_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
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

const alreadyDone = (r: ResendResult) =>
  !r.ok && (r.status === 409 || (r.status >= 400 && r.status < 500 && r.body.toLowerCase().includes("already")));

/**
 * Leaves the address subscribed and in the segment whether or not Resend already knows it. A contact that
 * unsubscribed earlier exists already, so creating it fails and it has to be re-subscribed and re-added.
 */
export async function upsertContact(opts: { email: string; segmentId: string; apiKey: string }): Promise<ResendResult> {
  const created = await post("/contacts", opts.apiKey, {
    email: opts.email,
    unsubscribed: false,
    segments: [{ id: opts.segmentId }],
  });
  if (created.ok || !alreadyDone(created)) return created;

  const contact = `/contacts/${encodeURIComponent(opts.email)}`;
  const updated = await request("PATCH", contact, opts.apiKey, { unsubscribed: false });
  if (!updated.ok) return updated;

  const added = await request("POST", `${contact}/segments/${encodeURIComponent(opts.segmentId)}`, opts.apiKey);
  return alreadyDone(added) ? { ok: true } : added;
}

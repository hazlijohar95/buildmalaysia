import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createToken, verifyToken } from "@/lib/subscribe/token";
import { isValidEmail, normalizeEmail } from "@/lib/subscribe/email";

const SECRET = "test-secret-for-subscribe";

// ── Token ────────────────────────────────────────────────────────────────────

describe("token round-trip", () => {
  it("verifies a freshly minted token", async () => {
    const token = await createToken("user@example.com", SECRET);
    const result = await verifyToken(token, SECRET);
    expect(result).toEqual({ ok: true, email: "user@example.com" });
  });

  it("rejects an expired token", async () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 3600 * 1000;
    const token = await createToken("user@example.com", SECRET, eightDaysAgo);
    const result = await verifyToken(token, SECRET);
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a tampered payload", async () => {
    const token = await createToken("user@example.com", SECRET);
    const [payload, sig] = token.split(".");
    const tampered = payload.slice(0, -2) + "XX" + "." + sig;
    const result = await verifyToken(tampered, SECRET);
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects a tampered signature", async () => {
    const token = await createToken("user@example.com", SECRET);
    const tampered = token.slice(0, -4) + "XXXX";
    const result = await verifyToken(tampered, SECRET);
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects a token signed with the wrong secret", async () => {
    const token = await createToken("user@example.com", SECRET);
    const result = await verifyToken(token, "different-secret");
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects a malformed token with no dot", async () => {
    const result = await verifyToken("nodotintoken", SECRET);
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects an empty token", async () => {
    const result = await verifyToken("", SECRET);
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });
});

// ── Email validation ─────────────────────────────────────────────────────────

describe("email validation", () => {
  it("accepts a normal address", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
  });

  it("accepts an address with a subdomain", () => {
    expect(isValidEmail("user@mail.example.co.uk")).toBe(true);
  });

  it("rejects a missing @", () => {
    expect(isValidEmail("notanemail")).toBe(false);
  });

  it("rejects a missing TLD", () => {
    expect(isValidEmail("user@example")).toBe(false);
  });

  it("rejects an address longer than 254 chars", () => {
    const long = "a".repeat(249) + "@b.com"; // 249 + 6 = 255 chars
    expect(long.length).toBeGreaterThan(254);
    expect(isValidEmail(long)).toBe(false);
  });

  it("normalizes to lowercase and strips whitespace", () => {
    expect(normalizeEmail("  USER@Example.COM  ")).toBe("user@example.com");
  });
});

// ── POST /api/subscribe ───────────────────────────────────────────────────────

describe("POST /api/subscribe", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.SUBSCRIBE_SECRET = SECRET;
    delete process.env.RESEND_SEGMENT_ID;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
    delete process.env.SUBSCRIBE_SECRET;
  });

  async function callPost(fields: Record<string, string>, headers?: Record<string, string>) {
    const { POST } = await import("@/app/api/subscribe/route");
    return POST(
      new Request("http://localhost/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
        body: new URLSearchParams(fields).toString(),
      }),
    );
  }

  it("redirects to ?sent=1 on success and calls Resend /emails", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "abc" }), { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    const res = await callPost({ email: "user@example.com", _honey: "" });

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/subscribe?sent=1");
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const reqHeaders = init.headers as Record<string, string>;
    expect(reqHeaders["Authorization"]).toBe("Bearer re_test_key");

    const body = JSON.parse(init.body as string);
    expect(body.to).toEqual(["user@example.com"]);
    expect(body.from).toBe("Build Malaysia <alerts@buildmalaysia.com>");
    expect(body.html).toContain("buildmalaysia.com/subscribe/confirm?token=");
  });

  it("normalizes email before sending", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "abc" }), { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    await callPost({ email: "  User@EXAMPLE.COM  ", _honey: "" });

    const body = JSON.parse((mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.to).toEqual(["user@example.com"]);
  });

  it("redirects to ?error=invalid for a bad email", async () => {
    const res = await callPost({ email: "notanemail", _honey: "" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/subscribe?error=invalid");
  });

  it("redirects to ?sent=1 when honeypot fires, without calling Resend", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const res = await callPost({ email: "user@example.com", _honey: "bot-filled" });
    expect(res.headers.get("location")).toBe("/subscribe?sent=1");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 503 when RESEND_API_KEY is missing", async () => {
    delete process.env.RESEND_API_KEY;
    const res = await callPost({ email: "user@example.com", _honey: "" });
    expect(res.status).toBe(503);
  });

  it("redirects to ?error=retry on a Resend 500", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Internal Server Error", { status: 500 })));
    const res = await callPost({ email: "user@example.com", _honey: "" });
    expect(res.headers.get("location")).toBe("/subscribe?error=retry");
  });
});

// ── POST /api/subscribe/confirm ───────────────────────────────────────────────

describe("POST /api/subscribe/confirm", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.SUBSCRIBE_SECRET = SECRET;
    process.env.RESEND_SEGMENT_ID = "seg_test_123";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
    delete process.env.SUBSCRIBE_SECRET;
    delete process.env.RESEND_SEGMENT_ID;
  });

  async function callConfirm(token: string) {
    const { POST } = await import("@/app/api/subscribe/confirm/route");
    return POST(
      new Request("http://localhost/api/subscribe/confirm", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }).toString(),
      }),
    );
  }

  it("creates a Resend contact and redirects to ?confirmed=1", async () => {
    const token = await createToken("user@example.com", SECRET);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ object: "contact", id: "cid" }), { status: 200 })),
    );

    const res = await callConfirm(token);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/subscribe?confirmed=1");
  });

  it("calls Resend /contacts with correct URL, auth and body", async () => {
    const token = await createToken("user@example.com", SECRET);
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ object: "contact", id: "cid" }), { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    await callConfirm(token);

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/contacts");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer re_test_key");

    const body = JSON.parse(init.body as string);
    expect(body.email).toBe("user@example.com");
    expect(body.unsubscribed).toBe(false);
    expect(body.segments).toEqual([{ id: "seg_test_123" }]);
  });

  it("re-subscribes and re-adds a contact that already exists", async () => {
    const token = await createToken("user@example.com", SECRET);
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "Contact already exists" }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ object: "contact", id: "cid" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "seg_test_123" }), { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    const res = await callConfirm(token);

    expect(res.headers.get("location")).toBe("/subscribe?confirmed=1");
    const calls = (mockFetch.mock.calls as [string, RequestInit][]).map(([url, init]) => [init.method, url, init.body]);
    expect(calls.slice(1)).toEqual([
      ["PATCH", "https://api.resend.com/contacts/user%40example.com", JSON.stringify({ unsubscribed: false })],
      ["POST", "https://api.resend.com/contacts/user%40example.com/segments/seg_test_123", undefined],
    ]);
  });

  it("redirects back to confirm page on an invalid token", async () => {
    const res = await callConfirm("not.a.valid.token");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/subscribe/confirm?token=");
  });

  it("redirects back to confirm page on an expired token", async () => {
    const old = await createToken("user@example.com", SECRET, Date.now() - 8 * 24 * 3600 * 1000);
    const res = await callConfirm(old);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/subscribe/confirm?token=");
  });

  it("redirects to ?error=retry on a Resend failure", async () => {
    const token = await createToken("user@example.com", SECRET);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("fail", { status: 500 })));
    const res = await callConfirm(token);
    expect(res.headers.get("location")).toBe("/subscribe?error=retry");
  });

  it("redirects to ?error=retry when config is missing", async () => {
    delete process.env.RESEND_SEGMENT_ID;
    const token = await createToken("user@example.com", SECRET);
    const res = await callConfirm(token);
    expect(res.headers.get("location")).toBe("/subscribe?error=retry");
  });
});

// Front door for the Astro app.
// It sends every visitor to https://buildmalaysia.com, adds the security headers
// to every response, and caches rendered pages and generated images.
//
// Every page is rendered from the database, but the data only changes when the
// database is reloaded, so a rendered page is cached for an hour in the data
// center that served it. The cache key carries the deployed version, so a new
// deploy never serves HTML that points at the previous build's scripts, and the
// form asked for, so `/2025` as HTML and as Markdown (by `/2025.md` or by
// `Accept: text/markdown`) are two entries and never stand in for each other.
import { handle } from "@astrojs/cloudflare/handler";
import { createScheduledHandler } from "@emdash-cms/cloudflare/worker";
import { withRequestScope } from "@/lib/db";
import { pageRequest } from "@/lib/representation";
import { LOAD_FAILED_MARKER } from "@/lib/route";

const CANONICAL_HOST = "buildmalaysia.com";
const PAGE_TTL_SECONDS = 3600;
const CACHEABLE_TYPES = [
  "text/html",
  "text/markdown",
  "text/plain",
  "text/csv",
  "image/",
  "application/atom+xml",
  "application/pdf",
  "application/zip",
];

const SECURITY_HEADERS: Record<string, string> = {
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "content-security-policy": "frame-ancestors 'none'",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

// Static assets never reach the Worker, so every GET on the canonical host is a page, an image or a download.
// The CMS admin and API are per user, and blog posts change whenever one is published, so neither is cached here.
function isCacheablePageRequest(request: Request, url: URL): boolean {
  if (url.pathname.startsWith("/_emdash/") || /^\/blog(\/|\.md$|$)/.test(url.pathname)) {
    return false;
  }
  return request.method === "GET" && url.hostname === CANONICAL_HOST;
}

// Browsers revalidate every time, so a deploy shows up on the next page load.
// Set on hits too: the cache hands back its own max-age otherwise.
function forBrowser(page: Response, cacheStatus: "HIT" | "MISS"): Response {
  const response = new Response(page.body, page);
  response.headers.set("cache-control", "public, max-age=0, must-revalidate");
  response.headers.set("x-page-cache", cacheStatus);
  return response;
}

async function servePage(request: Request, url: URL, env: Env, ctx: ExecutionContext): Promise<Response> {
  const cache = await caches.open("pages");
  const page = pageRequest(url, request.headers.get("accept"));
  const key = new URL(url);
  // Set, not parsed as a relative URL: a path starting "//" would become the key's host.
  key.pathname = page.pathname;
  // A brand file is the same whatever the query, so a query must not buy a fresh render of a zip or a PNG.
  if (url.pathname.startsWith("/brand/files/") || url.pathname.startsWith("/brand/make/")) key.search = "";
  key.searchParams.set("__version", env.CF_VERSION_METADATA.id);
  key.searchParams.set("__format", page.format);

  const hit = await cache.match(key);
  if (hit) return forBrowser(hit, "HIT");

  const rendered = await handle(request, env, ctx);
  // Pages, generated images, CSV downloads, the brand files, /llms.txt and the feed, which change only on a reload or a deploy.
  const type = rendered.headers.get("content-type") ?? "";
  const cacheable = CACHEABLE_TYPES.some((prefix) => type.startsWith(prefix));
  // A page rendered for a signed-in blog editor carries the editing toolbar and is marked private by EmDash.
  const isPrivate = /\b(private|no-store)\b/.test(rendered.headers.get("cache-control") ?? "");
  if (rendered.status !== 200 || !cacheable || isPrivate || rendered.headers.has("set-cookie")) return rendered;

  const response = forBrowser(rendered, "MISS");

  const stored = response.clone();
  stored.headers.set("cache-control", `public, max-age=0, s-maxage=${PAGE_TTL_SECONDS}`);
  ctx.waitUntil(store(cache, key, stored, type.startsWith("text/html")));
  return response;
}

// A streamed page has sent its 200 before its body loads, so a body that failed is only visible in the HTML.
async function store(cache: Cache, key: URL, page: Response, isHtml: boolean): Promise<void> {
  if (!isHtml) return cache.put(key, page);
  const html = await page.text();
  if (html.includes(LOAD_FAILED_MARKER)) return;
  await cache.put(key, new Response(html, page));
}

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);

  const onCanonicalHttp = url.hostname === CANONICAL_HOST && url.protocol === "http:";
  if (onCanonicalHttp || url.hostname === `www.${CANONICAL_HOST}`) {
    url.protocol = "https:";
    url.hostname = CANONICAL_HOST;
    return Response.redirect(url.toString(), 301);
  }

  if (isCacheablePageRequest(request, url)) return servePage(request, url, env, ctx);
  return handle(request, env, ctx);
}

export default {
  async fetch(request, env, ctx) {
    const routed = await withRequestScope(() => route(request, env, ctx));
    // Copied because redirects and some runtime responses have immutable headers.
    const response = new Response(routed.body, routed);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);
    return response;
  },
  // The blog's scheduled posts, backups and upkeep, on the Cron Trigger in wrangler.jsonc.
  scheduled: createScheduledHandler(),
} satisfies ExportedHandler<Env>;

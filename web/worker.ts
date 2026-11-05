// Front door for the Next app that OpenNext builds into .open-next/worker.js.
//
// Every page is rendered from the database, but the data only changes when the
// database is reloaded, so a rendered page is cached for an hour in the data
// center that served it. The cache key carries the deployed version, so a new
// deploy never serves HTML that points at the previous build's scripts.
import nextApp from "next-app";

const CANONICAL_HOST = "buildmalaysia.com";
const PAGE_TTL_SECONDS = 3600;

declare global {
  interface CloudflareEnv {
    CF_VERSION_METADATA: { id: string };
  }
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

// A full page load: not an asset, and not the RSC payload a client-side navigation asks for.
function isCacheablePageRequest(request: Request, url: URL): boolean {
  return (
    request.method === "GET" &&
    url.hostname === CANONICAL_HOST &&
    !url.pathname.startsWith("/_next/") &&
    !request.headers.has("rsc") &&
    !url.searchParams.has("_rsc")
  );
}

// Browsers revalidate every time, so a deploy shows up on the next page load.
// Set on hits too: the cache hands back its own max-age otherwise.
function forBrowser(page: Response, cacheStatus: "HIT" | "MISS"): Response {
  const response = new Response(page.body, page);
  response.headers.set("cache-control", "public, max-age=0, must-revalidate");
  response.headers.set("x-page-cache", cacheStatus);
  return response;
}

async function servePage(request: Request, url: URL, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response> {
  const cache = await caches.open("pages");
  const key = new URL(url);
  key.searchParams.set("__version", env.CF_VERSION_METADATA.id);

  const hit = await cache.match(key);
  if (hit) return forBrowser(hit, "HIT");

  const rendered = await nextApp.fetch(request, env, ctx);
  const isHtml = rendered.headers.get("content-type")?.startsWith("text/html") ?? false;
  if (rendered.status !== 200 || !isHtml || rendered.headers.has("set-cookie")) return rendered;

  const response = forBrowser(rendered, "MISS");

  const stored = response.clone();
  stored.headers.set("cache-control", `public, max-age=0, s-maxage=${PAGE_TTL_SECONDS}`);
  ctx.waitUntil(cache.put(key, stored));
  return response;
}

const frontDoor = {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.hostname === `www.${CANONICAL_HOST}`) {
      url.hostname = CANONICAL_HOST;
      return Response.redirect(url.toString(), 301);
    }

    if (isCacheablePageRequest(request, url)) return servePage(request, url, env, ctx);
    return nextApp.fetch(request, env, ctx);
  },
};

export default frontDoor;

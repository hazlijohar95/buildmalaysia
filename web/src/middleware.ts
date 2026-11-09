import { defineMiddleware, sequence } from "astro:middleware";
import { NotFoundError, PermanentRedirect } from "@/lib/abort";
import { htmlToMarkdown } from "@/lib/markdown";
import { markdownPath, pageRequest } from "@/lib/representation";
import { LOAD_FAILED_MARKER } from "@/lib/route";

// Serves any page as Markdown, asked for by `/path.md` or by `Accept: text/markdown`: the page is rendered as HTML,
// then converted. worker.ts caches the two forms under separate keys.
const markdown = defineMiddleware(async (context, next) => {
  const page = pageRequest(context.url, context.request.headers.get("accept"));
  const byAddress = page.pathname !== context.url.pathname;
  const target = new URL(page.pathname + context.url.search, context.url);
  const response = byAddress ? await next(target) : await next();
  if (page.format === "html") return varyByAccept(response);

  const type = response.headers.get("content-type") ?? "";
  if (byAddress && response.status >= 300 && response.status < 400) return redirectToMarkdown(response, target);
  // Data files, images and feeds have no Markdown form: by Accept they are served as they are, by address not at all.
  if (!type.startsWith("text/html")) return byAddress ? notFound() : response;

  const canonical = new URL(page.pathname + context.url.search, context.site ?? context.url);
  const html = await response.text();
  const headers = new Headers(response.headers);
  headers.set("content-type", "text/markdown; charset=utf-8");
  headers.set("link", `<${canonical.href}>; rel="canonical"`);
  headers.set("vary", "Accept");
  headers.delete("content-length");
  // A streamed body that failed is an error, not a page; HTML could only mark it, Markdown can say so in its status.
  const status = html.includes(LOAD_FAILED_MARKER) ? 503 : response.status;
  return new Response(htmlToMarkdown(html, canonical), { status, headers });
});

function varyByAccept(response: Response): Response {
  if (!(response.headers.get("content-type") ?? "").startsWith("text/html")) return response;
  const varied = new Response(response.body, response);
  varied.headers.set("vary", "Accept");
  return varied;
}

function redirectToMarkdown(response: Response, from: URL): Response {
  const location = response.headers.get("location");
  if (!location) return response;
  const to = new URL(location, from);
  if (to.origin !== from.origin) return response;
  return new Response(null, { status: response.status, headers: { location: markdownPath(to.pathname) + to.search } });
}

function notFound(): Response {
  return new Response("Not found\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
}

const errors = defineMiddleware(async (context, next) => {
  try {
    return await next();
  } catch (error) {
    if (error instanceof NotFoundError) return context.rewrite("/404");
    if (error instanceof PermanentRedirect) return context.redirect(error.location, 308);
    throw error;
  }
});

export const onRequest = sequence(markdown, errors);

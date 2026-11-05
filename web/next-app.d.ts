// The Next app as a Worker handler. wrangler.jsonc aliases "next-app" to
// .open-next/worker.js, which only exists after `opennextjs-cloudflare build`.
declare module "next-app" {
  const handler: {
    fetch(request: Request, env: CloudflareEnv, ctx: { waitUntil(promise: Promise<unknown>): void }): Promise<Response>;
  };
  export default handler;
}

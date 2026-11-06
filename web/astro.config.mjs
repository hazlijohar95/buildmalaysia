import { fileURLToPath } from "node:url";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://buildmalaysia.com",
  output: "server",
  // /about/ redirects to /about, as it did before, so each page has one address and one cache entry.
  trailingSlash: "never",
  // Pages render from the database per request and worker.ts caches them; nothing needs a session or image transforms.
  session: false,
  adapter: cloudflare({ imageService: "passthrough" }),
  integrations: [react()],
  vite: {
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  },
});

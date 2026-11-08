import { fileURLToPath } from "node:url";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";

export default defineConfig({
  site: "https://buildmalaysia.com",
  output: "server",
  // /about/ redirects to /about, as it did before, so each page has one address and one cache entry.
  trailingSlash: "never",
  // Pages render from the database per request and worker.ts caches them, so nothing needs image transforms.
  // Sessions use the adapter's default KV binding (SESSION); only the blog admin signs anyone in.
  adapter: cloudflare({ imageService: "passthrough" }),
  integrations: [
    react(),
    // The blog's CMS: posts in D1, images in R2, edited at /_emdash/admin. The figures stay in Postgres.
    emdash({
      database: d1({ binding: "DB" }),
      storage: r2({ binding: "MEDIA" }),
      admin: { siteName: "Build Malaysia" },
    }),
  ],
  vite: {
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  },
});

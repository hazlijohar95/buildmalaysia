import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache: pages are rendered per request and cached by worker.ts.
export default defineCloudflareConfig({});

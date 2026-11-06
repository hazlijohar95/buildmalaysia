import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "cloudflare:workers": resolve(__dirname, "src/__tests__/cloudflare-workers.stub.ts"),
    },
  },
});

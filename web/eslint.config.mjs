import astro from "eslint-plugin-astro";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", ".astro/", ".wrangler/", "worker-configuration.d.ts"] },
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    // The two hook rules the Next config enforced; the newer React Compiler rules are not adopted here.
    plugins: { "react-hooks": reactHooks },
    rules: { "react-hooks/rules-of-hooks": "error", "react-hooks/exhaustive-deps": "warn" },
  },
);

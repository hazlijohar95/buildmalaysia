/// <reference types="astro/client" />

/** The Cloudflare Vite plugin compiles a .wasm import at build time. */
declare module "*.wasm" {
  const module: WebAssembly.Module;
  export default module;
}

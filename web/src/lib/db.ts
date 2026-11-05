import postgres from "postgres";
import { cache } from "react";
import { getCloudflareContext } from "@opennextjs/cloudflare";

type Sql = ReturnType<typeof postgres>;

declare global {
  interface CloudflareEnv {
    HYPERDRIVE: { connectionString: string };
  }
  // eslint-disable-next-line no-var
  var __pg: Sql | undefined;
}

const onWorkers = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

// A Worker can't reuse a socket opened by another request, so each request
// opens its own client. Hyperdrive keeps the real connections to the database warm.
const requestClient = cache(
  (): Sql =>
    postgres(getCloudflareContext().env.HYPERDRIVE.connectionString, {
      max: 5,
      fetch_types: false,
      connection: { application_name: "buildmalaysia-web" },
    }),
);

// In Node one pool lives for the process. Dev mode hot-reloads modules, so it
// sits on globalThis to avoid opening a new pool on every reload.
function processClient(): Sql {
  globalThis.__pg ??= postgres(process.env.DATABASE_URL ?? "postgresql:///buildmalaysia", { max: 5 });
  return globalThis.__pg;
}

const client = (): Sql => (onWorkers ? requestClient() : processClient());

// Callers keep writing sql`...`; each use resolves to the right client for where the code runs.
const sql: Sql = new Proxy(postgres({ max: 0 }), {
  apply: (_target, thisArg, args) => Reflect.apply(client(), thisArg, args),
  get: (_target, prop) => Reflect.get(client(), prop),
});

export default sql;

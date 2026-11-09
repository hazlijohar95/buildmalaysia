import { AsyncLocalStorage } from "node:async_hooks";
import { env } from "cloudflare:workers";
import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

/** What one request owns. A Worker can't reuse a socket opened by another request. */
interface RequestScope {
  sql?: Sql;
}

const scope = new AsyncLocalStorage<RequestScope>();

/** Runs a request's handling, including its streamed render, with its own database client and memos. */
export function withRequestScope<T>(handle: () => T): T {
  return scope.run({}, handle);
}

function currentScope(): RequestScope {
  const current = scope.getStore();
  if (!current) throw new Error("The database was used outside withRequestScope.");
  return current;
}

/** Memoizes `load` for the rest of the request: the layout and the page can share one query. */
export function perRequest<T>(load: () => Promise<T>): () => Promise<T> {
  const results = new WeakMap<RequestScope, Promise<T>>();
  return () => {
    const current = currentScope();
    let result = results.get(current);
    if (!result) {
      result = load();
      results.set(current, result);
    }
    return result;
  };
}

/**
 * Keeps a figure that is the same for every reader, such as a base rate over the whole dataset, for `ttlMs` in this
 * isolate, so the pages that quote it do not each recompute it. Pages are cached for an hour (worker.ts), so an hour
 * is no staler than they are. Only a settled value is shared: a Worker request must not await another's pending I/O.
 * A failure is not kept.
 */
export function sharedFor<T>(ttlMs: number, load: () => Promise<T>): () => Promise<T> {
  let kept: { value: T; at: number } | null = null;
  return async () => {
    if (kept && Date.now() - kept.at < ttlMs) return kept.value;
    const value = await load();
    kept = { value, at: Date.now() };
    return value;
  };
}

// Opened on first use, so cached pages and assets never touch the database. Hyperdrive keeps the real connections warm.
function client(): Sql {
  const current = currentScope();
  current.sql ??= postgres(env.HYPERDRIVE.connectionString, {
    max: 5,
    fetch_types: false,
    connection: { application_name: "buildmalaysia-web" },
  });
  return current.sql;
}

// Callers keep writing sql`...`; each use resolves to the current request's client.
const sql: Sql = new Proxy(postgres({ max: 0 }), {
  apply: (_target, thisArg, args) => Reflect.apply(client(), thisArg, args),
  get: (_target, prop) => Reflect.get(client(), prop),
});

export default sql;

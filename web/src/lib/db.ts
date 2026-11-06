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

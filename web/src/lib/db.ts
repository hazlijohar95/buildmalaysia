import postgres from "postgres";

const url = process.env.DATABASE_URL ?? "postgresql:///buildmalaysia_web";

// One connection pool for the process lifetime. Next.js dev mode hot-reloads
// modules, so we stash the client on globalThis to avoid exhausting connections.
declare global {
  // eslint-disable-next-line no-var
  var __pg: ReturnType<typeof postgres> | undefined;
}

const sql = globalThis.__pg ?? postgres(url, { max: 5 });
if (process.env.NODE_ENV !== "production") globalThis.__pg = sql;

export default sql;

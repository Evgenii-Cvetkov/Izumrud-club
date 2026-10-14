import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL не задан — см. .env.example");

// Один пул на процесс, переживает hot reload в dev.
const globalForDb = globalThis as unknown as { __izumrudSql?: ReturnType<typeof postgres> };
export const sql = globalForDb.__izumrudSql ?? postgres(url, { max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.__izumrudSql = sql;

export const db = drizzle(sql, { schema });
export { schema };

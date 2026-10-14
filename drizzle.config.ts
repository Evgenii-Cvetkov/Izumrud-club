import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://postgres@localhost:5432/izumrud" },
  // Таблицы Directus (directus_*) создаёт и ведёт сам Directus — миграции их не трогают.
  tablesFilter: ["!directus_*"],
});

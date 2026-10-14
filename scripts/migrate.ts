/** Применяет миграции из папки drizzle/. Запуск: npm run db:migrate */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL не задан");
  const sql = postgres(url, { max: 1 });
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  await sql.end();
  console.log("Миграции применены");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

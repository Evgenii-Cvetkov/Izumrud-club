/**
 * Фоновые задачи клуба. Запуск: npm run worker (по кругу) или npm run worker:once (один проход).
 *  - напоминание о списании за 3 дня;
 *  - автосписание в момент окончания периода и повторы через 24 и 48 часов;
 *  - закрытие доступа после отмены, неудачных повторов;
 *  - проверка платежей, зависших в pending;
 *  - уведомления о новых лекциях и статьях.
 * Несколько копий воркера безопасны: проход выполняется под advisory-lock Postgres.
 */
import { existsSync } from "node:fs";
if (existsSync(".env") && typeof process.loadEnvFile === "function") process.loadEnvFile(".env");

const LOCK_ID = 7_310_001;
const INTERVAL_MIN = Number(process.env.WORKER_INTERVAL_MIN ?? 5);

async function main() {
  const { runOnce } = await import("./jobs");
  const { sql } = await import("@/db");
  const once = process.argv.includes("--once");

  const tick = async () => {
    // Блокировка живёт на соединении, поэтому берём и отпускаем её на одном выделенном соединении.
    const conn = await sql.reserve();
    try {
      const [{ locked }] = await conn<{ locked: boolean }[]>`select pg_try_advisory_lock(${LOCK_ID}) as locked`;
      if (!locked) {
        console.log("[worker] другой воркер уже выполняет проход");
        return;
      }
      try {
        const report = await runOnce(new Date());
        console.log(`[worker] ${new Date().toISOString()}`, JSON.stringify(report));
      } catch (e) {
        console.error("[worker] проход упал", e);
      } finally {
        await conn`select pg_advisory_unlock(${LOCK_ID})`;
      }
    } finally {
      conn.release();
    }
  };

  await tick();
  if (once) {
    await sql.end();
    return;
  }
  setInterval(tick, INTERVAL_MIN * 60 * 1000);
  console.log(`[worker] запущен, проход каждые ${INTERVAL_MIN} мин`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

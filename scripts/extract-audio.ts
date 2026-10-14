/**
 * Делает аудиоверсию лекции из видеофайла и регистрирует её как файл.
 *   npm run audio:extract -- <видеофайл> <slug лекции>
 * Результат: AAC 96 кбит/с моно в STORAGE_LOCAL_DIR/audio/<slug>.m4a, лекция получает audio_file.
 * Для S3 загрузите получившийся файл в бакет по тому же ключу (audio/<slug>.m4a).
 */
import { existsSync, mkdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
if (existsSync(".env") && typeof process.loadEnvFile === "function") process.loadEnvFile(".env");

async function main() {
  const [input, slug] = process.argv.slice(2);
  if (!input || !slug) {
    console.error("Использование: npm run audio:extract -- <видеофайл> <slug лекции>");
    process.exit(1);
  }
  const { db, schema, sql } = await import("@/db");
  const { eq } = await import("drizzle-orm");

  const lecture = await db.query.lectures.findFirst({ where: eq(schema.lectures.slug, slug) });
  if (!lecture) throw new Error(`Лекция ${slug} не найдена`);

  const root = path.resolve(process.env.STORAGE_LOCAL_DIR ?? "./storage");
  const key = `audio/${slug}.m4a`;
  mkdirSync(path.join(root, "audio"), { recursive: true });
  console.log("Извлекаем аудио…");
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", input, "-vn", "-ac", "1", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", path.join(root, key)], { stdio: "inherit" });

  const duration = Number(
    execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path.join(root, key)], { encoding: "utf8" }).trim(),
  );
  const [file] = await db
    .insert(schema.mediaFiles)
    .values({ filenameDisk: key, type: "audio/mp4", title: `${lecture.title} (аудио)`, filesize: statSync(path.join(root, key)).size })
    .returning();
  await db
    .update(schema.lectures)
    .set({ audioFile: file.id, durationSec: lecture.durationSec ?? Math.round(duration) })
    .where(eq(schema.lectures.id, lecture.id));
  console.log(`Готово: ${key}, ${Math.round(duration / 60)} мин`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

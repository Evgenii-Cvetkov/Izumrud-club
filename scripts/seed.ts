/**
 * Демо-наполнение: темы, лекции, статьи, альбомы с фото, аудиофайл.
 * Запуск: npm run db:seed        — добавить, если контента ещё нет
 *         npm run db:seed -- --reset  — удалить весь контент и заполнить заново
 * Файлы создаются в STORAGE_LOCAL_DIR/seed (нужны ffmpeg и python3 c Pillow для генерации).
 */
import { existsSync, mkdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
if (existsSync(".env") && typeof process.loadEnvFile === "function") process.loadEnvFile(".env");

const DAY = 24 * 3600 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

async function main() {
  const { db, schema, sql } = await import("@/db");
  const reset = process.argv.includes("--reset");

  if (reset) {
    await db.delete(schema.photos);
    await db.delete(schema.albums);
    await db.delete(schema.articles);
    await db.delete(schema.progress);
    await db.delete(schema.lectures);
    await db.delete(schema.topics);
    await db.delete(schema.mediaFiles);
  } else if ((await db.select().from(schema.topics).limit(1)).length) {
    console.log("Контент уже есть. Для пересоздания: npm run db:seed -- --reset");
    await sql.end();
    return;
  }

  const root = path.resolve(process.env.STORAGE_LOCAL_DIR ?? "./storage");
  const dir = path.join(root, "seed");
  mkdirSync(dir, { recursive: true });

  const addFile = async (key: string, type: string, title: string) => {
    const full = path.join(root, key);
    const [row] = await db
      .insert(schema.mediaFiles)
      .values({ filenameDisk: key, type, title, filesize: existsSync(full) ? statSync(full).size : null })
      .returning({ id: schema.mediaFiles.id });
    return row.id;
  };

  // Аудио-заглушка: 3 минуты тихого тона. В реальности — аудиодорожка лекции (npm run audio:extract).
  const audioKey = "seed/demo-lecture.mp3";
  if (!existsSync(path.join(root, audioKey))) {
    try {
      execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=180", "-af", "volume=0.08", "-ac", "1", "-b:a", "64k", path.join(root, audioKey)]);
    } catch {
      console.warn("ffmpeg не найден — аудио-заглушка не создана");
    }
  }
  const audioId = existsSync(path.join(root, audioKey)) ? await addFile(audioKey, "audio/mpeg", "Демо-аудио") : null;

  // Фото-заглушки для альбомов.
  const photoKeys: string[] = [];
  try {
    const out = execFileSync("python3", [path.resolve("scripts/make-photos.py"), dir, "10"], { encoding: "utf8" });
    photoKeys.push(...out.trim().split("\n").filter(Boolean).map((f) => `seed/${f}`));
  } catch {
    console.warn("python3 с Pillow не найден — фото-заглушки не созданы");
  }
  const photoIds: string[] = [];
  for (const k of photoKeys) photoIds.push(await addFile(k, "image/webp", path.basename(k)));

  const topics = await db
    .insert(schema.topics)
    .values([
      { name: "Аргументация", slug: "argumentation", sort: 1 },
      { name: "Решения", slug: "decisions", sort: 2 },
      { name: "Когнитивные искажения", slug: "biases", sort: 3 },
      { name: "Философия науки", slug: "science", sort: 4 },
    ])
    .returning();
  const t = Object.fromEntries(topics.map((x) => [x.slug, x.id]));

  const lectureData = [
    { slug: "kak-otlichit-argument-ot-mneniya", title: "Как отличить аргумент от мнения", speaker: "Анна Соколова", topic: "argumentation", days: 3, dur: 4920, audio: true,
      description: "Разбираем, из чего состоит аргумент: посылки, вывод и связь между ними. На примерах из новостей учимся находить скрытые допущения и отличать довод от громкого утверждения." },
    { slug: "oshibka-vyzhivshego", title: "Ошибка выжившего и другие ловушки выборки", speaker: "Михаил Орлов", topic: "biases", days: 10, dur: 5400, audio: true,
      description: "Почему истории успеха плохо учат успеху. Смотрим на данные, которые мы не видим, и на то, как отбор искажает выводы." },
    { slug: "reshenia-v-neopredelennosti", title: "Решения в условиях неопределённости", speaker: "Елена Ким", topic: "decisions", days: 17, dur: 6000, audio: false,
      description: "Ожидаемая ценность, предварительное вскрытие проекта и правило обратимых решений: инструменты, которые работают без точных цифр." },
    { slug: "falsifitsiruemost", title: "Фальсифицируемость: что делает теорию научной", speaker: "Пётр Белов", topic: "science", days: 24, dur: 4500, audio: true,
      description: "Поппер, критерий демаркации и почему хорошая теория должна запрещать какие-то наблюдения." },
    { slug: "steelman", title: "Стальной человек вместо соломенного чучела", speaker: "Анна Соколова", topic: "argumentation", days: 31, dur: 3900, audio: true,
      description: "Как спорить честно: формулируем позицию оппонента в самой сильной версии и только потом возражаем." },
    { slug: "yakorenie", title: "Эффект якоря в переговорах и оценках", speaker: "Михаил Орлов", topic: "biases", days: 38, dur: 4200, audio: false,
      description: "Первая названная цифра тянет за собой все следующие. Разбираем эксперименты и способы защититься." },
    { slug: "bayes-dlya-zhizni", title: "Байесовское мышление без формул", speaker: "Елена Ким", topic: "decisions", days: 45, dur: 5100, audio: true,
      description: "Как обновлять уверенность, когда появляются новые факты, и почему базовая частота важнее яркого случая." },
  ];
  const lectures = await db
    .insert(schema.lectures)
    .values(
      lectureData.map((l) => ({
        slug: l.slug,
        title: l.title,
        speaker: l.speaker,
        description: l.description,
        topicId: t[l.topic],
        videoId: "demo",
        audioFile: l.audio ? audioId : null,
        durationSec: l.dur,
        status: "published" as const,
        publishedAt: ago(l.days),
        notifiedAt: ago(l.days),
      })),
    )
    .returning();
  const lec = Object.fromEntries(lectures.map((x) => [x.slug, x.id]));

  await db.insert(schema.articles).values([
    {
      slug: "konspekt-argument-i-mnenie",
      title: "Конспект: как отличить аргумент от мнения",
      excerpt: "Пять вопросов, которые стоит задать любому утверждению, прежде чем соглашаться или спорить.",
      topicId: t.argumentation,
      lectureId: lec["kak-otlichit-argument-ot-mneniya"],
      readingMinutes: 6,
      body: `<p>Аргумент — это не громкость и не уверенность. Это вывод, к которому ведут посылки, и связь между ними, которую можно проверить.</p>
<h2>Пять вопросов к утверждению</h2>
<ol><li>Что именно утверждается? Сформулируйте одним предложением.</li><li>На чём это основано? Найдите посылки.</li><li>Что должно быть правдой, чтобы вывод следовал? Это скрытые допущения.</li><li>Что бы убедило автора в обратном?</li><li>Как выглядит сильнейшее возражение?</li></ol>
<blockquote>Если на четвёртый вопрос ответа нет, перед вами скорее позиция, чем аргумент.</blockquote>
<h2>Что почитать</h2>
<ul><li>Э. Уэстон, «Аргументация: краткий учебник»</li><li>Д. Канеман, «Думай медленно… решай быстро»</li></ul>`,
      status: "published",
      publishedAt: ago(2),
      notifiedAt: ago(2),
    },
    {
      slug: "spisok-iskazheniy",
      title: "Шпаргалка по когнитивным искажениям",
      excerpt: "Двенадцать искажений, которые чаще всего мешают нам в работе и спорах, — с примерами из встреч клуба.",
      topicId: t.biases,
      lectureId: lec["oshibka-vyzhivshego"],
      readingMinutes: 9,
      body: `<p>Искажение — не глупость, а систематическая ошибка, которую делают все. Полезно знать их в лицо.</p><h2>Ошибка выжившего</h2><p>Мы видим только тех, кто дошёл до конца, и делаем выводы по ним.</p><h2>Эффект якоря</h2><p>Первая цифра задаёт рамку для всех следующих оценок.</p><h2>Предвзятость подтверждения</h2><p>Мы ищем факты, которые подтверждают уже принятое мнение.</p>`,
      status: "published",
      publishedAt: ago(9),
      notifiedAt: ago(9),
    },
    {
      slug: "pre-mortem",
      title: "Предварительное вскрытие: как провести за 30 минут",
      excerpt: "Пошаговый сценарий для команды: представляем, что проект провалился, и ищем причины заранее.",
      topicId: t.decisions,
      lectureId: lec["reshenia-v-neopredelennosti"],
      readingMinutes: 5,
      body: `<p>Методика Гэри Клейна. Работает лучше обычного обсуждения рисков, потому что снимает социальный запрет на пессимизм.</p><ol><li>Представьте: прошёл год, проект провалился.</li><li>Каждый молча пишет причины — 5 минут.</li><li>По кругу зачитываем по одной причине.</li><li>Выбираем три главные и решаем, что делаем сейчас.</li></ol>`,
      status: "published",
      publishedAt: ago(16),
      notifiedAt: ago(16),
    },
  ]);

  const albumData = [
    { title: "Встреча: аргумент или мнение", days: 3 },
    { title: "Встреча: ошибка выжившего", days: 10 },
    { title: "Встреча: решения без точных цифр", days: 17 },
  ];
  for (const [i, a] of albumData.entries()) {
    const date = ago(a.days).toISOString().slice(0, 10);
    // У каждого альбома свой набор: сдвигаем список фото на 3 позиции.
    const ids = [...photoIds.slice(i * 3), ...photoIds.slice(0, i * 3)].slice(0, 8);
    const [album] = await db
      .insert(schema.albums)
      .values({ title: a.title, eventDate: date, coverFile: ids[0] ?? null, status: "published", publishedAt: ago(a.days) })
      .returning();
    if (ids.length) await db.insert(schema.photos).values(ids.map((file, sort) => ({ albumId: album.id, file, sort })));
  }

  console.log(`Готово: ${lectures.length} лекций, 3 статьи, ${albumData.length} альбома, ${photoIds.length} фото`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

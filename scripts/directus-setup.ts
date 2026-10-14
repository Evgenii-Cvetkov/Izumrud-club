/**
 * Настройка админки Directus поверх таблиц клуба. Запускать один раз после первого старта Directus
 * (повторный запуск безопасен):
 *   npm run directus:setup
 * Нужны DIRECTUS_URL, DIRECTUS_ADMIN_EMAIL, DIRECTUS_ADMIN_PASSWORD и DATABASE_URL.
 *
 * Что делает:
 *  1. переносит файлы из media_files (сиды, скрипты) в directus_files, чтобы на них ссылались поля файлов;
 *  2. включает коллекции контента и участников, задаёт названия, иконки и порядок полей;
 *  3. настраивает поля: файлы, связи, статус, дата публикации, редактор текста статьи;
 *  4. создаёт роль «Редактор» с доступом только к контенту.
 */
import { existsSync } from "node:fs";
if (existsSync(".env") && typeof process.loadEnvFile === "function") process.loadEnvFile(".env");

const URL_ = (process.env.DIRECTUS_URL ?? "http://localhost:8055").replace(/\/$/, "");
let token = "";

async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(URL_ + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const msg = data?.errors?.[0]?.message ?? res.statusText;
    throw Object.assign(new Error(`${method} ${path}: ${msg}`), { status: res.status });
  }
  return data.data as T;
}

const COLLECTIONS: Record<string, { icon: string; note: string; template: string; sort?: string; group?: string }> = {
  lectures: { icon: "school", note: "Лекции: видео (ID из Kinescope), аудио, обложка", template: "{{title}}" },
  articles: { icon: "article", note: "Статьи и конспекты", template: "{{title}}" },
  albums: { icon: "photo_library", note: "Фотоальбомы встреч", template: "{{title}}" },
  photos: { icon: "photo", note: "Фото внутри альбомов", template: "{{caption}}", sort: "sort" },
  topics: { icon: "label", note: "Темы для фильтров", template: "{{name}}", sort: "sort" },
  users: { icon: "group", note: "Участники сайта (только просмотр)", template: "{{email}}" },
  subscriptions: { icon: "card_membership", note: "Подписки участников", template: "{{status}}" },
  payments: { icon: "payments", note: "Платежи ЮKassa (только просмотр)", template: "{{amount_rub}} ₽ {{status}}" },
  payment_methods: { icon: "credit_card", note: "Сохранённые способы оплаты", template: "{{title}}" },
  consents: { icon: "gavel", note: "Журнал согласий", template: "{{type}}" },
  media_files: { icon: "folder", note: "Служебная: файлы, загруженные скриптами", template: "{{filename_disk}}" },
};

const STATUS_CHOICES = [
  { text: "Черновик", value: "draft" },
  { text: "Опубликовано", value: "published" },
];

type FieldMeta = Record<string, unknown>;

/** Русские названия коллекций и полей в админке. */
const COLLECTION_LABELS: Record<string, string> = {
  lectures: "Лекции", articles: "Статьи", albums: "Встречи (фото)", photos: "Фото", topics: "Темы",
  users: "Участники", subscriptions: "Подписки", payments: "Платежи", payment_methods: "Способы оплаты",
  consents: "Согласия", media_files: "Файлы скриптов",
};
const FIELD_LABELS: Record<string, string> = {
  title: "Название", slug: "Адрес страницы", status: "Статус", published_at: "Дата публикации", speaker: "Ведущий",
  topic_id: "Тема", description: "Описание", video_id: "ID видео", duration_sec: "Длительность, сек",
  audio_file: "Аудио", cover_file: "Обложка", notified_at: "Уведомление отправлено", reading_minutes: "Минут чтения",
  lecture_id: "Лекция", excerpt: "Анонс", body: "Текст", event_date: "Дата встречи", album_id: "Альбом",
  file: "Фото", caption: "Подпись", photos: "Фото", name: "Название",
};
const ru = (translation: string) => [{ language: "ru-RU", translation }];
const FIELDS: Record<string, Record<string, FieldMeta>> = {
  lectures: {
    title: { interface: "input", required: true, width: "full" },
    slug: { interface: "input", required: true, width: "half", note: "Адрес страницы латиницей: kak-dumat-yasnee" },
    status: { interface: "select-dropdown", options: { choices: STATUS_CHOICES }, width: "half", display: "labels" },
    published_at: { interface: "datetime", width: "half", note: "С этой даты лекция видна участникам; в эту дату уйдёт уведомление" },
    speaker: { interface: "input", width: "half" },
    topic_id: { interface: "select-dropdown-m2o", special: ["m2o"], options: { template: "{{name}}" }, width: "half" },
    description: { interface: "input-multiline", width: "full" },
    video_id: { interface: "input", width: "half", note: "ID видео в Kinescope" },
    duration_sec: { interface: "input", width: "half", note: "Длительность в секундах (5400 = 1,5 часа)" },
    audio_file: { interface: "file", special: ["file"], width: "half", note: "Аудиоверсия: m4a или mp3" },
    cover_file: { interface: "file-image", special: ["file"], width: "half", note: "Обложка 16:10" },
    notified_at: { interface: "datetime", readonly: true, width: "half", note: "Когда участникам ушло уведомление" },
    created_at: { hidden: true },
  },
  articles: {
    title: { interface: "input", required: true, width: "full" },
    slug: { interface: "input", required: true, width: "half" },
    status: { interface: "select-dropdown", options: { choices: STATUS_CHOICES }, width: "half", display: "labels" },
    published_at: { interface: "datetime", width: "half" },
    reading_minutes: { interface: "input", width: "half", note: "Минут чтения" },
    topic_id: { interface: "select-dropdown-m2o", special: ["m2o"], options: { template: "{{name}}" }, width: "half" },
    lecture_id: { interface: "select-dropdown-m2o", special: ["m2o"], options: { template: "{{title}}" }, width: "half", note: "Лекция, к которой статья" },
    excerpt: { interface: "input-multiline", width: "full", note: "Анонс: виден и тем, у кого нет членства" },
    body: { interface: "input-rich-text-html", width: "full" },
    cover_file: { interface: "file-image", special: ["file"], width: "half" },
    notified_at: { interface: "datetime", readonly: true, width: "half" },
    created_at: { hidden: true },
  },
  albums: {
    title: { interface: "input", required: true, width: "full" },
    event_date: { interface: "datetime", width: "half", note: "Дата встречи" },
    status: { interface: "select-dropdown", options: { choices: STATUS_CHOICES }, width: "half", display: "labels" },
    published_at: { interface: "datetime", width: "half" },
    cover_file: { interface: "file-image", special: ["file"], width: "half" },
    description: { interface: "input-multiline", width: "full" },
    created_at: { hidden: true },
  },
  photos: {
    album_id: { interface: "select-dropdown-m2o", special: ["m2o"], options: { template: "{{title}}" }, width: "half" },
    file: { interface: "file-image", special: ["file"], width: "half", required: true },
    caption: { interface: "input", width: "full" },
    sort: { hidden: true },
  },
  topics: { sort: { hidden: true } },
};

/** Файловые поля → directus_files. on_delete: при удалении файла поле очищается (у фото — строка удаляется). */
const FILE_RELATIONS: [string, string, "SET NULL" | "CASCADE"][] = [
  ["lectures", "audio_file", "SET NULL"],
  ["lectures", "cover_file", "SET NULL"],
  ["articles", "cover_file", "SET NULL"],
  ["albums", "cover_file", "SET NULL"],
  ["photos", "file", "CASCADE"],
];

/** Связи между таблицами уже есть в базе (внешние ключи); здесь — только метаданные для Directus. */
const M2O: [string, string, string, string | null][] = [
  ["lectures", "topic_id", "topics", null],
  ["articles", "topic_id", "topics", null],
  ["articles", "lecture_id", "lectures", null],
  ["photos", "album_id", "albums", "photos"],
];

const CONTENT = ["topics", "lectures", "articles", "albums", "photos", "directus_files", "directus_folders"];

async function copyMediaFiles() {
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  const n = await sql`
    insert into directus_files (id, storage, filename_disk, filename_download, title, type, filesize, uploaded_on)
    select m.id, 'local', m.filename_disk, regexp_replace(m.filename_disk, '^.*/', ''), m.title, m.type, m.filesize, m.created_at
    from media_files m
    where not exists (select 1 from directus_files f where f.id = m.id)`;
  await sql.end();
  console.log(`Файлы: перенесено в directus_files ${n.count}`);
}

async function upsertRelationMeta() {
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  for (const [collection, field, related, oneField] of M2O) {
    const [row] = await sql`select id from directus_relations where many_collection = ${collection} and many_field = ${field}`;
    if (row) {
      await sql`update directus_relations set one_collection = ${related}, one_field = ${oneField} where id = ${row.id}`;
    } else {
      await sql`insert into directus_relations (many_collection, many_field, one_collection, one_field, one_deselect_action)
                values (${collection}, ${field}, ${related}, ${oneField}, 'nullify')`;
    }
  }
  await sql.end();
}

async function main() {
  const auth = await api<{ access_token: string }>("POST", "/auth/login", {
    email: process.env.DIRECTUS_ADMIN_EMAIL,
    password: process.env.DIRECTUS_ADMIN_PASSWORD,
  });
  token = auth.access_token;

  await copyMediaFiles();

  for (const [collection, c] of Object.entries(COLLECTIONS)) {
    await api("PATCH", `/collections/${collection}`, {
      meta: {
        icon: c.icon,
        note: c.note,
        display_template: c.template,
        sort_field: c.sort ?? null,
        translations: COLLECTION_LABELS[collection] ? ru(COLLECTION_LABELS[collection]) : null,
      },
    });
  }
  console.log("Коллекции настроены");

  const existing = await api<{ collection: string; field: string }[]>("GET", "/relations");
  const has = (c: string, f: string) => existing.some((r) => r.collection === c && r.field === f);

  for (const [collection, field, onDelete] of FILE_RELATIONS) {
    if (!has(collection, field)) {
      await api("POST", "/relations", { collection, field, related_collection: "directus_files", schema: { on_delete: onDelete } });
    }
  }
  // Метаданные связей между таблицами клуба пишем напрямую: внешние ключи уже есть, а
  // PATCH /relations для таких связей роняет Directus 11 (ошибка в RelationsService.alterType).
  await upsertRelationMeta();
  await api("POST", "/utils/cache/clear");
  // Фото редактируются прямо внутри альбома.
  const albumFields = await api<{ field: string }[]>("GET", "/fields/albums");
  if (!albumFields.some((f) => f.field === "photos")) {
    await api("POST", "/fields/albums", {
      field: "photos",
      type: "alias",
      meta: { special: ["o2m"], interface: "list-o2m", options: { template: "{{file.$thumbnail}} {{caption}}", enableLink: true }, note: "Фото встречи" },
    });
  }
  console.log("Связи настроены");

  for (const [collection, fields] of Object.entries(FIELDS)) {
    let sort = 1;
    for (const [field, meta] of Object.entries(fields)) {
      const translations = FIELD_LABELS[field] ? ru(FIELD_LABELS[field]) : null;
      await api("PATCH", `/fields/${collection}/${field}`, { meta: { ...meta, translations, sort: sort++ } });
    }
  }
  if (!FIELDS.topics.name) await api("PATCH", "/fields/topics/name", { meta: { translations: ru("Название") } });
  // Админка на русском для всех пользователей.
  await api("PATCH", "/settings", { default_language: "ru-RU", project_name: "Клуб «Изумруд»", project_color: "#0B6E4F" });
  console.log("Поля настроены");

  // Роль «Редактор»: может вести контент, не видит участников и платежи.
  const policies = await api<{ id: string; name: string }[]>("GET", "/policies?limit=-1");
  let policy = policies.find((p) => p.name === "Редактор контента");
  if (!policy) {
    policy = await api<{ id: string; name: string }>("POST", "/policies", {
      name: "Редактор контента",
      icon: "edit_note",
      app_access: true,
      admin_access: false,
      description: "Лекции, статьи, альбомы, темы и файлы",
    });
    for (const collection of CONTENT) {
      for (const action of ["create", "read", "update", "delete"]) {
        await api("POST", "/permissions", { policy: policy.id, collection, action, fields: ["*"], permissions: {}, validation: {} });
      }
    }
  }
  const roles = await api<{ id: string; name: string }[]>("GET", "/roles?limit=-1");
  if (!roles.some((r) => r.name === "Редактор")) {
    await api("POST", "/roles", { name: "Редактор", icon: "edit_note", policies: [{ policy: policy.id }] });
  }
  console.log("Роль «Редактор» создана. Пригласите редактора в Directus: Пользователи → Создать, роль «Редактор»");
  console.log("Готово");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

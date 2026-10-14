import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  serial,
  date,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });

// ─── Пользователи и вход ─────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  role: text("role", { enum: ["member", "admin"] }).notNull().default("member"),
  notifyEmail: boolean("notify_email").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
  deletedAt: ts("deleted_at"),
});

export const authCodes = pgTable(
  "auth_codes",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    ip: text("ip"),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("auth_codes_email_idx").on(t.email), index("auth_codes_ip_idx").on(t.ip)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    deviceLabel: text("device_label"),
    ip: text("ip"),
    createdAt: ts("created_at").notNull().defaultNow(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Журнал согласий: обработка ПДн, оферта, автосписание (152-ФЗ, 376-ФЗ). */
export const consents = pgTable(
  "consents",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["pdn", "offer", "autopay"] }).notNull(),
    textVersion: text("text_version").notNull(),
    givenAt: ts("given_at").notNull().defaultNow(),
    revokedAt: ts("revoked_at"),
    ip: text("ip"),
  },
  (t) => [index("consents_user_idx").on(t.userId)],
);

// ─── Подписка и платежи ──────────────────────────────────────────────

export const SUBSCRIPTION_STATUSES = ["pending", "active", "past_due", "cancelled", "expired"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const paymentMethods = pgTable("payment_methods", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** ID сохранённого способа оплаты в ЮKassa. Удалить его в ЮKassa нельзя — отключаем у себя. */
  yookassaId: text("yookassa_id").notNull().unique(),
  title: text("title").notNull(),
  type: text("type").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
  deactivatedAt: ts("deactivated_at"),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: SUBSCRIPTION_STATUSES }).notNull().default("pending"),
    periodStart: ts("period_start"),
    periodEnd: ts("period_end"),
    /** До какого момента сохраняется доступ при статусе past_due. */
    graceUntil: ts("grace_until"),
    autopayEnabled: boolean("autopay_enabled").notNull().default(false),
    paymentMethodId: uuid("payment_method_id").references(() => paymentMethods.id, { onDelete: "set null" }),
    retryCount: integer("retry_count").notNull().default(0),
    nextAttemptAt: ts("next_attempt_at"),
    /** period_end, для которого уже отправлено напоминание о списании. */
    reminderSentFor: ts("reminder_sent_for"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("subscriptions_status_idx").on(t.status, t.periodEnd)],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
    /** Уникальность — защита от повторной обработки одного вебхука. */
    yookassaId: text("yookassa_id").unique(),
    idempotenceKey: text("idempotence_key").notNull().unique(),
    amountRub: integer("amount_rub").notNull(),
    status: text("status", { enum: ["pending", "succeeded", "canceled", "refunded"] })
      .notNull()
      .default("pending"),
    kind: text("kind", { enum: ["first", "renewal"] }).notNull(),
    /** Первый платёж: участник дал согласие на автосписание и карту нужно сохранить. */
    autopayRequested: boolean("autopay_requested").notNull().default(false),
    /** Для продления: конец периода, который этот платёж продлевает. */
    renewsPeriodEnd: ts("renews_period_end"),
    failureReason: text("failure_reason"),
    refundedRub: integer("refunded_rub").notNull().default(0),
    /** Результат уже применён к подписке (идемпотентность). */
    appliedAt: ts("applied_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("payments_user_idx").on(t.userId)],
);

// ─── Файлы ───────────────────────────────────────────────────────────

/**
 * Файлы, загруженные не через Directus (сиды, скрипты). Поля *_file в контенте
 * хранят UUID файла: сначала ищем его в directus_files, затем здесь.
 */
export const mediaFiles = pgTable("media_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  filenameDisk: text("filename_disk").notNull(),
  type: text("type"),
  filesize: integer("filesize"),
  title: text("title"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

// ─── Контент ─────────────────────────────────────────────────────────

const status = () => text("status", { enum: ["draft", "published"] }).notNull().default("draft");

export const topics = pgTable("topics", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  sort: integer("sort").notNull().default(0),
});

export const lectures = pgTable(
  "lectures",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    description: text("description"),
    speaker: text("speaker"),
    topicId: integer("topic_id").references(() => topics.id, { onDelete: "set null" }),
    /** ID видео в видеохостинге (Kinescope). */
    videoId: text("video_id"),
    audioFile: uuid("audio_file"),
    coverFile: uuid("cover_file"),
    durationSec: integer("duration_sec"),
    status: status(),
    publishedAt: ts("published_at"),
    notifiedAt: ts("notified_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("lectures_published_idx").on(t.status, t.publishedAt)],
);

export const articles = pgTable("articles", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  excerpt: text("excerpt"),
  /** HTML из редактора Directus. Пишут только администраторы. */
  body: text("body").notNull().default(""),
  coverFile: uuid("cover_file"),
  topicId: integer("topic_id").references(() => topics.id, { onDelete: "set null" }),
  lectureId: integer("lecture_id").references(() => lectures.id, { onDelete: "set null" }),
  readingMinutes: integer("reading_minutes"),
  status: status(),
  publishedAt: ts("published_at"),
  notifiedAt: ts("notified_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const albums = pgTable("albums", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  eventDate: date("event_date"),
  coverFile: uuid("cover_file"),
  status: status(),
  publishedAt: ts("published_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const photos = pgTable(
  "photos",
  {
    id: serial("id").primaryKey(),
    albumId: integer("album_id")
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    file: uuid("file").notNull(),
    caption: text("caption"),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("photos_album_idx").on(t.albumId, t.sort)],
);

export const progress = pgTable(
  "progress",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lectureId: integer("lecture_id")
      .notNull()
      .references(() => lectures.id, { onDelete: "cascade" }),
    positionSec: integer("position_sec").notNull().default(0),
    completed: boolean("completed").notNull().default(false),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.lectureId] })],
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("push_endpoint_idx").on(t.endpoint)],
);

export type User = typeof users.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Lecture = typeof lectures.$inferSelect;
export type Article = typeof articles.$inferSelect;
export type Album = typeof albums.$inferSelect;

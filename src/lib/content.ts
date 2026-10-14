/** Чтение контента для страниц и API. Видны только опубликованные материалы с наступившей датой. */
import { and, asc, desc, eq, ilike, inArray, isNotNull, lte, or, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { signFiles, TTL } from "./storage";

const PAGE_SIZE = 24;

const lectureVisible = () =>
  and(eq(schema.lectures.status, "published"), lte(schema.lectures.publishedAt, new Date()));
const articleVisible = () =>
  and(eq(schema.articles.status, "published"), lte(schema.articles.publishedAt, new Date()));
const albumVisible = () =>
  and(eq(schema.albums.status, "published"), lte(schema.albums.publishedAt, new Date()));

export async function listTopics() {
  return db.select().from(schema.topics).orderBy(asc(schema.topics.sort), asc(schema.topics.name));
}

export interface LectureCard {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  speaker: string | null;
  topic: string | null;
  topicSlug: string | null;
  durationSec: number | null;
  publishedAt: Date | null;
  hasVideo: boolean;
  hasAudio: boolean;
  coverUrl: string | null;
}

const lectureCols = {
  id: schema.lectures.id,
  slug: schema.lectures.slug,
  title: schema.lectures.title,
  description: schema.lectures.description,
  speaker: schema.lectures.speaker,
  topic: schema.topics.name,
  topicSlug: schema.topics.slug,
  durationSec: schema.lectures.durationSec,
  publishedAt: schema.lectures.publishedAt,
  videoId: schema.lectures.videoId,
  audioFile: schema.lectures.audioFile,
  coverFile: schema.lectures.coverFile,
};

interface LectureRow {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  speaker: string | null;
  topic: string | null;
  topicSlug: string | null;
  durationSec: number | null;
  publishedAt: Date | null;
  videoId: string | null;
  audioFile: string | null;
  coverFile: string | null;
}

async function toCards(rows: LectureRow[]): Promise<LectureCard[]> {
  const covers = await signFiles(rows.map((r) => r.coverFile), TTL.image);
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    speaker: r.speaker,
    topic: r.topic,
    topicSlug: r.topicSlug,
    durationSec: r.durationSec,
    publishedAt: r.publishedAt,
    hasVideo: !!r.videoId,
    hasAudio: !!r.audioFile,
    coverUrl: r.coverFile ? covers.get(r.coverFile) ?? null : null,
  }));
}

export interface LectureFilter {
  topic?: string;
  format?: "video" | "audio";
  q?: string;
  page?: number;
}

export async function listLectures(f: LectureFilter = {}) {
  const page = Math.max(1, f.page ?? 1);
  const conds = [lectureVisible()];
  if (f.topic) conds.push(eq(schema.topics.slug, f.topic));
  if (f.format === "video") conds.push(isNotNull(schema.lectures.videoId));
  if (f.format === "audio") conds.push(isNotNull(schema.lectures.audioFile));
  if (f.q?.trim()) {
    const q = `%${f.q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    conds.push(or(ilike(schema.lectures.title, q), ilike(schema.lectures.speaker, q), ilike(schema.lectures.description, q))!);
  }
  const rows = await db
    .select(lectureCols)
    .from(schema.lectures)
    .leftJoin(schema.topics, eq(schema.topics.id, schema.lectures.topicId))
    .where(and(...conds))
    .orderBy(desc(schema.lectures.publishedAt))
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);
  return { items: await toCards(rows.slice(0, PAGE_SIZE)), page, hasMore: rows.length > PAGE_SIZE };
}

export async function getLecture(slug: string) {
  const [row] = await db
    .select(lectureCols)
    .from(schema.lectures)
    .leftJoin(schema.topics, eq(schema.topics.id, schema.lectures.topicId))
    .where(and(lectureVisible(), eq(schema.lectures.slug, slug)))
    .limit(1);
  if (!row) return null;
  const [card] = await toCards([row]);
  return { ...card, videoId: row.videoId, audioFile: row.audioFile };
}

export async function getProgressMap(userId: string, lectureIds: number[]) {
  if (!lectureIds.length) return new Map<number, { positionSec: number; completed: boolean }>();
  const rows = await db
    .select()
    .from(schema.progress)
    .where(and(eq(schema.progress.userId, userId), inArray(schema.progress.lectureId, lectureIds)));
  return new Map(rows.map((r) => [r.lectureId, { positionSec: r.positionSec, completed: r.completed }]));
}

/** «Продолжить просмотр»: начатые и не досмотренные лекции. */
export async function continueWatching(userId: string, limit = 4) {
  const rows = await db
    .select({ ...lectureCols, positionSec: schema.progress.positionSec })
    .from(schema.progress)
    .innerJoin(schema.lectures, eq(schema.lectures.id, schema.progress.lectureId))
    .leftJoin(schema.topics, eq(schema.topics.id, schema.lectures.topicId))
    .where(and(eq(schema.progress.userId, userId), eq(schema.progress.completed, false), dsql`${schema.progress.positionSec} > 30`, lectureVisible()))
    .orderBy(desc(schema.progress.updatedAt))
    .limit(limit);
  const cards = await toCards(rows);
  return cards.map((c, i) => ({ ...c, positionSec: rows[i].positionSec }));
}

export async function saveProgress(userId: string, lectureId: number, positionSec: number, durationSec: number | null) {
  const pos = Math.max(0, Math.round(positionSec));
  const completed = !!durationSec && pos >= durationSec * 0.9;
  await db
    .insert(schema.progress)
    .values({ userId, lectureId, positionSec: pos, completed })
    .onConflictDoUpdate({
      target: [schema.progress.userId, schema.progress.lectureId],
      // Однажды досмотренная лекция остаётся досмотренной.
      set: { positionSec: pos, completed: dsql`${schema.progress.completed} or ${completed}`, updatedAt: new Date() },
    });
  return { completed };
}

export async function getLectureById(id: number) {
  return db.query.lectures.findFirst({ where: and(lectureVisible(), eq(schema.lectures.id, id)) });
}

// ─── Статьи ──────────────────────────────────────────────────────────

export async function listArticles(limit = 50) {
  const rows = await db
    .select({
      id: schema.articles.id,
      slug: schema.articles.slug,
      title: schema.articles.title,
      excerpt: schema.articles.excerpt,
      readingMinutes: schema.articles.readingMinutes,
      publishedAt: schema.articles.publishedAt,
      coverFile: schema.articles.coverFile,
      topic: schema.topics.name,
    })
    .from(schema.articles)
    .leftJoin(schema.topics, eq(schema.topics.id, schema.articles.topicId))
    .where(articleVisible())
    .orderBy(desc(schema.articles.publishedAt))
    .limit(limit);
  const covers = await signFiles(rows.map((r) => r.coverFile), TTL.image);
  return rows.map(({ coverFile, ...r }) => ({ ...r, coverUrl: coverFile ? covers.get(coverFile) ?? null : null }));
}

export async function getArticle(slug: string) {
  const [row] = await db
    .select({ article: schema.articles, topic: schema.topics.name, lectureSlug: schema.lectures.slug, lectureTitle: schema.lectures.title })
    .from(schema.articles)
    .leftJoin(schema.topics, eq(schema.topics.id, schema.articles.topicId))
    .leftJoin(schema.lectures, eq(schema.lectures.id, schema.articles.lectureId))
    .where(and(articleVisible(), eq(schema.articles.slug, slug)))
    .limit(1);
  if (!row) return null;
  const covers = await signFiles([row.article.coverFile], TTL.image);
  return {
    ...row.article,
    topic: row.topic,
    lecture: row.lectureSlug ? { slug: row.lectureSlug, title: row.lectureTitle! } : null,
    coverUrl: row.article.coverFile ? covers.get(row.article.coverFile) ?? null : null,
  };
}

/** Статьи, связанные с лекцией. */
export async function articlesForLecture(lectureId: number) {
  return db
    .select({ slug: schema.articles.slug, title: schema.articles.title, readingMinutes: schema.articles.readingMinutes })
    .from(schema.articles)
    .where(and(articleVisible(), eq(schema.articles.lectureId, lectureId)))
    .orderBy(desc(schema.articles.publishedAt));
}

// ─── Встречи и фото ──────────────────────────────────────────────────

export async function listAlbums(limit = 50) {
  const rows = await db
    .select({
      id: schema.albums.id,
      title: schema.albums.title,
      eventDate: schema.albums.eventDate,
      coverFile: schema.albums.coverFile,
      photoCount: dsql<number>`(select count(*)::int from ${schema.photos} where ${schema.photos.albumId} = ${schema.albums.id})`,
    })
    .from(schema.albums)
    .where(albumVisible())
    .orderBy(desc(schema.albums.eventDate))
    .limit(limit);
  const covers = await signFiles(rows.map((r) => r.coverFile), TTL.image);
  return rows.map(({ coverFile, ...r }) => ({ ...r, coverUrl: coverFile ? covers.get(coverFile) ?? null : null }));
}

export async function getAlbum(id: number, withPhotos: boolean) {
  const album = await db.query.albums.findFirst({ where: and(albumVisible(), eq(schema.albums.id, id)) });
  if (!album) return null;
  const photos = withPhotos
    ? await db.select().from(schema.photos).where(eq(schema.photos.albumId, id)).orderBy(asc(schema.photos.sort), asc(schema.photos.id))
    : [];
  const urls = await signFiles([album.coverFile, ...photos.map((p) => p.file)], TTL.image);
  return {
    ...album,
    coverUrl: album.coverFile ? urls.get(album.coverFile) ?? null : null,
    photos: photos.map((p) => ({ id: p.id, caption: p.caption, url: urls.get(p.file) ?? null })),
  };
}

/**
 * Выдача файлов (аудио, фото, обложки) по временным подписанным ссылкам.
 *  - local: файлы лежат в STORAGE_LOCAL_DIR, отдаются через /api/media/<key>?exp=..&sig=..
 *  - s3: presigned URL Yandex Object Storage (или любого S3).
 * Поля *_file в контенте — UUID файла из directus_files или media_files.
 */
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { inArray, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "./env";
import { hmac, safeEqual } from "./crypto";

export const TTL = { media: 4 * 3600, image: 3600 } as const;

let s3: S3Client | null = null;
const getS3 = () =>
  (s3 ??= new S3Client({
    endpoint: env.s3.endpoint,
    region: env.s3.region,
    credentials: { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey },
  }));

const localSig = (key: string, exp: number) => hmac(`media:${key}:${exp}`);

export function verifyLocalSignature(key: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  return safeEqual(sig, localSig(key, exp));
}

export async function signedUrlForKey(key: string, ttlSec: number): Promise<string> {
  if (env.storageDriver === "s3") {
    return getSignedUrl(getS3(), new GetObjectCommand({ Bucket: env.s3.bucket, Key: key }), { expiresIn: ttlSec });
  }
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  // Время округляется вверх до 10 минут, чтобы ссылка на одну картинку чаще совпадала и кэшировалась браузером.
  const expRounded = Math.ceil(exp / 600) * 600;
  return `/api/media/${key.split("/").map(encodeURIComponent).join("/")}?exp=${expRounded}&sig=${localSig(key, expRounded)}`;
}

// Directus может появиться уже после старта сайта, поэтому «нет таблицы» перепроверяем раз в минуту.
let directusFiles: { exists: boolean; checkedAt: number } | null = null;
async function hasDirectusFiles() {
  if (!directusFiles || (!directusFiles.exists && Date.now() - directusFiles.checkedAt > 60_000)) {
    const rows = await db.execute<{ t: string | null }>(dsql`select to_regclass('public.directus_files')::text as t`);
    directusFiles = { exists: !!rows[0]?.t, checkedAt: Date.now() };
  }
  return directusFiles.exists;
}

/** UUID файлов → ключи в хранилище. */
export async function resolveKeys(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((x): x is string => !!x))];
  const map = new Map<string, string>();
  if (!wanted.length) return map;

  if (await hasDirectusFiles()) {
    const rows = await db.execute<{ id: string; filename_disk: string }>(
      dsql`select id::text, filename_disk from directus_files where id::text in ${wanted}`,
    );
    for (const r of rows) if (r.filename_disk) map.set(r.id, r.filename_disk);
  }
  const rest = wanted.filter((id) => !map.has(id));
  if (rest.length) {
    const rows = await db
      .select({ id: schema.mediaFiles.id, key: schema.mediaFiles.filenameDisk })
      .from(schema.mediaFiles)
      .where(inArray(schema.mediaFiles.id, rest));
    for (const r of rows) map.set(r.id, r.key);
  }
  return map;
}

/** UUID файлов → подписанные ссылки. */
export async function signFiles(ids: (string | null | undefined)[], ttlSec: number): Promise<Map<string, string>> {
  const keys = await resolveKeys(ids);
  const out = new Map<string, string>();
  await Promise.all([...keys].map(async ([id, key]) => out.set(id, await signedUrlForKey(key, ttlSec))));
  return out;
}

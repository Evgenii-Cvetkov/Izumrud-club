import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { env } from "@/lib/env";
import { verifyLocalSignature } from "@/lib/storage";

const TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

/**
 * Локальная выдача файлов по подписанной ссылке (STORAGE_DRIVER=local).
 * Поддерживает Range — без него в Safari не работает перемотка аудио.
 */
export async function GET(req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  if (env.storageDriver !== "local") return new Response("Not found", { status: 404 });
  const { key: parts } = await ctx.params;
  const key = parts.map(decodeURIComponent).join("/");
  const url = new URL(req.url);
  if (!verifyLocalSignature(key, Number(url.searchParams.get("exp")), url.searchParams.get("sig") ?? "")) {
    return new Response("Ссылка устарела. Обновите страницу", { status: 403 });
  }

  const root = path.resolve(env.storageLocalDir);
  const file = path.resolve(root, key);
  if (!file.startsWith(root + path.sep)) return new Response("Not found", { status: 404 });

  let size: number;
  try {
    const st = await stat(file);
    if (!st.isFile()) throw new Error();
    size = st.size;
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const type = TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  };

  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: { ...headers, "Content-Length": String(size) },
  });
}

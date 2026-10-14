/**
 * Видео через видеохостинг. Сайт не раздаёт видео сам: отдаёт плееру ссылку,
 * только если у участника открыт доступ. Поверх плеера сайт рисует полупрозрачный
 * водяной знак с email участника — он попадает в запись экрана.
 *
 * Kinescope: в настройках проекта включите ограничение воспроизведения своим доменом,
 * иначе ссылку на встраивание можно открыть с любого сайта. Плеер встраивается через iframe.
 */
import { env } from "./env";

export type VideoSource = { type: "hls"; src: string } | { type: "embed"; src: string };

export function videoSourceFor(videoId: string): VideoSource {
  if (env.videoProvider === "kinescope") {
    return { type: "embed", src: `https://kinescope.io/embed/${encodeURIComponent(videoId)}` };
  }
  return { type: "hls", src: env.demoHlsUrl };
}

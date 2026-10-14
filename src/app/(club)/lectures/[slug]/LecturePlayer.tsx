"use client";

import { useEffect, useRef, useState } from "react";
import { Cover } from "@/components/Cover";
import { useAudio } from "@/components/AudioPlayer";
import { formatClock } from "@/components/time";

interface Lecture {
  id: number;
  slug: string;
  title: string;
  speaker: string | null;
  coverUrl: string | null;
  seed: string;
  hasVideo: boolean;
  hasAudio: boolean;
  durationSec: number | null;
}

type Source = { type: "hls" | "embed"; src: string; watermark: string };

const SAVE_EVERY_SEC = 15;
const WATERMARK_SPOTS = ["left-[6%] top-[8%]", "right-[6%] top-[30%]", "left-[10%] bottom-[22%]", "right-[8%] bottom-[10%]"];

function saveProgress(lectureId: number, positionSec: number, durationSec?: number) {
  void fetch(`/api/progress/${lectureId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ positionSec, durationSec: durationSec && Number.isFinite(durationSec) ? durationSec : undefined }),
    keepalive: true,
  }).catch(() => {});
}

export function LecturePlayer({ lecture, startAt }: { lecture: Lecture; startAt: number }) {
  const audio = useAudio();
  const [source, setSource] = useState<Source | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isThisAudio = audio?.track?.lectureId === lecture.id;

  const startVideo = async () => {
    setLoading(true);
    setError(null);
    if (audio?.playing) audio.toggle();
    try {
      const res = await fetch(`/api/lectures/${encodeURIComponent(lecture.slug)}/play`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: "video" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Видео недоступно");
      setSource({ type: data.type, src: data.src, watermark: data.watermark });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Видео недоступно");
    } finally {
      setLoading(false);
    }
  };

  const listen = () => {
    if (!audio) return;
    if (isThisAudio) return audio.toggle();
    void audio.play({ lectureId: lecture.id, slug: lecture.slug, title: lecture.title, speaker: lecture.speaker, coverUrl: lecture.coverUrl, startAt });
  };

  return (
    <div className="mt-6 max-w-3xl">
      {lecture.hasVideo ? (
        source ? (
          <VideoFrame source={source} lectureId={lecture.id} startAt={startAt} />
        ) : (
          <div className="relative">
            <Cover url={lecture.coverUrl} seed={lecture.seed} alt="" size="lg" />
            <button
              type="button"
              onClick={startVideo}
              disabled={loading}
              className="facet facet-lg absolute inset-0 grid place-items-center bg-ink/25 transition-colors hover:bg-ink/40"
              aria-label={startAt > 0 ? `Смотреть с ${formatClock(startAt)}` : "Смотреть лекцию"}
            >
              <span className="facet flex items-center gap-3 bg-paper px-6 py-4 text-lg font-medium text-emerald-deep">
                <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden><path d="M4 2l10 6-10 6z" fill="currentColor" /></svg>
                {loading ? "Загружаем…" : startAt > 0 ? `Смотреть с ${formatClock(startAt)}` : "Смотреть"}
              </span>
            </button>
          </div>
        )
      ) : (
        <Cover url={lecture.coverUrl} seed={lecture.seed} alt="" size="lg" />
      )}

      {error && <p role="alert" className="mt-3 text-sm text-garnet">{error}</p>}

      {lecture.hasAudio && (
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button type="button" onClick={listen} className="btn btn-secondary">
            {isThisAudio && audio?.playing ? "Пауза" : isThisAudio ? "Продолжить слушать" : "Слушать аудиоверсию"}
          </button>
          <span className="text-sm text-muted">Аудио играет и при заблокированном экране</span>
        </div>
      )}
    </div>
  );
}

function VideoFrame({ source, lectureId, startAt }: { source: Source; lectureId: number; startAt: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSaved = useRef(0);
  const [spot, setSpot] = useState(0);

  // Водяной знак переезжает раз в 20 секунд, чтобы его нельзя было закрыть одной плашкой.
  useEffect(() => {
    const t = setInterval(() => setSpot((s) => (s + 1) % WATERMARK_SPOTS.length), 20_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (source.type !== "hls") return;
    const video = videoRef.current;
    if (!video) return;
    let destroy = () => {};
    const start = () => {
      video.currentTime = startAt;
      void video.play().catch(() => {});
    };
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari и iOS умеют HLS сами.
      video.src = source.src;
      video.addEventListener("loadedmetadata", start, { once: true });
    } else {
      void import("hls.js").then(({ default: Hls }) => {
        if (!Hls.isSupported()) return;
        const hls = new Hls({ startPosition: startAt });
        hls.loadSource(source.src);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => void video.play().catch(() => {}));
        destroy = () => hls.destroy();
      });
    }
    const save = () => video.currentTime > 0 && saveProgress(lectureId, video.currentTime, video.duration);
    const onTime = () => {
      if (Math.abs(video.currentTime - lastSaved.current) >= SAVE_EVERY_SEC) {
        lastSaved.current = video.currentTime;
        save();
      }
    };
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("pause", save);
    window.addEventListener("pagehide", save);
    return () => {
      save();
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("pause", save);
      window.removeEventListener("pagehide", save);
      destroy();
    };
  }, [source, lectureId, startAt]);

  return (
    <div className="facet facet-lg relative aspect-video overflow-hidden bg-black">
      {source.type === "hls" ? (
        <video ref={videoRef} controls playsInline className="h-full w-full" />
      ) : (
        <iframe
          src={source.src}
          title="Видео лекции"
          className="h-full w-full"
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
        />
      )}
      <span
        className={`pointer-events-none absolute select-none text-[0.8rem] text-white/35 transition-all duration-1000 ${WATERMARK_SPOTS[spot]}`}
        aria-hidden
      >
        {source.watermark}
      </span>
    </div>
  );
}

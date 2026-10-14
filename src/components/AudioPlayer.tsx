"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { formatClock } from "./time";

export interface Track {
  lectureId: number;
  slug: string;
  title: string;
  speaker: string | null;
  coverUrl: string | null;
  startAt: number;
}

interface AudioCtx {
  track: Track | null;
  playing: boolean;
  play: (t: Track) => Promise<void>;
  toggle: () => void;
}

const Ctx = createContext<AudioCtx | null>(null);
export const useAudio = () => useContext(Ctx);

const SPEEDS = [1, 1.25, 1.5, 2];
const SAVE_EVERY_SEC = 15;

async function fetchAudioUrl(slug: string): Promise<string> {
  const res = await fetch(`/api/lectures/${encodeURIComponent(slug)}/play`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ format: "audio" }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? "Не удалось загрузить аудио");
  return data.src as string;
}

function saveProgress(lectureId: number, positionSec: number, durationSec: number) {
  void fetch(`/api/progress/${lectureId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ positionSec, durationSec: Number.isFinite(durationSec) ? durationSec : undefined }),
    keepalive: true,
  }).catch(() => {});
}

/**
 * Общий аудиоплеер: продолжает играть при переходах между страницами,
 * управляется с экрана блокировки (Media Session), сохраняет место прослушивания.
 */
export function AudioProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [track, setTrack] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const lastSaved = useRef(0);

  const persist = useCallback(() => {
    const a = audioRef.current;
    if (a && track && a.currentTime > 0) saveProgress(track.lectureId, a.currentTime, a.duration);
  }, [track]);

  const play = useCallback(async (t: Track) => {
    const a = audioRef.current;
    if (!a) return;
    persist();
    setError(null);
    try {
      a.src = await fetchAudioUrl(t.slug);
      setTrack(t);
      a.currentTime = t.startAt;
      a.playbackRate = speed;
      await a.play();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось включить аудио");
    }
  }, [persist, speed]);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a || !track) return;
    if (a.paused) void a.play();
    else a.pause();
  }, [track]);

  const seekBy = useCallback((d: number) => {
    const a = audioRef.current;
    if (a) a.currentTime = Math.max(0, Math.min((a.duration || 0) - 1, a.currentTime + d));
  }, []);

  // Media Session: название, обложка и кнопки на экране блокировки.
  useEffect(() => {
    if (!track || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.speaker ?? "Клуб «Изумруд»",
      album: "Клуб «Изумруд»",
      artwork: track.coverUrl
        ? [{ src: track.coverUrl, sizes: "512x320" }]
        : [{ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }],
    });
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", () => void audioRef.current?.play());
    ms.setActionHandler("pause", () => audioRef.current?.pause());
    ms.setActionHandler("seekbackward", () => seekBy(-15));
    ms.setActionHandler("seekforward", () => seekBy(15));
    ms.setActionHandler("seekto", (e) => {
      if (audioRef.current && e.seekTime != null) audioRef.current.currentTime = e.seekTime;
    });
  }, [track, seekBy]);

  useEffect(() => {
    const onHide = () => persist();
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [persist]);

  const onTimeUpdate = () => {
    const a = audioRef.current;
    if (!a || !track) return;
    setTime(a.currentTime);
    if (Math.abs(a.currentTime - lastSaved.current) >= SAVE_EVERY_SEC) {
      lastSaved.current = a.currentTime;
      saveProgress(track.lectureId, a.currentTime, a.duration);
    }
  };

  const onError = async () => {
    // Подписанная ссылка живёт 4 часа. Если истекла — берём новую и продолжаем с того же места.
    const a = audioRef.current;
    if (!a || !track) return;
    const at = a.currentTime;
    try {
      a.src = await fetchAudioUrl(track.slug);
      a.currentTime = at;
      await a.play();
    } catch {
      setError("Аудио не загружается. Проверьте интернет и попробуйте ещё раз");
    }
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  return (
    <Ctx.Provider value={{ track, playing, play, toggle }}>
      {children}
      <audio
        ref={audioRef}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          persist();
        }}
        onEnded={() => {
          setPlaying(false);
          persist();
        }}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onError={onError}
      />
      {track && (
        <div
          className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 border-t border-line bg-paper/95 backdrop-blur md:bottom-0"
          role="region"
          aria-label="Аудиоплеер"
        >
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2">
            <button
              type="button"
              onClick={toggle}
              className="facet facet-sm grid h-11 w-11 shrink-0 place-items-center bg-emerald text-white"
              aria-label={playing ? "Пауза" : "Слушать"}
            >
              {playing ? (
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><rect x="3" y="2" width="3.5" height="12" fill="currentColor" /><rect x="9.5" y="2" width="3.5" height="12" fill="currentColor" /></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M4 2l10 6-10 6z" fill="currentColor" /></svg>
              )}
            </button>
            <div className="min-w-0 flex-1">
              <a href={`/lectures/${track.slug}`} className="block truncate text-[0.95rem] font-medium text-ink">
                {track.title}
              </a>
              {error ? (
                <p className="truncate text-sm text-garnet">{error}</p>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <span className="tabular-nums">{formatClock(time)}</span>
                  <input
                    type="range"
                    min={0}
                    max={duration || 0}
                    step={1}
                    value={Math.min(time, duration || 0)}
                    onChange={(e) => {
                      if (audioRef.current) audioRef.current.currentTime = Number(e.target.value);
                    }}
                    className="h-1 flex-1 accent-[var(--color-emerald)]"
                    aria-label="Перемотка"
                  />
                  <span className="tabular-nums">{formatClock(duration)}</span>
                </div>
              )}
            </div>
            <button type="button" onClick={() => seekBy(-15)} className="hidden min-h-11 px-2 text-sm text-muted sm:block" aria-label="Назад на 15 секунд">
              −15 с
            </button>
            <button type="button" onClick={() => seekBy(15)} className="hidden min-h-11 px-2 text-sm text-muted sm:block" aria-label="Вперёд на 15 секунд">
              +15 с
            </button>
            <button type="button" onClick={cycleSpeed} className="min-h-11 min-w-12 rounded border border-line px-2 text-sm tabular-nums" aria-label="Скорость воспроизведения">
              {speed}×
            </button>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

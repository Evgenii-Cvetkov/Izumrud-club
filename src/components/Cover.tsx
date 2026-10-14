import { GemCover } from "./Gem";

/** Огранённая обложка 16:10: картинка или заглушка-изумруд. */
export function Cover({ url, seed, alt, className = "", size = "md" }: { url: string | null; seed: string; alt: string; className?: string; size?: "sm" | "md" | "lg" }) {
  const facet = size === "sm" ? "facet facet-sm" : size === "lg" ? "facet facet-lg" : "facet";
  return (
    <div className={`${facet} relative aspect-[16/10] overflow-hidden bg-emerald-deep ${className}`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- подписанные ссылки с коротким сроком, оптимизатор Next их не кэширует
        <img src={url} alt={alt} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <GemCover seed={seed} label={alt} />
      )}
    </div>
  );
}

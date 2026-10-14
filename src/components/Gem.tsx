/**
 * Знак клуба — изумруд ступенчатой огранки, вид сверху: площадка и ступени граней.
 * Используется как логотип и как обложка-заглушка для материалов без картинки.
 */
export function GemMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size * 0.78} viewBox="0 0 36 28" aria-hidden className={className}>
      <path d="M6 1h24l5 5v16l-5 5H6l-5-5V6z" fill="var(--color-emerald)" />
      <path d="M10 6h16l3 3v10l-3 3H10l-3-3V9z" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="1.2" />
      <path d="M6 1l4 5M30 1l-4 5M35 6l-6 3M35 22l-6-3M30 27l-4-5M6 27l4-5M1 22l6-3M1 6l6 3" stroke="#fff" strokeOpacity=".35" strokeWidth="1" />
    </svg>
  );
}

const PALETTES = [
  ["#0b6e4f", "#0e8a63", "#084c37"],
  ["#14594f", "#1c7a6a", "#0d3d36"],
  ["#2f6b3f", "#3f8752", "#1f4a2b"],
  ["#0f5c63", "#177a83", "#0a3f44"],
] as const;

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Обложка без картинки: ступени огранки в оттенке, зависящем от темы материала. */
export function GemCover({ seed, label }: { seed: string; label?: string | null }) {
  const [a, b, c] = PALETTES[hash(seed) % PALETTES.length];
  const steps = [0, 1, 2, 3];
  return (
    <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" className="block h-full w-full" role="img" aria-label={label ?? ""}>
      <rect width="320" height="200" fill={c} />
      {steps.map((i) => {
        const inset = 18 + i * 22;
        const cut = 26 - i * 4;
        const x0 = inset * 1.5, y0 = inset, x1 = 320 - inset * 1.5, y1 = 200 - inset;
        const d = `M${x0 + cut} ${y0}H${x1 - cut}L${x1} ${y0 + cut}V${y1 - cut}L${x1 - cut} ${y1}H${x0 + cut}L${x0} ${y1 - cut}V${y0 + cut}Z`;
        return <path key={i} d={d} fill={i % 2 ? b : a} fillOpacity={0.55 + i * 0.12} stroke="#fff" strokeOpacity={0.14} />;
      })}
    </svg>
  );
}

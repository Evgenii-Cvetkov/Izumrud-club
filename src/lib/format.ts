const TZ = "Europe/Moscow";

export const formatDate = (d: Date | string | null | undefined) =>
  d ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: TZ }).format(new Date(d)) : "";

export const formatDateShort = (d: Date | string | null | undefined) =>
  d ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: TZ }).format(new Date(d)) : "";

export const formatRub = (n: number) =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(n);

export function formatDuration(sec: number | null | undefined): string {
  if (!sec) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h === 0) return `${m} мин`;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

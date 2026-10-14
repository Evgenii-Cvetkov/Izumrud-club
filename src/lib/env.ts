/** Настройки из переменных окружения с безопасными значениями для разработки. */
const isProd = process.env.NODE_ENV === "production";

function required(name: string, devFallback: string): string {
  const v = process.env[name];
  if (v) return v;
  if (isProd) throw new Error(`Переменная окружения ${name} обязательна в production`);
  return devFallback;
}

export const env = {
  isProd,
  appUrl: (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  get appSecret() {
    return required("APP_SECRET", "dev-secret-do-not-use-in-production");
  },
  priceRub: Number(process.env.PRICE_RUB ?? 10000),
  graceDays: Number(process.env.GRACE_DAYS ?? 3),

  yookassaShopId: process.env.YOOKASSA_SHOP_ID ?? "",
  yookassaSecretKey: process.env.YOOKASSA_SECRET_KEY ?? "",
  get paymentsMock() {
    return !process.env.YOOKASSA_SHOP_ID;
  },
  /** Демо-оплата в production запрещена, если её явно не разрешили (для стенда). */
  get mockPaymentsAllowed() {
    return !isProd || process.env.ALLOW_MOCK_PAYMENTS === "1";
  },
  yookassaReceipts: process.env.YOOKASSA_RECEIPTS !== "0",
  yookassaVatCode: Number(process.env.YOOKASSA_VAT_CODE ?? 1),

  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: Number(process.env.SMTP_PORT ?? 465),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPassword: process.env.SMTP_PASSWORD ?? "",
  mailFrom: process.env.MAIL_FROM ?? "Клуб «Изумруд» <club@example.ru>",

  videoProvider: (process.env.VIDEO_PROVIDER ?? "demo") as "demo" | "kinescope",
  demoHlsUrl: process.env.DEMO_HLS_URL ?? "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",

  storageDriver: (process.env.STORAGE_DRIVER ?? "local") as "local" | "s3",
  storageLocalDir: process.env.STORAGE_LOCAL_DIR ?? "./storage",
  s3: {
    endpoint: process.env.S3_ENDPOINT ?? "https://storage.yandexcloud.net",
    region: process.env.S3_REGION ?? "ru-central1",
    bucket: process.env.S3_BUCKET ?? "",
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  },

  vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? "",
  vapidSubject: process.env.VAPID_SUBJECT ?? "mailto:club@example.ru",
};

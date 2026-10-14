import type { Metadata, Viewport } from "next";
import "@fontsource-variable/literata";
import "@fontsource/golos-text/400.css";
import "@fontsource/golos-text/500.css";
import "@fontsource/golos-text/600.css";
import "./globals.css";
import { AudioProvider } from "@/components/AudioPlayer";
import { ServiceWorker } from "@/components/ServiceWorker";

export const metadata: Metadata = {
  title: { default: "Клуб «Изумруд»", template: "%s — Изумруд" },
  description: "Клуб развития мышления в Петербурге: встречи, лекции в видео и аудио, статьи для участников.",
  appleWebApp: { capable: true, title: "Изумруд", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#e9eeea",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <AudioProvider>{children}</AudioProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Клуб «Изумруд»",
    short_name: "Изумруд",
    description: "Лекции, статьи и фото встреч клуба развития мышления",
    start_url: "/feed",
    scope: "/",
    display: "standalone",
    background_color: "#e9eeea",
    theme_color: "#e9eeea",
    lang: "ru",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

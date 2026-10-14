# Образ приложения: сайт (npm start) и фоновые задачи (npm run worker) из одного образа.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev && npm install --no-save tsx drizzle-kit

FROM node:22-bookworm-slim
# ffmpeg — для извлечения аудио из видео (npm run audio:extract)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=build /app /app
RUN mkdir -p /app/storage && chown -R node:node /app/storage
USER node
EXPOSE 3000
CMD ["sh", "-c", "npm run db:migrate && npm start"]

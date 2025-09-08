# ---------- deps ----------
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- build (prod) ----------
FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Важно: именно nest build, чтобы подтянулись assets из nest-cli.json
RUN npm run build

# Жёсткая проверка сборки
RUN test -f dist/main.js && test -f dist/app.module.js || \
    (echo "dist/main.js или dist/app.module.js отсутствует. Содержимое dist:"; find dist -maxdepth 2 -type f; exit 1)

# ---------- runner (prod) ----------
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NODE_OPTIONS="--enable-source-maps"
RUN addgroup -S app && adduser -S app -G app

# Ставим только production-зависимости
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Кладём сборку
COPY --from=build /app/dist ./dist

USER app
EXPOSE 3005
CMD ["node", "dist/main.js"]

# ---------- dev (hot-reload) ----------
FROM node:24-alpine AS dev
WORKDIR /app
ENV NODE_ENV=development
# Нужны dev deps (nest-cli и т.д.)
COPY package.json package-lock.json ./
RUN npm ci
# Кладём код (на рантайме всё равно будет примонтирован volume)
COPY . .
EXPOSE 3005
# В dev мы хотим watch-режим без пересборки образа
CMD ["npm", "run", "start:dev"]
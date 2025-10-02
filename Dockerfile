# syntax=docker/dockerfile:1.6
# ---------- deps ----------
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=secret,id=npm_token \
    export NPM_TOKEN="$(cat /run/secrets/npm_token)" \
    && npm ci

# ---------- build (prod) ----------
FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
RUN test -f dist/main.js && test -f dist/app.module.js || \
    (echo "dist/main.js или dist/app.module.js отсутствует. Содержимое dist:"; find dist -maxdepth 2 -type f; exit 1)

# ---------- runner (prod) ----------
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NODE_OPTIONS="--enable-source-maps"
RUN addgroup -S app && adduser -S app -G app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
USER app
EXPOSE 3003
CMD ["node", "dist/main.js"]

# ---------- dev (hot-reload) ----------
FROM node:24-alpine AS dev
WORKDIR /app
ENV NODE_ENV=development
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=secret,id=npm_token \
    export NPM_TOKEN="$(cat /run/secrets/npm_token)" \
    && npm ci
COPY . .
EXPOSE 3003
CMD ["npm", "run", "start:dev"]
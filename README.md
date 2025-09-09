# course-auth

NestJS-микросервис аутентификации/авторизации. Выдаёт пары токенов (**access RS256** + **refresh RS256**), валидирует их, хранит refresh-токены в БД, предоставляет RPC-методы через RabbitMQ и простые HTTP-эндпойнты здоровья.

---

## Содержание

- [Функционал](#функционал)
- [Технологии](#технологии)
- [Переменные окружения](#переменные-окружения)
- [Быстрый старт](#быстрый-старт)
  - [Локально (Node)](#локально-node)
  - [Docker Compose (dev)](#docker-compose-dev)
- [RPC (RabbitMQ) контракты](#rpc-rabbitmq-контракты)
  - [GenerateTokens](#authgeneratetokens)
  - [ValidateAccess](#authvalidateaccess)
  - [ValidateRefresh](#authvalidaterefresh)
  - [HashPassword](#authhashpassword)
  - [ComparePassword](#authcomparepassword)
- [HTTP API](#http-api)
- [Структура БД](#структура-бд)
- [Тесты и линт](#тесты-и-линт)
- [CI/CD и релизы](#cicd-и-релизы)
- [Kubernetes (примеры)](#kubernetes-примеры)
- [Troubleshooting](#troubleshooting)
- [Лицензия](#лицензия)

---

## Функционал

- Генерация пары токенов:
  - **Access** — JWT RS256, подписывается приватным ключом `JWT_PRIVATE_KEY`; проверяется публичным `JWT_PUBLIC_KEY`.
  - **Refresh** — JWT RS256 (секрет `JWT_REFRESH_SECRET`), хранится в БД (таблица `token`).
- Валидация access/refresh токенов.
- Хэширование/проверка пароля (`bcrypt`).
- RPC-контракты через RabbitMQ (очередь `auth` по умолчанию).
- HTTP-эндпойнты здоровья `/health/live`, `/health/ready`.

> Переход на **opaque refresh tokens** запланирован (см. ADR `docs/adr/0001-opaque-refresh-tokens.md`).

---

## Технологии

- **NestJS** (RMQ microservice + HTTP health)
- **RabbitMQ** (transport)
- **PostgreSQL 17** + **TypeORM**
- **JWT** (RS256/HS256)
- **bcrypt**
- **Jest** (юнит-тесты)
- **GitHub Actions** (CI)

---

## Переменные окружения

Пример: `.env.example`

```env
NODE_ENV=development
PORT=3001

# RabbitMQ
RMQ_URL=amqp://dev:dev@localhost:5672
AUTH_QUEUE=auth

# Postgres
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=auth_db
POSTGRES_USER=auth
POSTGRES_PASSWORD=auth

# JWT (access RS256 / refresh HS256)
JWT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
JWT_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----
JWT_REFRESH_SECRET=dev-refresh-secret

# TTL (опционально, по умолчанию: 30m/30d)
ACCESS_TTL=30m
REFRESH_TTL=30d

# Пароли
SALT_ROUNDS=10
```

---

## Быстрый старт

### Локально (Node)

```bash
# 1) Установка зависимостей
npm ci

# 2) Заполни .env (см. .env.example) и подними Postgres + RabbitMQ

# 3) Запуск сервиса в dev‑режиме (hot‑reload)
npm run dev

# Проверка здоровья
curl http://localhost:3005/health/live
```

### Docker Compose (dev)

Минимальный compose для сервиса:

```yaml
services:
  rabbitmq:
    image: rabbitmq:3.13-management
    ports: ['5672:5672', '15672:15672']
    environment:
      RABBITMQ_DEFAULT_USER: dev
      RABBITMQ_DEFAULT_PASS: dev

  db_auth:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: auth_db
      POSTGRES_USER: auth
      POSTGRES_PASSWORD: auth
    ports: ['5433:5432']

  auth:
    image: your-registry/course_auth:dev
    environment:
      NODE_ENV: development
      PORT: 3001
      RMQ_URL: amqp://dev:dev@rabbitmq:5672
      AUTH_QUEUE: auth
      POSTGRES_HOST: db_auth
      POSTGRES_PORT: 5432
      POSTGRES_DB: auth_db
      POSTGRES_USER: auth
      POSTGRES_PASSWORD: auth
      JWT_PRIVATE_KEY: |-
        -----BEGIN PRIVATE KEY-----
        ...
        -----END PRIVATE KEY-----
      JWT_PUBLIC_KEY: |-
        -----BEGIN PUBLIC KEY-----
        ...
        -----END PUBLIC KEY-----
      JWT_REFRESH_SECRET: dev-refresh-secret
      SALT_ROUNDS: 10
    ports: ['3001:3001']
    depends_on: [rabbitmq, db_auth]
```

---

## RPC (RabbitMQ) контракты

Очередь по умолчанию: auth (AUTH_QUEUE). Сообщения в формате транспорта Nest ({ "pattern": "...", "data": {...} }).

### auth.generateTokens

**Request:**

```
{
  "pattern": "auth.generateTokens",
  "data": {
    "user": {
      "id": "u-1",
      "email": "user@example.com",
      "name": "Alice",
      "role": "STUDENT",
      "specializationId": null
    }
  }
}
```

**Response:**

```
{ "accessToken": "...", "refreshToken": "..." }
```

### auth.validateAccess

**Request:**

```
{ "pattern": "auth.validateAccess", "data": { "token": "..." } }
```

**Response:**

```
{ "valid": true, "payload": { "id":"u-1","email":"user@example.com","role":"STUDENT", ... } }
```

### auth.validateRefresh

**Request:**

```
{ "pattern": "auth.validateRefresh", "data": { "token": "..." } }
```

**Response:**

```
{ "valid": true, "payload": { "id":"u-1", ... } }
```

### auth.hashPassword

**Request:**

```
{ "pattern": "auth.hashPassword", "data": { "plain": "pass123" } }
```

**Response:**

```
{ "hash": "$2b$10$..." }
```

### auth.comparePassword

**Request:**

```
{ "pattern": "auth.comparePassword", "data": { "plain": "pass123", "stored": "$2b$10$..." } }
```

**Response:**

```
{ "match": true }
```

---

## HTTP API

**Только health-эндпойнты (для k8s probes):**

- GET /health/live
- GET /health/ready

---

## Структура БД

**Таблица `token`:**

| колонка    | тип          | примечание                 |
| ---------- | ------------ | -------------------------- |
| id         | serial PK    |                            |
| token      | varchar(100) | JWT RS256                  |
| user_id    | varchar(64)  | идентификатор пользователя |
| created_at | timestamptz  | по умолчанию now()         |

---

## Тесты и линт

```bash
# Юнит‑тесты
npm test

# Линтер
npm run lint
```

В проекте есть пример юнит‑теста `auth.service.spec.ts`.
Репозиторий и RMQ в тестах **мокируются**, БД не требуется.

---

## CI/CD и релизы

- PR в `main` → запускаются Lint/Build/Test.
- Пуш тега `v*.*.*` или pre‑release (`v1.0.0-alpha1`, `v1.2.0-beta2`) →
  GitHub Actions собирает multi‑arch Docker‑образ и пушит в Docker Hub:

  ```
  ${DOCKERHUB_USERNAME}/<repo>:<tag>
  ${DOCKERHUB_USERNAME}/<repo>:latest
  ```

  Также создаётся ветка `release/<tag>` для быстрого rollback.

**Как создать тег**

Через GitHub Releases (UI):

1. _Releases_ → _New release_
2. _Choose a tag_: `v1.0.0` или pre‑release `v1.0.0-alpha_1`
3. Для нестабильной версии поставь чекбокс **Set as a pre-release**
4. _Publish release_

Через `git` (CLI):

```bash
git checkout main
git pull
git tag v1.0.0-alpha_1   # SemVer с точкой работает через CLI
git push origin v1.0.0-alpha_1
```

---

## Kubernetes (примеры)

**ConfigMap (dev):**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: auth-config
  namespace: course
data:
  NODE_ENV: 'development'
  PORT: '3001'
  RMQ_URL: 'amqp://dev:dev@rabbitmq.course.svc:5672'
  AUTH_QUEUE: 'auth'
  POSTGRES_HOST: 'postgres.course.svc'
  POSTGRES_PORT: '5432'
  POSTGRES_DB: 'auth_db'
  POSTGRES_USER: 'auth'
```

**Deployment (dev):**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth
  namespace: course
  labels: { app: auth }
spec:
  replicas: 1
  selector: { matchLabels: { app: auth } }
  template:
    metadata: { labels: { app: auth } }
    spec:
      containers:
        - name: app
          image: your-registry/course_auth:dev
          ports: [{ name: http, containerPort: 3001 }]
          envFrom:
            - configMapRef: { name: auth-config }
          env:
            - name: POSTGRES_PASSWORD
              value: 'auth'
            - name: JWT_PRIVATE_KEY
              valueFrom:
                { secretKeyRef: { name: jwt-private, key: JWT_PRIVATE_KEY } }
            - name: JWT_PUBLIC_KEY
              valueFrom:
                { secretKeyRef: { name: jwt-public, key: JWT_PUBLIC_KEY } }
            - name: JWT_REFRESH_SECRET
              valueFrom:
                { secretKeyRef: { name: jwt-refresh, key: JWT_REFRESH_SECRET } }
          readinessProbe:
            httpGet: { path: /health/ready, port: http }
          livenessProbe:
            httpGet: { path: /health/live, port: http }
          resources:
            requests: { cpu: '100m', memory: '128Mi' }
            limits: { cpu: '400m', memory: '384Mi' }
```

---

## Troubleshooting

- **RabbitMQ UI:** _“Message published, but not routed”_ — публикуешь не в ту очередь/эксчендж. Для тестов заходи в **Queues → auth → Publish message** и отправляй JSON в формате `{ "pattern": "...", "data": {...} }`.
- **ERRORS:** _Access не валидируется в другом сервисе_ - убедись, что сервисы используют один и тот же JWT_PUBLIC_KEY (публичный ключ), и что access подписывается приватным ключом JWT_PRIVATE_KEY.
- **`npm test` падает из‑за отсутствия тестов:** в CI/локально используем jest без `--passWithNoTests`. Добавь хотя бы один простой юнит‑тест (пример в `src/modules/analytics/test`).

---

## Лицензия

Evaluation License Agreement
Version 1.0 — 2025-09-08

Copyright (c) 2025
Holder: Golovchenko Vasili Vyacheslavovich
Contact:

1. Grant of License
   Licensor grants you a limited, non-exclusive, non-transferable, revocable license to download, install, and use the Software and its documentation (“Software”) solely for internal evaluation and non-production development within your organization. No right is granted to deploy the Software in production, provide it as a service to third parties, or use it for any commercial purpose.

2. Restrictions
   You shall not, and shall not permit anyone to:
   (a) use the Software in production or for any commercial or revenue-generating purpose;
   (b) disclose, publish, distribute, sell, sublicense, rent, lease, host, or otherwise make the Software available to any third party;
   (c) modify, translate, adapt, merge, or create derivative works of the Software, except to the extent strictly necessary for internal evaluation;
   (d) reverse engineer, decompile, or disassemble the Software, except as expressly permitted by applicable law notwithstanding this limitation;
   (e) remove or alter any proprietary notices or marks on or within the Software;
   (f) publish or disclose performance or benchmarking results regarding the Software without Licensor’s prior written consent.

3. Ownership
   The Software is licensed, not sold. Licensor retains all right, title, and interest in and to the Software, including all intellectual property rights. No implied licenses are granted.

4. Feedback
   If you provide feedback, ideas, or suggestions (“Feedback”), you grant Licensor a perpetual, irrevocable, worldwide, royalty-free license to use such Feedback for any purpose.

5. Confidentiality
   The Software, documentation, and any non-public information disclosed by Licensor are Licensor’s confidential information. You must protect them with at least the same degree of care you use for your own confidential information and not less than a reasonable degree of care.

6. Term and Termination
   This Agreement remains in effect until terminated. Licensor may terminate it at any time upon notice if you breach it or at Licensor’s discretion for evaluation program changes. Upon termination, you must immediately cease all use of the Software and destroy all copies.

7. Disclaimers
   THE SOFTWARE IS PROVIDED “AS IS” AND “AS AVAILABLE”, WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.

8. Limitation of Liability
   TO THE MAXIMUM EXTENT PERMITTED BY LAW, LICENSOR SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, REVENUE, DATA, OR GOODWILL, EVEN IF ADVISED OF THE POSSIBILITY. LICENSOR’S TOTAL LIABILITY UNDER THIS AGREEMENT SHALL NOT EXCEED ONE HUNDRED (100) USD OR THE AMOUNT YOU PAID FOR THE SOFTWARE (IF ANY), WHICHEVER IS GREATER.

9. Export and Compliance
   You agree to comply with all applicable laws and regulations, including export control and sanctions laws.

10. General
    If any provision is held unenforceable, it will be modified to the minimum extent necessary to be enforceable, and the remainder will remain in effect. This Agreement constitutes the entire agreement regarding the evaluation license and supersedes all prior discussions.

For commercial/production licensing, contact:

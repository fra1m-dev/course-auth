# Auth Service

NestJS микросервис аутентификации/авторизации. Работает как RMQ RPC + небольшой
HTTP сервер для health-check. Выдает пары JWT (access/refresh), хранит хеш
refresh-токена и умеет логин по паролю.

## Содержание

- [О сервисе](#о-сервисе)
- [Архитектура](#архитектура)
- [Токены и безопасность](#токены-и-безопасность)
- [RPC контракты (RabbitMQ)](#rpc-контракты-rabbitmq)
- [HTTP endpoints](#http-endpoints)
- [Переменные окружения](#переменные-окружения)
- [Структура БД](#структура-бд)
- [Структура проекта](#структура-проекта)
- [Быстрый старт](#быстрый-старт)
- [Docker](#docker)
- [Тесты и линт](#тесты-и-линт)
- [CI/CD](#cicd)
- [Лицензия](#лицензия)

## О сервисе

- RMQ контракты для выдачи/валидации токенов и логина по паролю.
- Access/Refresh JWT RS256, `jti` в обоих токенах.
- Refresh токен хранится только в виде хеша (bcrypt от HMAC значения).
- Пароли хешируются через bcrypt.
- HTTP эндпойнты только для health-probe.
- Логи через Pino, чувствительные поля редактируются.

## Архитектура

- NestJS приложение: HTTP + RMQ microservice в одном процессе.
- Transport: RabbitMQ, очередь `RMQ_AUTH_QUEUE` (по умолчанию `auth`).
- База: Postgres, TypeORM, `autoLoadEntities`, `synchronize` включен вне
  production.
- Логирование:
  - HTTP: `nestjs-pino`
  - RMQ: `RmqLoggingInterceptor` логирует начало/конец/ошибки.

## Токены и безопасность

- **Access**: RS256, TTL `JWT_ACCESS_TTL` (по умолчанию `30m`).
- **Refresh**: RS256, TTL `JWT_REFRESH_TTL` (по умолчанию `30d`).
- **Хранение refresh**: в БД хранится `bcrypt(HMAC(refresh, TOKEN_PEPPER))`,
  сам токен не сохраняется.
- **Пароли**: `bcrypt` с `SALT_ROUNDS` (по умолчанию 12).

Ключи можно передавать тремя способами (любой один):

- `*_PATH` - путь до PEM файла.
- `*_B64` - содержимое PEM в base64.
- `*` - inline PEM, допускаются `\n` в .env.

Если хотите использовать одну пару ключей для access и refresh - просто
продублируйте значения.

## RPC контракты (RabbitMQ)

Формат сообщения Nest RMQ:

```json
{ "pattern": "auth.generateTokens", "data": { ... } }
```

Все запросы принимают `meta.requestId` (опционально, используется для логов).

### auth.generateTokens

Выдает пару токенов и сохраняет refresh-хеш.

Request:

```json
{
  "meta": { "requestId": "req-1" },
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "Alice",
    "role": "STUDENT",
    "specializationId": 10
  },
  "password": "optional"
}
```

Response:

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "accessJti": "...",
  "refreshJti": "...",
  "accessTtlSec": 1800,
  "refreshTtlSec": 2592000
}
```

### auth.validateAccess

Request:

```json
{ "meta": { "requestId": "req-2" }, "token": "..." }
```

Response:

```json
{ "userId": 1 }
```

### auth.validateRefresh

Request:

```json
{ "meta": { "requestId": "req-3" }, "token": "..." }
```

Response:

```json
{ "userId": 1 }
```

### auth.authByPassword

Проверяет пароль пользователя и выдает токены.

Request:

```json
{ "meta": { "requestId": "req-4" }, "user": { ... }, "password": "pass123" }
```

Response: как в `auth.generateTokens`.

### auth.createCredentials

Создает/обновляет пароль пользователя.

Request:

```json
{ "meta": { "requestId": "req-5" }, "userId": 1, "password": "pass123" }
```

Response:

```json
{ "ok": true }
```

### auth.removeToken

Отзывает refresh токен.

Request:

```json
{ "meta": { "requestId": "req-6" }, "refreshToken": "..." }
```

Response:

```json
true
```

В `src/contracts/auth.patterns.ts` есть дополнительные паттерны, но в
контроллере сейчас реализованы только перечисленные выше.

## HTTP endpoints

- `GET /health/live`
- `GET /health/ready`

## Переменные окружения

### Базовые

- `NODE_ENV` - `development|test|production`, по умолчанию `development`.
- `PORT` - HTTP порт, по умолчанию `3003`.
- `SERVICE_NAME`, `SERVICE_VERSION` - подпись в логах.
- `LOG_LEVEL` - уровень логов, по умолчанию `info`.
- `LOG_PRETTY` - `true` для pretty логов в dev.

### RabbitMQ

- `RABBITMQ_URL` - URL брокера (обязательно).
- `RMQ_AUTH_QUEUE` - имя очереди, по умолчанию `auth`.
- `RMQ_PREFETCH` - prefetch, по умолчанию `16`.
- `RMQ_DLX` - dead-letter exchange, по умолчанию `dlx`.
- `RMQ_MESSAGE_TTL_MS` - TTL сообщений (мс), опционально.
- `RMQ_MAX_LENGTH` - максимальная длина очереди, опционально.

Важно: сервис читает `RABBITMQ_URL` и `RMQ_AUTH_QUEUE` (не `RMQ_URL`/`AUTH_QUEUE`).

### Postgres

- `POSTGRES_HOST`
- `POSTGRES_PORT` (по умолчанию `5432`)
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `DATABASE_URL` - если задан, используется вместо отдельных полей.

### JWT

Access:

- `JWT_PRIVATE_KEY_PATH` / `JWT_PRIVATE_KEY` / `JWT_PRIVATE_KEY_B64`
- `JWT_PUBLIC_KEY_PATH` / `JWT_PUBLIC_KEY` / `JWT_PUBLIC_KEY_B64`

Refresh:

- `JWT_REFRESH_PRIVATE_KEY_PATH` / `JWT_REFRESH_PRIVATE_KEY` / `JWT_REFRESH_PRIVATE_KEY_B64`
- `JWT_REFRESH_PUBLIC_KEY_PATH` / `JWT_REFRESH_PUBLIC_KEY` / `JWT_REFRESH_PUBLIC_KEY_B64`

TTL и безопасность:

- `JWT_ACCESS_TTL` - например `30m`, `900`, `1h`.
- `JWT_REFRESH_TTL` - например `30d`.
- `TOKEN_PEPPER` - секрет для HMAC refresh токена (рекомендуется).
- `SALT_ROUNDS` - раунды bcrypt, по умолчанию `12`.

Примечание: `JWT_REFRESH_SECRET` не используется - refresh подписывается RS256
ключом.

## Структура БД

Таблица `token`:

| колонка | тип | примечание |
| --- | --- | --- |
| id | serial PK | |
| token | varchar(512) | bcrypt(HMAC(refresh)) |
| userId | int, unique | id пользователя |
| passwordHash | varchar(255) | bcrypt |
| created_at | timestamptz | now() |

## Структура проекта

```
src/
  app.module.ts
  main.ts
  config/validation.ts
  contracts/auth.patterns.ts
  common/logger/
  modules/
    auth/
      auth.controller.ts
      auth.service.ts
      entities/auth.entity.ts
    health/
```

## Быстрый старт

### Локально

```bash
npm ci
# Создай .env и положи ключи (см. раздел "Переменные окружения")
npm run start:dev
curl http://localhost:3003/health/live
```

### Пример .env (минимум)

```env
NODE_ENV=development
PORT=3003

RABBITMQ_URL=amqp://dev:dev@localhost:5672
RMQ_AUTH_QUEUE=auth

POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=auth_db
POSTGRES_USER=auth
POSTGRES_PASSWORD=auth

JWT_PRIVATE_KEY_PATH=./keys/access-private.pem
JWT_PUBLIC_KEY_PATH=./keys/access-public.pem
JWT_REFRESH_PRIVATE_KEY_PATH=./keys/refresh-private.pem
JWT_REFRESH_PUBLIC_KEY_PATH=./keys/refresh-public.pem

TOKEN_PEPPER=change-me
SALT_ROUNDS=12
```

## Docker

```bash
docker build -t auth:dev .
docker run --env-file .env -p 3003:3003 auth:dev
```

Для полноценного запуска нужны RabbitMQ и Postgres (можно использовать
docker-compose).

## Тесты и линт

```bash
npm test
npm run lint
```

## CI/CD

- PR и пуш в `main`: Lint/Build/Test.
- Тег `v*.*.*`: сборка и пуш Docker образа + публикация GitHub Release.
- После пуша в `main` workflow может создавать issues из `todos.md`.

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

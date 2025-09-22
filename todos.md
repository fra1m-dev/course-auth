### TODOs
| Filename | line # | TODO |
|:------|:------:|:------|
| [src/app.module.ts](src/app.module.ts#L23) | 23 | Использовать когда перейдешь на урл к бд |
| [src/config/validation.ts](src/config/validation.ts#L23) | 23 | Убрать Postgres переменные и оставить только ссылку на бд, так же в .env тоже изменить |
| [src/modules/auth/auth.controller.ts](src/modules/auth/auth.controller.ts#L2) | 2 | Обернуть в try/catch generateTokens, createCredentials, |
| [src/modules/auth/auth.service.ts](src/modules/auth/auth.service.ts#L1) | 1 | Сделать логику обновления токена после создания едпоинта авторизации |
| [src/modules/auth/auth.service.ts](src/modules/auth/auth.service.ts#L103) | 103 | Сделать логику смены пароля (скопированно из микр. users) - после создания ендпоинта авторизации |

### FIXMEs
| Filename | line # | FIXME |
|:------|:------:|:------|
| [src/modules/auth/auth.controller.ts](src/modules/auth/auth.controller.ts#L1) | 1 | Исправить у едпоинтов данные на прием - сюда поступает json из оркестатора |
| [src/modules/auth/test/auth.service.spec.ts](src/modules/auth/test/auth.service.spec.ts#L1) | 1 | Раскомить и перепиши тесты |

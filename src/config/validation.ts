import * as Joi from 'joi';

export const envSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),

  // RMQ
  RABBITMQ_URL: Joi.string().uri().required(),
  RMQ_AUTH_QUEUE: Joi.string().default('auth'),
  RMQ_PREFETCH: Joi.number().integer().min(1).default(16),

  // HTTP
  PORT: Joi.number().integer().default(3003),

  // Postgres (если используешь поля отдельно)
  POSTGRES_HOST: Joi.string().required(),
  POSTGRES_PORT: Joi.number().integer().default(5433),
  POSTGRES_DB: Joi.string().required(),
  POSTGRES_USER: Joi.string().required(),
  POSTGRES_PASSWORD: Joi.string().allow('').required(),

  //TODO: Убрать Postgres переменные и оставить только ссылку на бд, так же в .env тоже изменить
  // DATABASE_URL: Joi.string().uri().required(),
});

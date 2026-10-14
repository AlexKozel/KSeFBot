-- Пользователи бота и ответы онбординга (лист ожидания).
-- Храним минимум: Telegram ID, язык и ответы. Без имён и телефонов.

CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  telegram_id   BIGINT NOT NULL UNIQUE,
  lang          TEXT NOT NULL CHECK (lang IN ('ru', 'uk')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE onboarding_answers (
  user_id       BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tax_form      TEXT CHECK (tax_form IN ('ryczalt', 'liniowy', 'skala', 'unknown')),
  vat           TEXT CHECK (vat IN ('yes', 'no', 'unknown')),
  zus           TEXT CHECK (zus IN ('ulga_na_start', 'preferencyjny', 'pelny', 'unknown')),
  completed_at  TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

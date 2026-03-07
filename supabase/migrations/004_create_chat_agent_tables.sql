-- 004_create_chat_agent_tables.sql
-- Tables for conversational AI agent (Telegram + Web chat)

-- ============================================================
-- 1. telegram_links — account linking codes
-- ============================================================
CREATE TABLE public.telegram_links (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  code       TEXT UNIQUE NOT NULL,
  user_id    TEXT NOT NULL,
  chat_id    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 hour')
);

CREATE INDEX idx_telegram_links_code ON public.telegram_links(code);
CREATE INDEX idx_telegram_links_chat_id ON public.telegram_links(chat_id);
CREATE INDEX idx_telegram_links_user_id ON public.telegram_links(user_id);

-- ============================================================
-- 2. price_alerts — user price alerts
-- ============================================================
CREATE TABLE public.price_alerts (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id    TEXT NOT NULL,
  model_name TEXT NOT NULL,
  threshold  DOUBLE PRECISION NOT NULL,
  condition  TEXT NOT NULL CHECK (condition IN ('below', 'above')),
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_price_alerts_user ON public.price_alerts(user_id);
CREATE INDEX idx_price_alerts_active ON public.price_alerts(active) WHERE active = true;

-- ============================================================
-- 3. chat_sessions — conversation history
-- ============================================================
CREATE TABLE public.chat_sessions (
  id        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id   TEXT,
  chat_id   TEXT NOT NULL,
  platform  TEXT NOT NULL CHECK (platform IN ('telegram', 'web')),
  messages  JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_sessions_chat_id ON public.chat_sessions(chat_id);
CREATE INDEX idx_chat_sessions_user_id ON public.chat_sessions(user_id);

-- ============================================================
-- RLS policies
-- ============================================================
ALTER TABLE public.telegram_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (functions use service role)
-- No direct client access needed for these tables

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Zones ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zones (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  city        TEXT        NOT NULL DEFAULT 'Yaoundé',
  region      TEXT        NOT NULL DEFAULT 'Centre',
  total_kg    NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  google_id       TEXT        UNIQUE,
  email           TEXT        UNIQUE NOT NULL,
  name            TEXT,
  picture         TEXT,
  phone           TEXT,
  password        TEXT,                          -- nullable: Google users have no password
  role            TEXT        NOT NULL DEFAULT 'user',  -- user | collector | recycler | ngo | admin
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  points_balance  INTEGER     NOT NULL DEFAULT 0,
  zone_id         UUID        REFERENCES zones(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Waste listings ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS waste_listings (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  waste_type              TEXT        NOT NULL,
  sub_category            TEXT,
  quantity_kg             NUMERIC(10,2) NOT NULL CHECK (quantity_kg > 0),
  latitude                NUMERIC(10,6) NOT NULL,
  longitude               NUMERIC(10,6) NOT NULL,
  zone_id                 UUID        REFERENCES zones(id) ON DELETE SET NULL,
  pickup_window_start     TIMESTAMPTZ,
  pickup_window_end       TIMESTAMPTZ NOT NULL,
  ai_price_suggested      NUMERIC(12,2),
  ai_recyclability_score  INTEGER     CHECK (ai_recyclability_score BETWEEN 0 AND 100),
  final_price             NUMERIC(12,2),
  status                  TEXT        NOT NULL DEFAULT 'available',
                                      -- available | matched | collected | cancelled
  image_url               TEXT,
  description             TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Listing matches (AI-matched buyers) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS listing_matches (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  UUID    NOT NULL REFERENCES waste_listings(id) ON DELETE CASCADE,
  buyer_id    UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fit_score   INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (listing_id, buyer_id)
);

-- ── Transactions ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      UUID        NOT NULL REFERENCES waste_listings(id) ON DELETE RESTRICT,
  seller_id       UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  collector_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
  buyer_id        UUID        REFERENCES users(id) ON DELETE SET NULL,
  weight_verified NUMERIC(10,2) NOT NULL CHECK (weight_verified > 0),
  price_paid      NUMERIC(12,2) NOT NULL DEFAULT 0,
  points_awarded  INTEGER     NOT NULL DEFAULT 0,
  completed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Points ledger ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS points_ledger (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta         INTEGER NOT NULL,
  reason        TEXT    NOT NULL,  -- listing_created | collection_confirmed | bonus | redemption
  reference_id  UUID,
  balance_after INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_waste_listings_user_id   ON waste_listings(user_id);
CREATE INDEX IF NOT EXISTS idx_waste_listings_zone_id   ON waste_listings(zone_id);
CREATE INDEX IF NOT EXISTS idx_waste_listings_status    ON waste_listings(status);
CREATE INDEX IF NOT EXISTS idx_transactions_listing_id  ON transactions(listing_id);
CREATE INDEX IF NOT EXISTS idx_transactions_seller_id   ON transactions(seller_id);
CREATE INDEX IF NOT EXISTS idx_transactions_completed   ON transactions(completed_at);
CREATE INDEX IF NOT EXISTS idx_points_ledger_user_id    ON points_ledger(user_id);

-- ── Seed zones ────────────────────────────────────────────────────────────────
INSERT INTO zones (id, name, city, region) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Biyem-Assi',   'Yaoundé', 'Centre'),
  ('22222222-2222-2222-2222-222222222222', 'Bastos',        'Yaoundé', 'Centre'),
  ('33333333-3333-3333-3333-333333333333', 'Mvan',          'Yaoundé', 'Centre'),
  ('44444444-4444-4444-4444-444444444444', 'Nkolfoulou',    'Yaoundé', 'Centre'),
  ('55555555-5555-5555-5555-555555555555', 'Tsinga',        'Yaoundé', 'Centre'),
  ('66666666-6666-6666-6666-666666666666', 'Ngousso',       'Yaoundé', 'Centre'),
  ('77777777-7777-7777-7777-777777777777', 'Emana',         'Yaoundé', 'Centre'),
  ('88888888-8888-8888-8888-888888888888', 'Odza',          'Yaoundé', 'Centre'),
  ('99999999-9999-9999-9999-999999999999', 'Akwa',          'Douala',  'Littoral'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Bonanjo',       'Douala',  'Littoral')
ON CONFLICT DO NOTHING;
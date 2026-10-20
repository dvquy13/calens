-- Single-row snapshot, updated daily by the cron Edge Function
CREATE TABLE metrics_latest (
  id           int PRIMARY KEY DEFAULT 1,
  users        jsonb,  -- { total, trial, active, cancelled, expired, new_7d, new_30d }
  revenue      jsonb,  -- { mrr, total_revenue, monthly_count, annual_count, lifetime_count }
  website      jsonb,  -- { visitors_7d, visitors_30d, pricing_views_7d, checkout_clicks_7d }
  generated_at timestamptz
);

-- One row per day — 30-day rolling history
CREATE TABLE metrics_snapshots (
  date         date PRIMARY KEY,
  users        jsonb,
  revenue      jsonb,
  website      jsonb,
  generated_at timestamptz
);

-- Install counter, single row
CREATE TABLE installs (
  id    int PRIMARY KEY DEFAULT 1,
  total int DEFAULT 0,
  daily jsonb DEFAULT '{}'  -- { "2026-03-14": 3, ... }
);

-- Seed the single rows so UPDATE always finds a row
INSERT INTO metrics_latest (id) VALUES (1);
INSERT INTO installs (id) VALUES (1);

-- RLS: anon can read all three tables; writes blocked from anon
ALTER TABLE metrics_latest    ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE installs           ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read" ON metrics_latest    FOR SELECT USING (true);
CREATE POLICY "public read" ON metrics_snapshots FOR SELECT USING (true);
CREATE POLICY "public read" ON installs           FOR SELECT USING (true);
-- No INSERT/UPDATE/DELETE policies → anon writes are blocked

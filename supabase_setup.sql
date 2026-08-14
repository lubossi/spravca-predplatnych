-- ============================================================
--  Správca predplatných – Supabase SQL schéma
--  Spustite tento SQL v Supabase → SQL Editor → New Query
-- ============================================================

-- Hlavná tabuľka pre predplatné
CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0,
    billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
    category TEXT NOT NULL DEFAULT 'Iné',
    payment_method TEXT DEFAULT 'Platebná karta',
    next_payment_date DATE NOT NULL,
    color TEXT DEFAULT '#6366f1',
    notes TEXT DEFAULT '',
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Automatická aktualizácia updated_at pri zmene záznamu
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Indexy pre rýchlejšie dotazy
CREATE INDEX IF NOT EXISTS idx_subscriptions_next_payment ON subscriptions (next_payment_date ASC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_category ON subscriptions (category);
CREATE INDEX IF NOT EXISTS idx_subscriptions_active ON subscriptions (active);

-- ============================================================
--  Row Level Security (RLS) – Verejný prístup pre personal app
--  (Pre viacerých používateľov pridajte auth.uid() podmienky)
-- ============================================================
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Politika: Neautentifikovaný prístup je povolený (personal app)
CREATE POLICY "Allow all for anonymous users"
    ON subscriptions
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- ============================================================
--  Demo dáta – Predpopulujte tabuľku ukážkovými predplatnými
-- ============================================================
INSERT INTO subscriptions (id, name, price, billing_cycle, category, payment_method, next_payment_date, color, notes, active)
VALUES
    ('sub_demo_1', 'Netflix Premium', 17.99, 'monthly', 'Zábava', 'Platebná karta', CURRENT_DATE + INTERVAL '3 days', '#e50914', '4K Ultra HD rodinné konto', true),
    ('sub_demo_2', 'Spotify Family', 10.99, 'monthly', 'Zábava', 'PayPal', CURRENT_DATE + INTERVAL '11 days', '#1db954', 'Pre 6 členov rodiny', true),
    ('sub_demo_3', 'Optický Internet Telekom', 22.90, 'monthly', 'Domácnosť', 'Bankový prevod', CURRENT_DATE + INTERVAL '1 days', '#e20074', 'Rýchlosť 500/50 Mbps', true),
    ('sub_demo_4', 'Posilňovňa GymBeam', 29.00, 'monthly', 'Zdravie', 'Platebná karta', CURRENT_DATE + INTERVAL '6 days', '#f59e0b', 'Mesačné členstvo bez viazanosti', true),
    ('sub_demo_5', 'ChatGPT Plus (OpenAI)', 20.00, 'monthly', 'Nástroje', 'Apple Pay', CURRENT_DATE + INTERVAL '18 days', '#10a37f', 'GPT-4o a generovanie obrázkov', true),
    ('sub_demo_6', 'Adobe Creative Cloud', 380.00, 'yearly', 'Práca', 'Platebná karta', CURRENT_DATE + INTERVAL '45 days', '#ff0000', 'Ročné predplatné pre grafiku', true),
    ('sub_demo_7', 'iCloud+ 200GB', 2.99, 'monthly', 'Nástroje', 'Apple Pay', CURRENT_DATE + INTERVAL '2 days', '#3b82f6', 'Zálohovanie fotiek a iPhone', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
--  Správca predplatných – Supabase SQL schéma s Auth & RLS
--  Spustite tento SQL v Supabase → SQL Editor → New Query
-- ============================================================

-- Hlavná tabuľka pre predplatné s user_id
CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0,
    billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
    category TEXT NOT NULL DEFAULT 'Iné',
    payment_method TEXT DEFAULT 'Platobná karta',
    next_payment_date DATE NOT NULL,
    color TEXT DEFAULT '#6366f1',
    notes TEXT DEFAULT '',
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Pridanie stĺpca user_id ak tabuľka už existuje
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'subscriptions' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE subscriptions ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Automatická aktualizácia updated_at pri zmene záznamu
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS subscriptions_updated_at ON subscriptions;
CREATE TRIGGER subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Indexy pre rýchlejšie dotazy
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_next_payment ON subscriptions (next_payment_date ASC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_category ON subscriptions (category);
CREATE INDEX IF NOT EXISTS idx_subscriptions_active ON subscriptions (active);

-- ============================================================
--  Row Level Security (RLS) – Autentifikovaní používatelia
-- ============================================================
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Odstránenie starých politík
DROP POLICY IF EXISTS "Allow all for anonymous users" ON subscriptions;
DROP POLICY IF EXISTS "Users can manage their own subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Users can view own subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Users can insert own subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Users can update own subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Users can delete own subscriptions" ON subscriptions;

-- Nová politika: Každý používateľ vidí a upravuje len svoje vlastné záznamy
CREATE POLICY "Users can manage their own subscriptions"
    ON subscriptions
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ============================================================
--  História zrealizovaných platieb (Payment History)
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_history (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    subscription_id TEXT,
    name TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0,
    category TEXT NOT NULL DEFAULT 'Iné',
    payment_method TEXT DEFAULT 'Platobná karta',
    payment_date DATE NOT NULL,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexy pre históriu
CREATE INDEX IF NOT EXISTS idx_payment_history_user_id ON payment_history (user_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_date ON payment_history (payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payment_history_category ON payment_history (category);

-- RLS pre históriu
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own payment history" ON payment_history;
CREATE POLICY "Users can manage their own payment history"
    ON payment_history
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


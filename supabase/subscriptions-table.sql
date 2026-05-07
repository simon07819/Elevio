-- ═══════════════════════════════════════════════════════════════════════════
-- subscriptions: tracks every active/past subscription with provider info
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'revenuecat', 'admin', 'activation_code', 'manual')),
  provider_subscription_id TEXT,
  provider_customer_id TEXT,
  plan_id TEXT NOT NULL DEFAULT 'starter' CHECK (plan_id IN ('free', 'starter', 'pro', 'business', 'enterprise')),
  billing_period TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_period IN ('monthly', 'annual', 'one_time')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'expired', 'paused', 'incomplete')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  trial_end TIMESTAMPTZ,
  price_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, provider, provider_subscription_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider ON subscriptions (provider);
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_sub ON subscriptions (provider_subscription_id) WHERE provider_subscription_id IS NOT NULL;

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own subscriptions" ON subscriptions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "superadmin read subscriptions" ON subscriptions
  FOR SELECT USING (is_superadmin());

CREATE POLICY "superadmin manage subscriptions" ON subscriptions
  FOR ALL USING (is_superadmin())
  WITH CHECK (is_superadmin());

CREATE POLICY "users insert own subscriptions" ON subscriptions
  FOR INSERT WITH CHECK (user_id = auth.uid() OR is_superadmin());

DROP TRIGGER IF EXISTS set_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER set_subscriptions_updated_at
BEFORE UPDATE ON subscriptions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

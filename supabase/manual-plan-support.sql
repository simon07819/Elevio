-- ── Manual plan attribution support ──────────────────────────────────────
-- Adds 'manual' as a valid activated_via and provider value so superadmin
-- can manually assign plans to members (e.g. offline deal payments).

-- 1. Allow 'manual' in user_entitlements.activated_via
ALTER TABLE user_entitlements
  DROP CONSTRAINT IF EXISTS user_entitlements_activated_via_check;

ALTER TABLE user_entitlements
  ADD CONSTRAINT user_entitlements_activated_via_check
  CHECK (activated_via IN ('default', 'iap', 'activation_code', 'admin', 'manual'));

-- 2. Allow 'manual' in subscriptions.provider
ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_provider_check;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_provider_check
  CHECK (provider IN ('stripe', 'revenuecat', 'admin', 'activation_code', 'manual'));

-- 3. Allow 'one_time' in subscriptions.billing_period (manual plans are one-time)
ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_billing_period_check;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_billing_period_check
  CHECK (billing_period IN ('monthly', 'annual', 'one_time'));

-- 4. Superadmin can delete app_errors (for "Vider les logs" button)
CREATE POLICY "superadmin delete app_errors" ON app_errors
  FOR DELETE USING (is_superadmin());

-- Migration: align support_messages.type with English keys
-- The API and frontend now send English values (technical, general, etc.)
-- instead of French labels (Problème technique, Question générale, etc.)
--
-- This migration:
-- 1. Adds a CHECK constraint for English keys only
-- 2. Updates existing rows from French labels to English keys
-- 3. Changes the default from 'Question générale' to 'general'

-- Step 1: Update existing rows from French to English
UPDATE support_messages
SET type = CASE type
  WHEN 'Problème technique' THEN 'technical'
  WHEN 'Question générale' THEN 'general'
  WHEN 'Paiement / abonnement' THEN 'payment'
  WHEN 'Compte / accès' THEN 'account'
  WHEN 'Sécurité chantier' THEN 'safety'
  WHEN 'Autre' THEN 'other'
  ELSE type
END
WHERE type IN ('Problème technique', 'Question générale', 'Paiement / abonnement', 'Compte / accès', 'Sécurité chantier', 'Autre');

-- Step 2: Drop any existing CHECK constraint on type (if any)
-- (There was none before, but be safe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'support_messages'::regclass
    AND conname = 'support_messages_type_check'
  ) THEN
    ALTER TABLE support_messages DROP CONSTRAINT support_messages_type_check;
  END IF;
END $$;

-- Step 3: Add CHECK constraint for English keys
ALTER TABLE support_messages ADD CONSTRAINT support_messages_type_check
  CHECK (type IN ('technical', 'general', 'payment', 'account', 'safety', 'other'));

-- Step 4: Change the default value
ALTER TABLE support_messages ALTER COLUMN type SET DEFAULT 'general';

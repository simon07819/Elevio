-- Migration: Fix seed projects — assign owner_id to prevent cross-account visibility
--
-- Problem: Seed projects have NULL owner_id. They are visible to ALL users
-- because the public QR read policy shows active non-archived projects.
-- New clients see superadmin seed projects in their account.
--
-- Fix: Archive seed projects so they don't show up as public/active,
-- and set owner_id to the first superadmin profile if one exists.

-- Step 1: Archive seed projects so they don't appear for regular users
UPDATE projects
SET archived_at = now()
WHERE id IN (
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111112',
  '11111111-1111-1111-1111-111111111113'
)
AND archived_at IS NULL;

-- Step 2: Set owner_id on seed projects to the first superadmin (if exists)
-- This ensures only the superadmin sees these in their admin dashboard
UPDATE projects
SET owner_id = (
  SELECT p.id FROM profiles p
  WHERE p.account_role = 'superadmin'
  ORDER BY p.created_at ASC
  LIMIT 1
)
WHERE id IN (
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111112',
  '11111111-1111-1111-1111-111111111113'
)
AND owner_id IS NULL;

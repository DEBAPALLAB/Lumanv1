-- Fix the infinite recursion in organization_members RLS policy
-- The original policy was checking organization_members within organization_members, causing recursion

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view members of their organizations" ON organization_members;

-- Recreate with a simple direct check - users can only see their own membership records
-- This prevents the infinite recursion while still maintaining security
CREATE POLICY "Users can view their own organization memberships"
  ON organization_members FOR SELECT
  USING (user_id = auth.uid());

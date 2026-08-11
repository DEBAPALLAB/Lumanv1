-- Add invitation_code to organizations table
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS invitation_code TEXT;

-- Create an index for faster lookups (though we mainly look up by slug)
CREATE INDEX IF NOT EXISTS idx_organizations_invitation_code ON organizations(invitation_code);

-- Function to generate a random code (optional utility, mainly handled in app code)
CREATE OR REPLACE FUNCTION generate_invitation_code() RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Backfill existing organizations with a code if they don't have one
UPDATE organizations 
SET invitation_code = generate_invitation_code() 
WHERE invitation_code IS NULL;

-- Make it NOT NULL after backfill
ALTER TABLE organizations ALTER COLUMN invitation_code SET NOT NULL;

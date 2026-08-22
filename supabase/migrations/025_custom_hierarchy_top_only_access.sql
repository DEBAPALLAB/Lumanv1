-- Migrations 022/024 derived the legacy role text from hierarchy_level by
-- squashing it into three buckets (founder / admin / intern) for every org,
-- fixed or custom. For a custom hierarchy that's still wrong in spirit: a
-- 5-level Founder/Director/Manager/Employee/Intern ladder collapsed levels
-- 2-4 into one undifferentiated 'admin' bucket, granting Director, Manager
-- and Employee identical admin-dashboard access even though they're
-- distinct ranks the org owner deliberately defined.
--
-- Decision: for custom hierarchies there is no canonical "admin" tier at
-- all. Only the actual top of that org's own ladder (hierarchy_level = 1)
-- gets founder-equivalent access; every other level is base/intern access,
-- regardless of how many levels exist or what they're named. Fixed
-- ("standard") hierarchies are untouched — their three tiers are the
-- intended product, not an artifact of this mapping.

CREATE OR REPLACE FUNCTION sync_member_roles()
RETURNS TRIGGER AS $$
DECLARE
    v_role_level INT;
    v_role_id UUID;
    v_org_type TEXT;
BEGIN
    SELECT hierarchy_type INTO v_org_type FROM organizations WHERE id = NEW.organization_id;

    -- Ensure roles exist for this organization
    IF NOT EXISTS (SELECT 1 FROM roles WHERE organization_id = NEW.organization_id) THEN
        BEGIN
            INSERT INTO roles (organization_id, role_name, hierarchy_level) VALUES
                (NEW.organization_id, 'Founder', 1),
                (NEW.organization_id, 'Admin', 2),
                (NEW.organization_id, 'Intern', 3);
        EXCEPTION WHEN unique_violation THEN
            NULL;
        END;
    END IF;

    -- Case 1: NEW.assigned_role_id is NULL, but a legacy role tier was
    -- provided. "founder" always means the org's actual top tier (level 1);
    -- anything else falls to the org's actual bottom tier. The 'admin'
    -- branch is fixed-hierarchy-oriented (no real caller passes role
    -- text 'admin' without an assigned_role_id today) and is left as a
    -- defensive fallback rather than removed.
    IF NEW.assigned_role_id IS NULL AND NEW.role IS NOT NULL THEN
        IF LOWER(NEW.role) = 'founder' THEN
            SELECT id INTO v_role_id FROM roles
            WHERE organization_id = NEW.organization_id
            ORDER BY hierarchy_level ASC LIMIT 1;
        ELSIF LOWER(NEW.role) = 'admin' THEN
            SELECT id INTO v_role_id FROM roles
            WHERE organization_id = NEW.organization_id AND hierarchy_level = 2;
            IF v_role_id IS NULL THEN
                SELECT id INTO v_role_id FROM roles
                WHERE organization_id = NEW.organization_id
                ORDER BY hierarchy_level ASC LIMIT 1;
            END IF;
        ELSE
            SELECT id INTO v_role_id FROM roles
            WHERE organization_id = NEW.organization_id
            ORDER BY hierarchy_level DESC LIMIT 1;
        END IF;

        NEW.assigned_role_id := v_role_id;
    END IF;

    -- Case 2: NEW.assigned_role_id is provided — sync the legacy text
    -- column. Custom hierarchies: top level only gets 'founder', every
    -- other level is 'intern' — no middle 'admin' bucket. Fixed
    -- hierarchies: unchanged three-tier mapping.
    IF NEW.assigned_role_id IS NOT NULL THEN
        SELECT hierarchy_level INTO v_role_level FROM roles WHERE id = NEW.assigned_role_id;
        IF v_role_level IS NOT NULL THEN
            IF v_org_type = 'custom' THEN
                IF v_role_level = 1 THEN
                    NEW.role := 'founder';
                ELSE
                    NEW.role := 'intern';
                END IF;
            ELSE
                IF v_role_level = 1 THEN
                    NEW.role := 'founder';
                ELSIF v_role_level = 2 THEN
                    NEW.role := 'admin';
                ELSE
                    NEW.role := 'intern';
                END IF;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Backfill: re-derive every custom-hierarchy member's legacy role text under
-- the new top-only rule. Fixed-hierarchy members are untouched (their
-- mapping didn't change).
UPDATE organization_members om
SET role = CASE WHEN r.hierarchy_level = 1 THEN 'founder' ELSE 'intern' END
FROM roles r
JOIN organizations o ON o.id = r.organization_id
WHERE om.assigned_role_id = r.id
  AND o.hierarchy_type = 'custom'
  AND om.role IS DISTINCT FROM (
    CASE WHEN r.hierarchy_level = 1 THEN 'founder' ELSE 'intern' END
  );

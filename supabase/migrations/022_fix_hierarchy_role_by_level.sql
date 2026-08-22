-- sync_member_roles() (migration 008) resolves a member's role by matching
-- role NAME to the legacy "founder"/"admin"/else text column, and
-- conversely derives that text column from the assigned role's NAME. That's
-- wrong the moment a custom hierarchy's role names don't line up with their
-- position: naming a role "Founder" and placing it at the *bottom* of a
-- 5-level custom hierarchy still matches by name, so the member gets the
-- legacy 'founder' text regardless of hierarchy_level — and every admin
-- gate in the app (admin dashboard, workspace deletion, org settings, the
-- workspace founder-tier guard) reads that same text column, so they all
-- grant top-tier access to whoever it is actually assigned to. Fixed
-- ("standard") orgs are unaffected: their seeded roles are always exactly
-- Founder@1 / Admin@2 / Intern@3, so name and level already agree there.
--
-- Fix: resolve and derive purely by hierarchy_level, never by name.

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
            -- Another concurrent insert for this same brand-new org won the
            -- race and seeded the roles first.
            NULL;
        END;
    END IF;

    -- Case 1: NEW.assigned_role_id is NULL, but a legacy role tier was
    -- provided (e.g. addMemberToOrganization(..., "founder") at signup).
    -- "founder" means the org's actual top tier — hierarchy_level 1 —
    -- full stop, not "whichever role happens to be named Founder".
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
    -- column from the assigned role's actual hierarchy_level, not its
    -- name. This is what makes every existing `role === "founder"` /
    -- "admin" check throughout the app correct for custom hierarchies
    -- too, without touching each of those call sites individually.
    IF NEW.assigned_role_id IS NOT NULL THEN
        SELECT hierarchy_level INTO v_role_level FROM roles WHERE id = NEW.assigned_role_id;
        IF v_role_level IS NOT NULL THEN
            IF v_role_level = 1 THEN
                NEW.role := 'founder';
            ELSIF v_role_level = 2 THEN
                NEW.role := 'admin';
            ELSE
                NEW.role := 'intern';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Backfill: correct any already-persisted member whose legacy role text
-- disagrees with their assigned role's actual hierarchy_level — i.e. exactly
-- the state this bug already wrote to the database before this fix existed.
-- Fixed-hierarchy members are untouched: their computed value already
-- matches what they have, so the WHERE clause excludes them.
UPDATE organization_members om
SET role = CASE
    WHEN r.hierarchy_level = 1 THEN 'founder'
    WHEN r.hierarchy_level = 2 THEN 'admin'
    ELSE 'intern'
END
FROM roles r
WHERE om.assigned_role_id = r.id
  AND om.role IS DISTINCT FROM (
    CASE
      WHEN r.hierarchy_level = 1 THEN 'founder'
      WHEN r.hierarchy_level = 2 THEN 'admin'
      ELSE 'intern'
    END
  );

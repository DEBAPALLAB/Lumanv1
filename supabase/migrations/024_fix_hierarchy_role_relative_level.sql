-- Migration 022 derived the legacy role text from hierarchy_level with a
-- hardcoded rule: level 1 -> founder, level 2 -> admin, else -> intern. That
-- assumes every custom hierarchy has (at least) three tiers where level 2
-- really is a middle "admin" rank — but a hierarchy with only two levels
-- (e.g. Founder/Intern, no admin tier at all) has its *bottom* rank sitting
-- at level 2, not a middle one. A member assigned that bottom-tier role got
-- tagged 'admin' anyway, purely because their level number happened to be 2
-- — same root problem as migration 022 (a positional assumption baked into
-- the mapping), just one level deeper.
--
-- Fix: derive relative to each org's own actual lowest level (MAX(hierarchy_
-- level) for that org), not a literal "2". Top level is always founder,
-- bottom level is always intern, and anything strictly in between is admin
-- — which correctly collapses to "no admin tier" for a two-level hierarchy.

CREATE OR REPLACE FUNCTION sync_member_roles()
RETURNS TRIGGER AS $$
DECLARE
    v_role_level INT;
    v_max_level INT;
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
    -- provided. "founder" means the org's actual top tier (level 1);
    -- anything else falls to the org's actual bottom tier (highest level
    -- number) — both already relative to this org's own hierarchy, not a
    -- hardcoded position.
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
    -- column from the assigned role's hierarchy_level *relative to this
    -- org's own range*, not a hardcoded literal 2 for "admin".
    IF NEW.assigned_role_id IS NOT NULL THEN
        SELECT hierarchy_level INTO v_role_level FROM roles WHERE id = NEW.assigned_role_id;
        IF v_role_level IS NOT NULL THEN
            SELECT MAX(hierarchy_level) INTO v_max_level FROM roles WHERE organization_id = NEW.organization_id;

            IF v_role_level = 1 THEN
                NEW.role := 'founder';
            ELSIF v_role_level >= v_max_level THEN
                NEW.role := 'intern';
            ELSE
                NEW.role := 'admin';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Backfill: correct any already-persisted member whose legacy role text
-- disagrees with their assigned role's level relative to their own org's
-- range — exactly your friend's row right now.
UPDATE organization_members om
SET role = CASE
    WHEN r.hierarchy_level = 1 THEN 'founder'
    WHEN r.hierarchy_level >= mx.max_level THEN 'intern'
    ELSE 'admin'
END
FROM roles r
JOIN (
    SELECT organization_id, MAX(hierarchy_level) AS max_level
    FROM roles
    GROUP BY organization_id
) mx ON mx.organization_id = r.organization_id
WHERE om.assigned_role_id = r.id
  AND om.role IS DISTINCT FROM (
    CASE
      WHEN r.hierarchy_level = 1 THEN 'founder'
      WHEN r.hierarchy_level >= mx.max_level THEN 'intern'
      ELSE 'admin'
    END
  );

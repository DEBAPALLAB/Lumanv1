-- Migration 018 made roles(organization_id, hierarchy_level) DEFERRABLE to
-- fix role-reordering. That broke sync_member_roles() (migration 008)'s
-- role-seeding insert: Postgres refuses to use a deferrable unique
-- constraint as an ON CONFLICT arbiter, so ON CONFLICT DO NOTHING now fails
-- with "ON CONFLICT does not support deferrable unique constraints/exclusion
-- constraints as arbiters" — on every fixed-hierarchy org's first member
-- insert, i.e. every normal org signup.
--
-- Swapped for an explicit exception handler, which needs no arbiter and so
-- isn't affected by the constraint's deferrability. Still tolerates the same
-- race ON CONFLICT DO NOTHING guarded against — two concurrent first-member
-- inserts for the same brand-new org both passing the IF NOT EXISTS check
-- and both trying to seed the same three roles; the loser now hits the
-- exception handler instead of aborting the whole insert.

CREATE OR REPLACE FUNCTION sync_member_roles()
RETURNS TRIGGER AS $$
DECLARE
    v_role_name TEXT;
    v_role_id UUID;
    v_org_type TEXT;
BEGIN
    -- Get the organization hierarchy type
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

    -- Case 1: NEW.assigned_role_id is NULL, but role text is provided
    IF NEW.assigned_role_id IS NULL AND NEW.role IS NOT NULL THEN
        -- Try to match role text to role name (case insensitive)
        SELECT id INTO v_role_id
        FROM roles
        WHERE organization_id = NEW.organization_id
        AND LOWER(role_name) = LOWER(NEW.role);

        -- Fallback to Founder if 'founder', Admin if 'admin', otherwise Intern
        IF v_role_id IS NULL THEN
            IF LOWER(NEW.role) = 'founder' THEN
                SELECT id INTO v_role_id FROM roles WHERE organization_id = NEW.organization_id AND hierarchy_level = 1;
            ELSIF LOWER(NEW.role) = 'admin' THEN
                SELECT id INTO v_role_id FROM roles WHERE organization_id = NEW.organization_id AND hierarchy_level = 2;
            ELSE
                SELECT id INTO v_role_id FROM roles WHERE organization_id = NEW.organization_id AND hierarchy_level = 3;
            END IF;
        END IF;

        -- Final fallback: lowest hierarchy level role
        IF v_role_id IS NULL THEN
            SELECT id INTO v_role_id
            FROM roles
            WHERE organization_id = NEW.organization_id
            ORDER BY hierarchy_level DESC
            LIMIT 1;
        END IF;

        NEW.assigned_role_id := v_role_id;
    END IF;

    -- Case 2: NEW.assigned_role_id is provided, sync the text role column
    IF NEW.assigned_role_id IS NOT NULL THEN
        SELECT role_name INTO v_role_name FROM roles WHERE id = NEW.assigned_role_id;
        IF v_role_name IS NOT NULL THEN
            -- Map standard roles, default to 'intern' for others
            IF LOWER(v_role_name) = 'founder' THEN
                NEW.role := 'founder';
            ELSIF LOWER(v_role_name) = 'admin' THEN
                NEW.role := 'admin';
            ELSE
                NEW.role := 'intern';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

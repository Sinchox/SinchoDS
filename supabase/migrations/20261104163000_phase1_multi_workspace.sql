-- ==============================================================================
-- SinchoDS Phase 1.1: Secure Database & Multi-Workspace Foundation Migration
-- File: /supabase/migrations/20261104163000_phase1_multi_workspace.sql
-- 
-- Description:
--   Transforms the database schema into a production-grade multi-workspace architecture.
--   Enforces strict Role-Based Access Control (RBAC) across four roles:
--     - owner: Full control, delete/transfer workspace, manage members & roles
--     - admin: Full resource CRUD, manage members (cannot demote/remove owner)
--     - manager: Full resource CRUD (products, listings, suppliers, orders)
--     - viewer: Read-only access to products, suppliers, listings, and metrics
--   Replaces all permissive USING(true) policies with granular RLS policies.
--   Preserves all existing data by migrating records to a seeded default workspace.
--   Protects eBay credentials from frontend extraction.
--   Implements race-resistant initial workspace bootstrapping.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. Enable Required Extensions
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 2. Workspaces & Workspace Members Core Tables
-- ------------------------------------------------------------------------------

-- Workspaces table
CREATE TABLE IF NOT EXISTS public.workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspaces_slug ON public.workspaces (slug);
CREATE INDEX IF NOT EXISTS idx_workspaces_created_by ON public.workspaces (created_by);

-- Workspace members table with the 4 distinct roles
CREATE TABLE IF NOT EXISTS public.workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'viewer')),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT uq_workspace_members_user UNIQUE (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id ON public.workspace_members (user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_id ON public.workspace_members (workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_role ON public.workspace_members (workspace_id, role);

-- ------------------------------------------------------------------------------
-- 3. Default Workspace Seed (Data Preservation)
-- ------------------------------------------------------------------------------
-- Deterministic UUID to preserve all existing records during migration.
INSERT INTO public.workspaces (id, name, slug)
VALUES (
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Default Workspace',
    'default'
)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 4. Alter Existing Tables to Add workspace_id & Preserve Data
-- ------------------------------------------------------------------------------

-- 4.1 Suppliers: Supports both global reusable suppliers (workspace_id IS NULL)
--     and workspace-specific suppliers (workspace_id IS NOT NULL).
ALTER TABLE public.suppliers 
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_suppliers_workspace_id ON public.suppliers (workspace_id);

-- Ensure PlusPower remains as a global reusable supplier (workspace_id = NULL)
UPDATE public.suppliers 
SET workspace_id = NULL 
WHERE id = 'pluspower' AND workspace_id IS NOT NULL;

-- 4.2 Products
ALTER TABLE public.products 
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

UPDATE public.products 
SET workspace_id = '00000000-0000-0000-0000-000000000001'::uuid 
WHERE workspace_id IS NULL;

ALTER TABLE public.products ALTER COLUMN workspace_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_workspace_id ON public.products (workspace_id);

-- 4.3 eBay Listings
ALTER TABLE public.ebay_listings 
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

UPDATE public.ebay_listings 
SET workspace_id = '00000000-0000-0000-0000-000000000001'::uuid 
WHERE workspace_id IS NULL;

ALTER TABLE public.ebay_listings ALTER COLUMN workspace_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ebay_listings_workspace_id ON public.ebay_listings (workspace_id);

-- 4.4 eBay Accounts
ALTER TABLE public.ebay_accounts 
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

UPDATE public.ebay_accounts 
SET workspace_id = '00000000-0000-0000-0000-000000000001'::uuid 
WHERE workspace_id IS NULL;

ALTER TABLE public.ebay_accounts ALTER COLUMN workspace_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ebay_accounts_workspace_id ON public.ebay_accounts (workspace_id);

-- 4.5 Price History
ALTER TABLE public.price_history 
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

UPDATE public.price_history 
SET workspace_id = '00000000-0000-0000-0000-000000000001'::uuid 
WHERE workspace_id IS NULL;

ALTER TABLE public.price_history ALTER COLUMN workspace_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_price_history_workspace_id ON public.price_history (workspace_id);

-- 4.6 Orders
ALTER TABLE public.orders 
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

UPDATE public.orders 
SET workspace_id = '00000000-0000-0000-0000-000000000001'::uuid 
WHERE workspace_id IS NULL;

ALTER TABLE public.orders ALTER COLUMN workspace_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_workspace_id ON public.orders (workspace_id);

-- 4.7 Import History
ALTER TABLE public.import_history 
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

UPDATE public.import_history 
SET workspace_id = '00000000-0000-0000-0000-000000000001'::uuid 
WHERE workspace_id IS NULL;

ALTER TABLE public.import_history ALTER COLUMN workspace_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_import_history_workspace_id ON public.import_history (workspace_id);

-- ------------------------------------------------------------------------------
-- 5. Secure Helper Functions (Fixed search_path, SECURITY DEFINER)
-- ------------------------------------------------------------------------------

-- 5.1 Get user role in a workspace
CREATE OR REPLACE FUNCTION public.get_workspace_role(check_workspace_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    user_role TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT role INTO user_role
    FROM public.workspace_members
    WHERE workspace_id = check_workspace_id
      AND user_id = auth.uid();

    RETURN user_role;
END;
$$;

-- 5.2 Check if caller belongs to workspace
CREATE OR REPLACE FUNCTION public.is_workspace_member(check_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.workspace_members
        WHERE workspace_id = check_workspace_id
          AND user_id = auth.uid()
    );
$$;

-- 5.3 Check if caller has one of the allowed roles
CREATE OR REPLACE FUNCTION public.has_workspace_role(check_workspace_id UUID, required_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.workspace_members
        WHERE workspace_id = check_workspace_id
          AND user_id = auth.uid()
          AND role = ANY(required_roles)
    );
$$;

-- 5.4 Return all workspace IDs the user belongs to
CREATE OR REPLACE FUNCTION public.get_user_workspace_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
    SELECT workspace_id
    FROM public.workspace_members
    WHERE user_id = auth.uid();
$$;

-- Secure function permissions
REVOKE ALL ON FUNCTION public.get_workspace_role(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_workspace_member(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_workspace_role(UUID, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_workspace_ids() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_workspace_role(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_workspace_role(UUID, TEXT[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_workspace_ids() TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 6. Trigger: Prevent Non-Owners from Removing, Demoting, or Replacing Owners
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_workspace_member_safety()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    caller_id UUID;
    caller_role TEXT;
    target_workspace UUID;
    owner_count INTEGER;
BEGIN
    caller_id := auth.uid();

    -- Service role / automated system processes bypass
    IF caller_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    target_workspace := COALESCE(NEW.workspace_id, OLD.workspace_id);

    SELECT role INTO caller_role
    FROM public.workspace_members
    WHERE workspace_id = target_workspace
      AND user_id = caller_id;

    -- DELETE ACTION
    IF TG_OP = 'DELETE' THEN
        -- Prevent deleting an owner unless the caller is an owner
        IF OLD.role = 'owner' THEN
            IF caller_role IS DISTINCT FROM 'owner' THEN
                RAISE EXCEPTION 'Access Denied: Only a workspace owner can remove another owner.';
            END IF;

            -- Prevent leaving the workspace with 0 owners
            SELECT COUNT(*) INTO owner_count
            FROM public.workspace_members
            WHERE workspace_id = OLD.workspace_id
              AND role = 'owner';

            IF owner_count <= 1 THEN
                RAISE EXCEPTION 'Invalid Operation: A workspace must retain at least one owner.';
            END IF;
        END IF;

        -- Non-owners cannot delete an admin (unless admin is self-removing)
        IF OLD.role = 'admin' AND caller_role NOT IN ('owner') AND OLD.user_id <> caller_id THEN
            RAISE EXCEPTION 'Access Denied: Only an owner can remove an admin.';
        END IF;

        RETURN OLD;
    END IF;

    -- UPDATE ACTION
    IF TG_OP = 'UPDATE' THEN
        -- Prevent demoting or modifying an owner record unless caller is an owner
        IF OLD.role = 'owner' THEN
            IF caller_role IS DISTINCT FROM 'owner' THEN
                RAISE EXCEPTION 'Access Denied: Only a workspace owner can demote or modify an owner.';
            END IF;

            -- Check if demoting the last owner
            IF NEW.role <> 'owner' THEN
                SELECT COUNT(*) INTO owner_count
                FROM public.workspace_members
                WHERE workspace_id = OLD.workspace_id
                  AND role = 'owner'
                  AND user_id <> OLD.user_id;

                IF owner_count < 1 THEN
                    RAISE EXCEPTION 'Invalid Operation: Cannot demote the last owner of the workspace.';
                END IF;
            END IF;
        END IF;

        -- Only owners can grant the owner role
        IF NEW.role = 'owner' AND OLD.role <> 'owner' THEN
            IF caller_role IS DISTINCT FROM 'owner' THEN
                RAISE EXCEPTION 'Access Denied: Only an existing owner can grant the owner role.';
            END IF;
        END IF;

        -- Admins can only assign 'manager' or 'viewer'
        IF caller_role = 'admin' AND NEW.role IN ('owner', 'admin') AND OLD.role NOT IN ('owner', 'admin') THEN
            RAISE EXCEPTION 'Access Denied: Admins cannot promote members to admin or owner.';
        END IF;

        RETURN NEW;
    END IF;

    -- INSERT ACTION
    IF TG_OP = 'INSERT' THEN
        -- Only owners can grant the owner role to a new member
        IF NEW.role = 'owner' THEN
            IF caller_role IS DISTINCT FROM 'owner' THEN
                RAISE EXCEPTION 'Access Denied: Only an existing owner can add another owner.';
            END IF;
        END IF;

        -- Only owners and admins can invite/add new members
        IF caller_role NOT IN ('owner', 'admin') THEN
            RAISE EXCEPTION 'Access Denied: You must be an owner or admin to add members.';
        END IF;

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workspace_member_safety ON public.workspace_members;
CREATE TRIGGER trg_workspace_member_safety
BEFORE INSERT OR UPDATE OR DELETE ON public.workspace_members
FOR EACH ROW EXECUTE FUNCTION public.enforce_workspace_member_safety();

-- ------------------------------------------------------------------------------
-- 7. Race-Resistant Initial Workspace Bootstrap (RPC & Auth Trigger)
-- ------------------------------------------------------------------------------

-- Callable RPC for frontend or backend to claim or initialize workspace
CREATE OR REPLACE FUNCTION public.bootstrap_initial_workspace(workspace_name TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    caller_id UUID;
    existing_ws UUID;
    default_ws UUID := '00000000-0000-0000-0000-000000000001'::uuid;
    owner_exists BOOLEAN;
    new_ws_id UUID;
BEGIN
    caller_id := auth.uid();
    IF caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to bootstrap workspace.';
    END IF;

    -- Transaction-level advisory lock prevents concurrent race conditions on initial claim
    PERFORM pg_advisory_xact_lock(hashtext('sinchods_workspace_bootstrap'));

    -- 1. Check if caller already has any workspace membership
    SELECT workspace_id INTO existing_ws
    FROM public.workspace_members
    WHERE user_id = caller_id
    ORDER BY created_at ASC
    LIMIT 1;

    IF existing_ws IS NOT NULL THEN
        RETURN existing_ws;
    END IF;

    -- 2. Check if the default workspace has any owner yet
    SELECT EXISTS (
        SELECT 1 FROM public.workspace_members
        WHERE workspace_id = default_ws
          AND role = 'owner'
    ) INTO owner_exists;

    IF NOT owner_exists THEN
        -- First authenticated user claims the default workspace with all existing data
        INSERT INTO public.workspace_members (workspace_id, user_id, role)
        VALUES (default_ws, caller_id, 'owner')
        ON CONFLICT (workspace_id, user_id) 
        DO UPDATE SET role = 'owner';

        UPDATE public.workspaces
        SET created_by = caller_id,
            name = COALESCE(workspace_name, name)
        WHERE id = default_ws;

        RETURN default_ws;
    END IF;

    -- 3. Default workspace is already owned; create a new personal workspace for this user
    INSERT INTO public.workspaces (name, created_by)
    VALUES (COALESCE(workspace_name, 'My Workspace'), caller_id)
    RETURNING id INTO new_ws_id;

    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (new_ws_id, caller_id, 'owner');

    RETURN new_ws_id;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_initial_workspace(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bootstrap_initial_workspace(TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 8. eBay Credentials Protection (Requirement 11)
-- ------------------------------------------------------------------------------

-- Column-level privilege restriction:
-- Frontend authenticated users CANNOT select access_token or refresh_token directly.
REVOKE SELECT ON public.ebay_accounts FROM anon, authenticated;

GRANT SELECT (
    id,
    workspace_id,
    client_id,
    environment,
    marketplace_id,
    seller_username,
    connected,
    token_expires_at,
    refresh_token_expires_at,
    created_at,
    updated_at
) ON public.ebay_accounts TO authenticated;

-- Service role retains full access for server-side token exchange and publishing
GRANT ALL ON public.ebay_accounts TO service_role;

-- Safe view for frontend querying
CREATE OR REPLACE VIEW public.ebay_accounts_safe AS
SELECT 
    id,
    workspace_id,
    client_id,
    environment,
    marketplace_id,
    seller_username,
    connected,
    token_expires_at,
    refresh_token_expires_at,
    created_at,
    updated_at
FROM public.ebay_accounts;

ALTER VIEW public.ebay_accounts_safe SET (security_invoker = on);
GRANT SELECT ON public.ebay_accounts_safe TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 9. Remove Every Permissive USING(true) RLS Policy
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Public read suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Public modify suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Public read products" ON public.products;
DROP POLICY IF EXISTS "Public modify products" ON public.products;
DROP POLICY IF EXISTS "Public read variants" ON public.product_variants;
DROP POLICY IF EXISTS "Public modify variants" ON public.product_variants;
DROP POLICY IF EXISTS "Public read ebay_listings" ON public.ebay_listings;
DROP POLICY IF EXISTS "Public modify ebay_listings" ON public.ebay_listings;
DROP POLICY IF EXISTS "Public read history" ON public.import_history;
DROP POLICY IF EXISTS "Public modify history" ON public.import_history;
DROP POLICY IF EXISTS "Public read price_history" ON public.price_history;
DROP POLICY IF EXISTS "Public modify price_history" ON public.price_history;
DROP POLICY IF EXISTS "Public read orders" ON public.orders;
DROP POLICY IF EXISTS "Public modify orders" ON public.orders;

-- ------------------------------------------------------------------------------
-- 10. Enable Row Level Security (RLS) on All Tables
-- ------------------------------------------------------------------------------

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ebay_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ebay_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_history ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 11. Implement Granular, Secure Workspace RLS Policies
-- ------------------------------------------------------------------------------

-- ==============================================================================
-- 11.1 Workspaces Policies
-- ==============================================================================

CREATE POLICY "workspaces_select_member" ON public.workspaces
    FOR SELECT USING (
        id IN (SELECT public.get_user_workspace_ids())
    );

CREATE POLICY "workspaces_insert_authenticated" ON public.workspaces
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL
    );

CREATE POLICY "workspaces_update_owner_admin" ON public.workspaces
    FOR UPDATE USING (
        public.has_workspace_role(id, ARRAY['owner', 'admin'])
    ) WITH CHECK (
        public.has_workspace_role(id, ARRAY['owner', 'admin'])
    );

CREATE POLICY "workspaces_delete_owner" ON public.workspaces
    FOR DELETE USING (
        public.has_workspace_role(id, ARRAY['owner'])
    );

-- ==============================================================================
-- 11.2 Workspace Members Policies
-- ==============================================================================

CREATE POLICY "workspace_members_select_member" ON public.workspace_members
    FOR SELECT USING (
        workspace_id IN (SELECT public.get_user_workspace_ids())
    );

CREATE POLICY "workspace_members_insert_owner_admin" ON public.workspace_members
    FOR INSERT WITH CHECK (
        public.has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    );

CREATE POLICY "workspace_members_update_owner_admin" ON public.workspace_members
    FOR UPDATE USING (
        public.has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    ) WITH CHECK (
        public.has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    );

CREATE POLICY "workspace_members_delete_owner_admin_or_self" ON public.workspace_members
    FOR DELETE USING (
        public.has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
        OR user_id = auth.uid()
    );

-- ==============================================================================
-- 11.3 Suppliers Policies (Global + Workspace-Specific)
-- ==============================================================================

-- Can view global suppliers (workspace_id IS NULL) or workspace-specific suppliers
CREATE POLICY "suppliers_select_global_or_workspace" ON public.suppliers
    FOR SELECT USING (
        workspace_id IS NULL 
        OR workspace_id IN (SELECT public.get_user_workspace_ids())
    );

-- Only managers, admins, owners can insert workspace-specific suppliers
CREATE POLICY "suppliers_insert_workspace" ON public.suppliers
    FOR INSERT WITH CHECK (
        workspace_id IS NOT NULL 
        AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    );

-- Can update only workspace-specific suppliers
CREATE POLICY "suppliers_update_workspace" ON public.suppliers
    FOR UPDATE USING (
        workspace_id IS NOT NULL 
        AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    ) WITH CHECK (
        workspace_id IS NOT NULL 
        AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    );

-- Can delete only workspace-specific suppliers
CREATE POLICY "suppliers_delete_workspace" ON public.suppliers
    FOR DELETE USING (
        workspace_id IS NOT NULL 
        AND public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    );

-- ==============================================================================
-- 11.4 Products Policies
-- ==============================================================================

CREATE POLICY "products_select_member" ON public.products
    FOR SELECT USING (
        workspace_id IN (SELECT public.get_user_workspace_ids())
    );

CREATE POLICY "products_insert_manager" ON public.products
    FOR INSERT WITH CHECK (
        public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    );

CREATE POLICY "products_update_manager" ON public.products
    FOR UPDATE USING (
        public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    ) WITH CHECK (
        public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    );

CREATE POLICY "products_delete_manager" ON public.products
    FOR DELETE USING (
        public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    );

-- ==============================================================================
-- 11.5 Product Variants Policies (Inherited from parent product workspace)
-- ==============================================================================

CREATE POLICY "variants_select_member" ON public.product_variants
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.products p
            WHERE p.id = product_variants.product_id
              AND p.workspace_id IN (SELECT public.get_user_workspace_ids())
        )
    );

CREATE POLICY "variants_insert_manager" ON public.product_variants
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.products p
            WHERE p.id = product_variants.product_id
              AND public.has_workspace_role(p.workspace_id, ARRAY['owner', 'admin', 'manager'])
        )
    );

CREATE POLICY "variants_update_manager" ON public.product_variants
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.products p
            WHERE p.id = product_variants.product_id
              AND public.has_workspace_role(p.workspace_id, ARRAY['owner', 'admin', 'manager'])
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.products p
            WHERE p.id = product_variants.product_id
              AND public.has_workspace_role(p.workspace_id, ARRAY['owner', 'admin', 'manager'])
        )
    );

CREATE POLICY "variants_delete_manager" ON public.product_variants
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.products p
            WHERE p.id = product_variants.product_id
              AND public.has_workspace_role(p.workspace_id, ARRAY['owner', 'admin', 'manager'])
        )
    );

-- ==============================================================================
-- 11.6 eBay Listings Policies
-- ==============================================================================

CREATE POLICY "ebay_listings_select_member" ON public.ebay_listings
    FOR SELECT USING (
        workspace_id IN (SELECT public.get_user_workspace_ids())
    );

CREATE POLICY "ebay_listings_insert_manager" ON public.ebay_listings
    FOR INSERT WITH CHECK (
        public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    );

CREATE POLICY "ebay_listings_update_manager" ON public.ebay_listings
    FOR UPDATE USING (
        public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    ) WITH CHECK (
        public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    );

CREATE POLICY "ebay_listings_delete_manager" ON public.ebay_listings
    FOR DELETE USING (
        public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    );

-- ==============================================================================
-- 11.7 eBay Accounts Policies (Strict Owner/Admin Management)
-- ==============================================================================

CREATE POLICY "ebay_accounts_select_member" ON public.ebay_accounts
    FOR SELECT USING (
        workspace_id IN (SELECT public.get_user_workspace_ids())
    );

CREATE POLICY "ebay_accounts_insert_owner_admin" ON public.ebay_accounts
    FOR INSERT WITH CHECK (
        public.has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    );

CREATE POLICY "ebay_accounts_update_owner_admin" ON public.ebay_accounts
    FOR UPDATE USING (
        public.has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    ) WITH CHECK (
        public.has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    );

CREATE POLICY "ebay_accounts_delete_owner_admin" ON public.ebay_accounts
    FOR DELETE USING (
        public.has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    );

-- ==============================================================================
-- 11.8 Price History Policies
-- ==============================================================================

CREATE POLICY "price_history_select_member" ON public.price_history
    FOR SELECT USING (
        workspace_id IN (SELECT public.get_user_workspace_ids())
    );

CREATE POLICY "price_history_insert_manager" ON public.price_history
    FOR INSERT WITH CHECK (
        public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    );

CREATE POLICY "price_history_update_admin" ON public.price_history
    FOR UPDATE USING (
        public.has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    ) WITH CHECK (
        public.has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    );

CREATE POLICY "price_history_delete_admin" ON public.price_history
    FOR DELETE USING (
        public.has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    );

-- ==============================================================================
-- 11.9 Orders Policies
-- ==============================================================================

CREATE POLICY "orders_select_member" ON public.orders
    FOR SELECT USING (
        workspace_id IN (SELECT public.get_user_workspace_ids())
    );

CREATE POLICY "orders_insert_manager" ON public.orders
    FOR INSERT WITH CHECK (
        public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    );

CREATE POLICY "orders_update_manager" ON public.orders
    FOR UPDATE USING (
        public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    ) WITH CHECK (
        public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    );

CREATE POLICY "orders_delete_admin" ON public.orders
    FOR DELETE USING (
        public.has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    );

-- ==============================================================================
-- 11.10 Import History Policies
-- ==============================================================================

CREATE POLICY "import_history_select_member" ON public.import_history
    FOR SELECT USING (
        workspace_id IN (SELECT public.get_user_workspace_ids())
    );

CREATE POLICY "import_history_insert_manager" ON public.import_history
    FOR INSERT WITH CHECK (
        public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    );

CREATE POLICY "import_history_update_manager" ON public.import_history
    FOR UPDATE USING (
        public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    ) WITH CHECK (
        public.has_workspace_role(workspace_id, ARRAY['owner', 'admin', 'manager'])
    );

CREATE POLICY "import_history_delete_admin" ON public.import_history
    FOR DELETE USING (
        public.has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    );

COMMIT;

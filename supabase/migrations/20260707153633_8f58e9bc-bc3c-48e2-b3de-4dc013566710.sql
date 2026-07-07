
-- 1. Cancellation columns on payment_plans
ALTER TABLE public.payment_plans
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancelled_by_email text,
  ADD COLUMN IF NOT EXISTS billing_type_after text;

-- 2. Replace unique(family_key) with partial unique on active plans
ALTER TABLE public.payment_plans DROP CONSTRAINT IF EXISTS payment_plans_family_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS payment_plans_family_key_active_idx
  ON public.payment_plans (family_key)
  WHERE status NOT IN ('Cancelled', 'Removed by Admin');

-- 3. family_billing table
CREATE TABLE IF NOT EXISTS public.family_billing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_key text NOT NULL UNIQUE,
  parent_name text NOT NULL DEFAULT '',
  parent_email text NOT NULL DEFAULT '',
  school_name text NOT NULL DEFAULT '',
  student_names text NOT NULL DEFAULT '',
  billing_type text NOT NULL DEFAULT 'Paid in Full',
  updated_by uuid,
  updated_by_email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.family_billing TO authenticated;
GRANT ALL ON public.family_billing TO service_role;

ALTER TABLE public.family_billing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family_billing read authenticated" ON public.family_billing
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "family_billing write authenticated" ON public.family_billing
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "family_billing update authenticated" ON public.family_billing
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "family_billing delete admin" ON public.family_billing
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER family_billing_updated_at BEFORE UPDATE ON public.family_billing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. billing_changes audit table (append-only)
CREATE TABLE IF NOT EXISTS public.billing_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_key text NOT NULL,
  parent_name text NOT NULL DEFAULT '',
  previous_type text,
  new_type text NOT NULL,
  reason text NOT NULL DEFAULT '',
  plan_id uuid,
  actor_id uuid,
  actor_email text NOT NULL DEFAULT '',
  actor_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.billing_changes TO authenticated;
GRANT ALL ON public.billing_changes TO service_role;

ALTER TABLE public.billing_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_changes read authenticated" ON public.billing_changes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "billing_changes insert authenticated" ON public.billing_changes
  FOR INSERT TO authenticated WITH CHECK (true);
-- No UPDATE / DELETE policies: append-only.

CREATE INDEX IF NOT EXISTS billing_changes_family_idx ON public.billing_changes (family_key, created_at DESC);


DROP POLICY IF EXISTS "family_billing write authenticated" ON public.family_billing;
DROP POLICY IF EXISTS "family_billing update authenticated" ON public.family_billing;
DROP POLICY IF EXISTS "billing_changes insert authenticated" ON public.billing_changes;

CREATE POLICY "family_billing insert admin" ON public.family_billing
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "family_billing update admin" ON public.family_billing
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "billing_changes insert admin" ON public.billing_changes
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));


-- Lock down write access on sensitive tables to admins only. Audit log inserts
-- continue to work for all authenticated users through a SECURITY DEFINER function
-- that fills in the trusted actor identity from auth.uid().

-- ===================== audit_log =====================
DROP POLICY IF EXISTS "Authenticated can insert audit_log" ON public.audit_log;

CREATE POLICY "Admins can insert audit_log"
  ON public.audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.log_audit_entry(
  _action text,
  _entity_type text DEFAULT NULL,
  _entity_id text DEFAULT NULL,
  _entity_name text DEFAULT NULL,
  _details jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _email text;
  _name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT u.email,
         COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', u.email)
    INTO _email, _name
    FROM auth.users u
   WHERE u.id = auth.uid();

  INSERT INTO public.audit_log (actor_id, actor_email, actor_name, action, entity_type, entity_id, entity_name, details)
  VALUES (auth.uid(), _email, _name, _action, _entity_type, _entity_id, _entity_name, _details)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_audit_entry(text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_audit_entry(text, text, text, text, jsonb) TO authenticated;

-- ===================== automation_configs =====================
DROP POLICY IF EXISTS "Staff can write configs" ON public.automation_configs;
CREATE POLICY "Admins can write configs"
  ON public.automation_configs
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ===================== email_templates =====================
DROP POLICY IF EXISTS "Staff can write templates" ON public.email_templates;
CREATE POLICY "Admins can write templates"
  ON public.email_templates
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ===================== school_contacts =====================
DROP POLICY IF EXISTS "Staff can write contacts" ON public.school_contacts;
CREATE POLICY "Admins can write contacts"
  ON public.school_contacts
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ===================== email_history =====================
-- Writes happen from the trusted server function via the service role, so no
-- end-user role is allowed to INSERT/UPDATE/DELETE directly.
DROP POLICY IF EXISTS "Staff can write history" ON public.email_history;
CREATE POLICY "Admins can write history"
  ON public.email_history
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ===================== payment_plans =====================
DROP POLICY IF EXISTS "auth insert payment_plans" ON public.payment_plans;
DROP POLICY IF EXISTS "auth update payment_plans" ON public.payment_plans;
DROP POLICY IF EXISTS "auth delete payment_plans" ON public.payment_plans;

CREATE POLICY "Admins can insert payment_plans"
  ON public.payment_plans FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update payment_plans"
  ON public.payment_plans FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete payment_plans"
  ON public.payment_plans FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ===================== payment_installments =====================
DROP POLICY IF EXISTS "auth insert installments" ON public.payment_installments;
DROP POLICY IF EXISTS "auth update installments" ON public.payment_installments;
DROP POLICY IF EXISTS "auth delete installments" ON public.payment_installments;

CREATE POLICY "Admins can insert installments"
  ON public.payment_installments FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update installments"
  ON public.payment_installments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete installments"
  ON public.payment_installments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ===================== payment_records =====================
DROP POLICY IF EXISTS "auth insert records" ON public.payment_records;
CREATE POLICY "Admins can insert records"
  ON public.payment_records FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

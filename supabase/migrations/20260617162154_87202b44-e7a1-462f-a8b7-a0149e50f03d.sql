
CREATE TABLE IF NOT EXISTS public.forms_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forms_config TO authenticated;
GRANT ALL ON public.forms_config TO service_role;
ALTER TABLE public.forms_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read forms_config" ON public.forms_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert forms_config" ON public.forms_config FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update forms_config" ON public.forms_config FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete forms_config" ON public.forms_config FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.sync_history (
  id text PRIMARY KEY,
  ts timestamptz NOT NULL DEFAULT now(),
  total integer NOT NULL DEFAULT 0,
  added integer NOT NULL DEFAULT 0,
  updated integer NOT NULL DEFAULT 0,
  data jsonb,
  created_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_history TO authenticated;
GRANT ALL ON public.sync_history TO service_role;
ALTER TABLE public.sync_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read sync_history" ON public.sync_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert sync_history" ON public.sync_history FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update sync_history" ON public.sync_history FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete sync_history" ON public.sync_history FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

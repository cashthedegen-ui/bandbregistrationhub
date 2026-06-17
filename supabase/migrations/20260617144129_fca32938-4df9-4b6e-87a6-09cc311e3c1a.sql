CREATE TABLE public.app_state (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_state TO authenticated;
GRANT ALL ON public.app_state TO service_role;
ALTER TABLE public.app_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read app_state" ON public.app_state FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert app_state" ON public.app_state FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update app_state" ON public.app_state FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete app_state" ON public.app_state FOR DELETE TO authenticated USING (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_state;
ALTER TABLE public.app_state REPLICA IDENTITY FULL;
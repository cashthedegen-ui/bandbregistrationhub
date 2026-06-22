
CREATE TABLE public.audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ts timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  actor_email text,
  actor_name text,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  entity_name text,
  details jsonb
);

CREATE INDEX audit_log_ts_idx ON public.audit_log (ts DESC);
CREATE INDEX audit_log_entity_name_idx ON public.audit_log (entity_name);

GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read audit_log"
  ON public.audit_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert audit_log"
  ON public.audit_log FOR INSERT TO authenticated WITH CHECK (true);

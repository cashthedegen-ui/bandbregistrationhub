-- 1. Students table: one row per student, full row stored as jsonb for schema flexibility
CREATE TABLE public.students (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT ALL ON public.students TO service_role;

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read students"
  ON public.students FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert students"
  ON public.students FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update students"
  ON public.students FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete students"
  ON public.students FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 2. Backfill from existing app_state blob
INSERT INTO public.students (id, data, updated_at)
SELECT s->>'id', s, now()
FROM public.app_state, jsonb_array_elements(value) s
WHERE key = 'students' AND s->>'id' IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- 3. Enable realtime for per-row updates
ALTER TABLE public.students REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.students;

-- 4. Restrict realtime channel access to admins (same as app_state)
DROP POLICY IF EXISTS "Admins can receive students realtime" ON realtime.messages;
CREATE POLICY "Admins can receive students realtime"
ON realtime.messages
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));
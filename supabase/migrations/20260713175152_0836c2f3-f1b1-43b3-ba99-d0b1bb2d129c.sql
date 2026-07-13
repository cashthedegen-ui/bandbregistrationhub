
CREATE TABLE public.financial_aid_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id TEXT,
  family_key TEXT,
  action TEXT NOT NULL,
  previous_values JSONB,
  new_values JSONB,
  notes TEXT,
  actor_id UUID,
  actor_email TEXT,
  actor_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_financial_aid_history_student ON public.financial_aid_history(student_id);
CREATE INDEX idx_financial_aid_history_family ON public.financial_aid_history(family_key);
CREATE INDEX idx_financial_aid_history_created ON public.financial_aid_history(created_at DESC);

GRANT SELECT, INSERT ON public.financial_aid_history TO authenticated;
GRANT ALL ON public.financial_aid_history TO service_role;

ALTER TABLE public.financial_aid_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read financial aid history"
  ON public.financial_aid_history FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert financial aid history"
  ON public.financial_aid_history FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

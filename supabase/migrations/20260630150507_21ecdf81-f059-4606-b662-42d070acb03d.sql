
-- ============ payment_plans ============
CREATE TABLE public.payment_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  family_key TEXT NOT NULL UNIQUE,
  parent_name TEXT NOT NULL DEFAULT '',
  parent_email TEXT NOT NULL DEFAULT '',
  parent_phone TEXT NOT NULL DEFAULT '',
  school_name TEXT NOT NULL DEFAULT '',
  student_names TEXT NOT NULL DEFAULT '',
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  down_payment NUMERIC(10,2) NOT NULL DEFAULT 0,
  installment_count INTEGER NOT NULL DEFAULT 1,
  installment_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  frequency TEXT NOT NULL DEFAULT 'Monthly',
  custom_days INTEGER,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  next_due_date DATE,
  last_payment_date DATE,
  amount_paid NUMERIC(10,2) NOT NULL DEFAULT 0,
  remaining_balance NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Current',
  notes TEXT NOT NULL DEFAULT '',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_plans TO authenticated;
GRANT ALL ON public.payment_plans TO service_role;
ALTER TABLE public.payment_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read payment_plans" ON public.payment_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert payment_plans" ON public.payment_plans FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update payment_plans" ON public.payment_plans FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete payment_plans" ON public.payment_plans FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_payment_plans_updated_at BEFORE UPDATE ON public.payment_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_payment_plans_status ON public.payment_plans(status);
CREATE INDEX idx_payment_plans_next_due ON public.payment_plans(next_due_date);

-- ============ payment_installments ============
CREATE TABLE public.payment_installments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id UUID NOT NULL REFERENCES public.payment_plans(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  due_date DATE NOT NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Upcoming',
  waived BOOLEAN NOT NULL DEFAULT false,
  paid_at TIMESTAMPTZ,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_installments TO authenticated;
GRANT ALL ON public.payment_installments TO service_role;
ALTER TABLE public.payment_installments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read installments" ON public.payment_installments FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert installments" ON public.payment_installments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update installments" ON public.payment_installments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete installments" ON public.payment_installments FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_payment_installments_updated_at BEFORE UPDATE ON public.payment_installments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_installments_plan ON public.payment_installments(plan_id);
CREATE INDEX idx_installments_due ON public.payment_installments(due_date);
CREATE INDEX idx_installments_status ON public.payment_installments(status);

-- ============ payment_records (append-only) ============
CREATE TABLE public.payment_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id UUID NOT NULL REFERENCES public.payment_plans(id) ON DELETE CASCADE,
  installment_id UUID REFERENCES public.payment_installments(id) ON DELETE SET NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(10,2) NOT NULL,
  method TEXT NOT NULL DEFAULT 'Cash',
  confirmation_number TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  staff_id UUID,
  staff_email TEXT NOT NULL DEFAULT '',
  staff_name TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'Payment', -- Payment | Waive | Credit | DownPayment
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.payment_records TO authenticated;
GRANT ALL ON public.payment_records TO service_role;
ALTER TABLE public.payment_records ENABLE ROW LEVEL SECURITY;

-- Read + insert only. No update or delete policies => append-only / audit-safe.
CREATE POLICY "auth read records" ON public.payment_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert records" ON public.payment_records FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX idx_records_plan ON public.payment_records(plan_id);
CREATE INDEX idx_records_date ON public.payment_records(payment_date);

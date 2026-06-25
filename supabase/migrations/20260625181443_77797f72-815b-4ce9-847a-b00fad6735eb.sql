
-- Shared updated_at trigger (idempotent)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 1) email_templates
CREATE TABLE public.email_templates (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_templates TO authenticated;
GRANT ALL ON public.email_templates TO service_role;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read templates" ON public.email_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can write templates" ON public.email_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON public.email_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) school_contacts
CREATE TABLE public.school_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_name TEXT NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX school_contacts_school_idx ON public.school_contacts(school_name);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_contacts TO authenticated;
GRANT ALL ON public.school_contacts TO service_role;
ALTER TABLE public.school_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read contacts" ON public.school_contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can write contacts" ON public.school_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_school_contacts_updated_at BEFORE UPDATE ON public.school_contacts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) email_history
CREATE TABLE public.email_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT,
  recipient TEXT NOT NULL,
  cc TEXT,
  bcc TEXT,
  subject TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'sent',
  error TEXT,
  resend_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX email_history_sent_at_idx ON public.email_history(sent_at DESC);
CREATE INDEX email_history_template_idx ON public.email_history(template_key);
CREATE INDEX email_history_status_idx ON public.email_history(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_history TO authenticated;
GRANT ALL ON public.email_history TO service_role;
ALTER TABLE public.email_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read history" ON public.email_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can write history" ON public.email_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4) automation_configs
CREATE TABLE public.automation_configs (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_configs TO authenticated;
GRANT ALL ON public.automation_configs TO service_role;
ALTER TABLE public.automation_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read configs" ON public.automation_configs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can write configs" ON public.automation_configs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_automation_configs_updated_at BEFORE UPDATE ON public.automation_configs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default templates
INSERT INTO public.email_templates (key, name, subject, body_html, description) VALUES
  ('confirmation_letter', 'Confirmation Letter', 'Your B&B Transportation registration is confirmed — {{studentName}}',
   '<p>Hi {{parentName}},</p><p>This message confirms that <strong>{{studentName}}</strong> is registered for B&amp;B Transportation to <strong>{{schoolName}}</strong>.</p><p>The signed confirmation letter is attached.</p><p>Thank you,<br/>B&amp;B Transportation</p>',
   'Sent to a parent after a student is approved.'),
  ('receipt', 'Payment Receipt', 'Receipt for {{studentName}} — B&B Transportation',
   '<p>Hi {{parentName}},</p><p>Thank you for your payment of <strong>${{amountPaid}}</strong> for <strong>{{studentName}}</strong>. The official receipt is attached.</p><p>— B&amp;B Transportation</p>',
   'Sent automatically (manual for now) after payment is recorded.'),
  ('payment_reminder', 'Payment Reminder', 'Friendly reminder — {{studentName}} transportation payment',
   '<p>Hi {{parentName}},</p><p>This is a friendly reminder that payment for <strong>{{studentName}}</strong>''s transportation is outstanding.</p><p>If you have already mailed a check, please disregard this notice.</p><p>— B&amp;B Transportation</p>',
   'Sent before, on, and after the due date until payment is received.'),
  ('run_sheet', 'Driver Run Sheet', 'Daily Run Sheet — {{routeName}} {{date}}',
   '<p>Hi {{driverName}},</p><p>Your run sheet for <strong>{{routeName}}</strong> on <strong>{{date}}</strong> ({{session}}) is attached.</p><p>Riders: {{riderCount}}</p><p>— B&amp;B Transportation</p>',
   'Sent to assigned driver(s) with the run sheet PDF.'),
  ('school_summary', 'School Ridership Summary', '{{schoolName}} — Ridership Summary ({{periodLabel}})',
   '<p>Hi {{contactName}},</p><p>Here is the latest ridership summary for <strong>{{schoolName}}</strong>:</p><ul><li>Active students: {{activeCount}}</li><li>Morning riders: {{amCount}}</li><li>Afternoon riders: {{pmCount}}</li><li>New registrations: {{newCount}}</li><li>Dropped: {{droppedCount}}</li><li>Pending: {{pendingCount}}</li></ul><p>— B&amp;B Transportation</p>',
   'Generic school contact summary email (daily/weekly/monthly).');

-- Seed default automation configs (all disabled by default)
INSERT INTO public.automation_configs (key, enabled, config) VALUES
  ('confirmation_letter', false, '{"trigger":"on_approve"}'::jsonb),
  ('receipt', false, '{"trigger":"on_payment"}'::jsonb),
  ('payment_reminder', false, '{"daysBefore":7,"onDueDate":true,"daysAfter":[3,7,14],"weeklyUntilPaid":true}'::jsonb),
  ('run_sheet', false, '{"sessions":["morning","afternoon"],"sendTime":"06:00"}'::jsonb),
  ('school_summary', false, '{"frequency":"weekly","sendDay":"monday","sendTime":"08:00"}'::jsonb);

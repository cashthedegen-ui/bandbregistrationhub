
-- Communication templates
CREATE TABLE public.communication_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name text NOT NULL,
  communication_type text NOT NULL,
  school_or_program text NOT NULL,
  form_id text,
  subject text NOT NULL,
  email_body text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  eligibility_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.communication_templates TO authenticated;
GRANT ALL ON public.communication_templates TO service_role;

ALTER TABLE public.communication_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read templates"
  ON public.communication_templates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert templates"
  ON public.communication_templates FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update templates"
  ON public.communication_templates FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete templates"
  ON public.communication_templates FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER communication_templates_updated_at
  BEFORE UPDATE ON public.communication_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Communication logs (append-only from client)
CREATE TABLE public.communication_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES public.communication_templates(id) ON DELETE SET NULL,
  template_name text,
  student_id text,
  student_name text,
  parent_name text,
  recipient_email text,
  recipient_phone text,
  communication_type text NOT NULL,
  school_or_program text,
  rendered_subject text,
  rendered_body text,
  channel text NOT NULL DEFAULT 'email',
  status text NOT NULL DEFAULT 'queued',
  provider_message_id text,
  failure_reason text,
  initiated_by uuid,
  initiated_by_email text,
  initiated_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

GRANT SELECT ON public.communication_logs TO authenticated;
GRANT ALL ON public.communication_logs TO service_role;

ALTER TABLE public.communication_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read logs"
  ON public.communication_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX communication_logs_student_idx ON public.communication_logs (student_id, initiated_at DESC);
CREATE INDEX communication_logs_template_idx ON public.communication_logs (template_id, initiated_at DESC);

-- Seed St. Luke's Junior Parking Shuttle template
INSERT INTO public.communication_templates
  (template_name, communication_type, school_or_program, form_id, subject, email_body, active, eligibility_rules)
VALUES (
  'St. Luke''s Junior Parking Shuttle Payment Confirmation',
  'Payment Confirmation',
  'St Lukes Parking Shuttle',
  '6503623',
  'Payment Confirmed — St. Luke''s Junior Parking Shuttle',
  '<p>Dear {{parent_name}},</p>
<p>Thank you! We''ve received your payment for <strong>{{student_name}}</strong> (Grade {{grade}}) for the <strong>St. Luke''s Junior Parking Shuttle</strong>.</p>
<p><strong>Payment received:</strong> {{amount_paid}}<br/>
<strong>Registration date:</strong> {{registration_date}}</p>
<p>Your student''s spot on the parking shuttle is officially confirmed for the {{school_year}} school year. We''ll follow up before the first day of service with pickup details and driver information.</p>
<p>If you have any questions, reply to this email or call us at (203) 393-9750.</p>
<p>Thank you for riding with B &amp; B Transportation.<br/>
— The B &amp; B Transit Team</p>',
  true,
  '{"require_payment_received": true, "require_parent_email": true, "form_id": "6503623"}'::jsonb
);


-- 1. is_test flag on logs
ALTER TABLE public.communication_logs
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS communication_logs_is_test_idx
  ON public.communication_logs (is_test, initiated_at DESC);

-- 2. Version history
CREATE TABLE IF NOT EXISTS public.communication_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.communication_templates(id) ON DELETE CASCADE,
  version_number int NOT NULL,
  template_name text NOT NULL,
  subject text NOT NULL,
  email_body text NOT NULL,
  saved_by uuid,
  saved_by_email text,
  saved_at timestamptz NOT NULL DEFAULT now(),
  note text
);

GRANT SELECT, INSERT ON public.communication_template_versions TO authenticated;
GRANT ALL ON public.communication_template_versions TO service_role;

ALTER TABLE public.communication_template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read template versions"
  ON public.communication_template_versions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert template versions"
  ON public.communication_template_versions FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS comm_template_versions_template_idx
  ON public.communication_template_versions (template_id, version_number DESC);

-- Trigger to snapshot the previous version on update
CREATE OR REPLACE FUNCTION public.snapshot_communication_template()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _next int;
  _email text;
BEGIN
  IF NEW.subject IS DISTINCT FROM OLD.subject
     OR NEW.email_body IS DISTINCT FROM OLD.email_body
     OR NEW.template_name IS DISTINCT FROM OLD.template_name THEN
    SELECT COALESCE(MAX(version_number), 0) + 1
      INTO _next
      FROM public.communication_template_versions
     WHERE template_id = OLD.id;
    SELECT u.email INTO _email FROM auth.users u WHERE u.id = auth.uid();
    INSERT INTO public.communication_template_versions
      (template_id, version_number, template_name, subject, email_body, saved_by, saved_by_email)
    VALUES
      (OLD.id, _next, OLD.template_name, OLD.subject, OLD.email_body, auth.uid(), _email);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS communication_templates_snapshot ON public.communication_templates;
CREATE TRIGGER communication_templates_snapshot
  BEFORE UPDATE ON public.communication_templates
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_communication_template();

-- 3. Refresh St. Luke's template body to match the uploaded PDF (2026–2027)
UPDATE public.communication_templates
   SET subject = 'St. Luke''s School Parking Shuttle — Payment Confirmation (2026–2027)',
       email_body = '<!-- BB_LETTER v1 -->
<p>This letter confirms that <strong>{{student_name}}</strong> has purchased shuttle transportation from Vista Lot (477 Smith Ridge Rd South Salem, NY) for the 2026–2027 School Year.</p>
<p>This service is paid in full for the school year and entitle <strong>{{student_name}}</strong> and siblings to use the shuttle service to and from St Luke''s School.</p>
<p class="letter-field"><strong>Date:</strong> {{payment_date}}</p>
<p class="letter-field"><strong>Amount Paid:</strong> {{amount_paid}}</p>
<p class="letter-field"><strong>Purchaser:</strong> {{parent_name}}</p>'
 WHERE form_id = '6503623'
   AND communication_type = 'Payment Confirmation';

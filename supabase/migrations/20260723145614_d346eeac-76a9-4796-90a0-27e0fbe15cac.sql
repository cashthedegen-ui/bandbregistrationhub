
-- 1. Revoke public EXECUTE on SECURITY DEFINER functions; keep authenticated + service_role.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.log_audit_entry(text, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit_entry(text, text, text, text, jsonb) TO authenticated, service_role;

-- snapshot_communication_template is a trigger fn; revoke direct execution.
REVOKE ALL ON FUNCTION public.snapshot_communication_template() FROM PUBLIC, anon, authenticated;

-- 2. Scope the realtime broadcast policy to the 'students' topic only.
DROP POLICY IF EXISTS "Authenticated can receive students realtime" ON realtime.messages;

CREATE POLICY "Authenticated can receive students realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (realtime.topic() = 'students')
  AND (realtime.messages.extension IN ('broadcast', 'presence'))
);

-- Restrict Realtime channel subscriptions to authenticated admins for app_state changes
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can receive app_state realtime" ON realtime.messages;
CREATE POLICY "Admins can receive app_state realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));
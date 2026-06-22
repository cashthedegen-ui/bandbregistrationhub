DROP POLICY IF EXISTS "Admins can receive students realtime" ON realtime.messages;
DROP POLICY IF EXISTS "Admins can receive app_state realtime" ON realtime.messages;

CREATE POLICY "Authenticated can receive students realtime"
ON realtime.messages FOR SELECT
TO authenticated
USING (true);

ALTER TABLE public.email_history
  ADD COLUMN IF NOT EXISTS sent_by_email TEXT,
  ADD COLUMN IF NOT EXISTS sent_by_name TEXT;

-- Refresh seed templates only if they still match the previous defaults (don't clobber edits).
UPDATE public.email_templates SET
  subject = 'Your B&B Transportation registration is confirmed — {{studentName}}',
  body_html = '<p>Hi {{parentName}},</p><p>This message confirms that <strong>{{studentName}}</strong> ({{grade}}) is registered for B&amp;B Transportation to <strong>{{schoolName}}</strong> for the {{schoolYear}} school year.</p><p>Your signed confirmation letter is attached.</p><p>If anything looks off, just reply to this email.</p><p>Thank you,<br/>B&amp;B Transportation</p>',
  description = 'Sent to a parent after a student is approved. Manual send today; auto-on-approve later.'
WHERE key = 'confirmation_letter';

UPDATE public.email_templates SET
  subject = 'Receipt for {{studentName}} — B&B Transportation',
  body_html = '<p>Hi {{parentName}},</p><p>Thank you for your payment for <strong>{{studentName}}</strong> ({{schoolName}}, {{schoolYear}}).</p><table cellpadding="6" style="border-collapse:collapse;margin:12px 0;font-size:14px;"><tr><td style="color:#57534e;">Payment date</td><td><strong>{{paymentDate}}</strong></td></tr><tr><td style="color:#57534e;">Amount paid</td><td><strong>${{amountPaid}}</strong></td></tr><tr><td style="color:#57534e;">Balance due</td><td><strong>${{balanceDue}}</strong></td></tr>{{checkLine}}</table><p>The official receipt is attached for your records.</p><p>— B&amp;B Transportation</p>',
  description = 'Sent after a payment is recorded. Manual resend supported.'
WHERE key = 'receipt';

UPDATE public.email_templates SET
  subject = 'Friendly reminder — {{studentName}} transportation payment',
  body_html = '<p>Hi {{parentName}},</p><p>This is a friendly reminder that the transportation payment for <strong>{{studentName}}</strong> ({{schoolName}}, {{schoolYear}}) is currently <strong>{{paymentStatus}}</strong>.</p><p style="margin:12px 0;font-size:15px;">Amount due: <strong>${{balanceDue}}</strong></p><p><strong>How to pay</strong><br/>Mail a check payable to <em>B&amp;B Transportation</em> to:<br/>B&amp;B Transportation, 123 Main St, New Haven, CT 06511</p><p>If you have already mailed payment, please disregard this notice — thank you!</p><p>— B&amp;B Transportation</p>',
  description = 'Sent to parents with unpaid, partial, or overdue balances. Stops once payment is recorded.'
WHERE key = 'payment_reminder';

UPDATE public.email_templates SET
  name = 'School Update',
  subject = '{{schoolName}} — Student transportation update ({{periodLabel}})',
  body_html = '<p>Hi {{contactName}},</p><p>Here is the latest B&amp;B Transportation update for <strong>{{schoolName}}</strong>{{routeLine}}:</p><table cellpadding="6" style="border-collapse:collapse;margin:12px 0;font-size:14px;"><tr><td style="color:#57534e;">Total students</td><td><strong>{{totalStudents}}</strong></td></tr><tr><td style="color:#57534e;">Morning riders</td><td><strong>{{amCount}}</strong></td></tr><tr><td style="color:#57534e;">Afternoon riders</td><td><strong>{{pmCount}}</strong></td></tr><tr><td style="color:#57534e;">New registrations</td><td><strong>{{newCount}}</strong></td></tr><tr><td style="color:#57534e;">Dropped students</td><td><strong>{{droppedCount}}</strong></td></tr><tr><td style="color:#57534e;">Pending</td><td><strong>{{pendingCount}}</strong></td></tr></table>{{notesBlock}}<p>Reply to this email with any questions.</p><p>— B&amp;B Transportation</p>',
  description = 'Sent to school contacts with the latest ridership counts. Supports bulk send across selected schools.'
WHERE key = 'school_summary';

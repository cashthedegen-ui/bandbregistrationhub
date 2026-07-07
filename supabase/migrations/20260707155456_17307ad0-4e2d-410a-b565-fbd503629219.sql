
ALTER TABLE public.payment_records
  ADD COLUMN IF NOT EXISTS analytics_excluded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS excluded_reason text,
  ADD COLUMN IF NOT EXISTS removed_from_plan_at timestamptz,
  ADD COLUMN IF NOT EXISTS removed_by_staff text;

CREATE INDEX IF NOT EXISTS payment_records_analytics_excluded_idx
  ON public.payment_records (analytics_excluded);

-- Backfill: any records tied to already-cancelled/removed plans should be excluded.
UPDATE public.payment_records r
   SET analytics_excluded = true,
       excluded_reason = COALESCE(r.excluded_reason, 'Payment plan removed'),
       removed_from_plan_at = COALESCE(r.removed_from_plan_at, p.cancelled_at, now()),
       removed_by_staff = COALESCE(r.removed_by_staff, p.cancelled_by_email)
  FROM public.payment_plans p
 WHERE r.plan_id = p.id
   AND p.status IN ('Cancelled', 'Removed by Admin')
   AND r.analytics_excluded = false;

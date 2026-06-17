## Goal

Make Supabase the single source of truth. Eliminate every localStorage path that touches student or payment data, and remove the "reconciliation push" that has been overwriting good remote data with stale local cache.

## What's actually wrong today

The Supabase tables already exist (`students`, `app_state`, `user_roles`) and writes already go to Supabase on every edit. The damage came from `src/lib/store.tsx`:

1. On app load it reads `localStorage` first (`storage.getStudents()`), shows that, then runs a "needsPush" reconciliation that uploads local rows over remote ones. A device whose local cache was empty/stale pushed zeros over the real payments.
2. Every state update also writes back to `localStorage`, so stale snapshots keep getting recreated.

Just creating tables won't fix it — the local cache layer must be removed.

## Plan

1. **Add the two missing tables** via a migration so the four requested tables exist:
   - `forms_config` (key/value JSON for form list configuration)
   - `sync_history` (one row per sync event)
   - `students` and `app_state` already exist — leave them alone.
   - Both new tables: RLS on, authenticated read, admin write, service_role full, no anon.

2. **Rewrite `src/lib/store.tsx` load path** to be Supabase-only:
   - Remove `storage.getStudents()` seeding and the entire `needsPush` reconciliation block.
   - On auth ready, fetch students + app_state from Supabase, render that, done. No local fallback, no push-up.
   - Keep realtime `subscribeStudents` so other devices' edits appear live.
   - If Supabase fetch fails, show an error state instead of falling back to local cache.

3. **Strip localStorage writes for student/payment/app data** across the codebase:
   - Remove `storage.setStudents`, `storage.getStudents`, `setArchives`, `setStopCapacities`, `setSyncHistory`, `setLastSync`, `setDeletedSubmissions` call sites in `store.tsx` and anywhere else.
   - Trim `src/lib/storage.ts` down to only: API token (session-only, in memory) and the static `DEFAULT_FORMS` / `DEFAULT_SETTINGS` constants + `mergeFormsWithDefaults`. No `localStorage` reads/writes for any domain data.
   - Settings (forms list, receipt config) read/write directly to `app_state` via `shared-state.ts`. API token stays in memory only.

4. **Every edit writes to Supabase immediately** (already true via `upsertStudent`), but remove the "optimistic localStorage mirror" so there is no stale cache to ever resurrect. UI state stays in React; persistence is Supabase only.

5. **Guard against the original disaster**: add a safety check in `upsertStudents` batch path that refuses to overwrite a remote row's nonzero payment fields with all-zero values unless explicitly forced (used only by `restoreSeason`/`deleteAllStudents`). This is a belt-and-suspenders guard so no future bug can repeat the wipe.

6. **Re-entry of payment data**: after this ships, you re-enter the payments once. From then on every edit lives in Supabase only and survives publishes, redeploys, browser clears, new devices, and code changes.

## Out of scope

- No UI redesign, no analytics tab changes, no Formstack sync logic changes beyond removing local cache writes.
- Cannot recover the previously-wiped payment amounts — Supabase has no historical snapshot of them. This plan prevents recurrence; it does not undo the past wipe.

## Technical notes

- Migration adds `forms_config` and `sync_history` with the standard 4-step pattern (CREATE → GRANT → ENABLE RLS → POLICY).
- `store.tsx` load effect collapses from ~140 lines to ~40: parallel `fetchAllStudents()` + `loadShared` calls, then `setReady(true)`.
- `storage.ts` shrinks to constants + helpers only. All `localStorage.getItem`/`setItem` calls deleted.
- Realtime subscriptions unchanged.
- No edits to `src/integrations/supabase/*` (auto-generated).

# MyBible Supabase — Batch 2 status (2026-10-20)

MyBible connects to the existing **mybible** Supabase project. The public browser configuration uses a publishable/legacy anon key, never a service-role key.

## Current behavior

- Guests: device-only notes, bookmarks, and highlights in localStorage.
- Signed-in readers: user-scoped cloud study data, reading position and supported preferences.
- Personal note, bookmark and highlight writes are serialized and performed per verse. No full-table deletion is used.
- Signed-in reader data is backed up locally under a per-user key. Pending offline edits are reconciled on reconnection; unrelated remote verses are preserved.
- A signed-in reader can continue using a locally cached data copy when cloud reads are temporarily unavailable.
- Source columns are guarded by Row Level Security, verified against the live database on 2026-10-20.

## Important limitations

- Do not claim that real two-device synchronization is accepted until login, updates, offline editing, account switching, and conflict handling are tested using real test accounts.
- When an account already contains cloud study data and this browser has separate guest data, the adapter **does not silently merge or overwrite** those datasets. Guest/local data remains intact pending an explicit import workflow.
- Last edit to the same verse on two devices is resolved by cloud update ordering; user-facing conflict resolution is not yet implemented.
- The signed-in cloud backup is stored on the browser device, so users should protect their devices.
- Never bulk-clear personal study tables or disable RLS to work around synchronization errors.
- NKJV Scripture remains license-locked; this cloud integration does not change content licensing.

## Verification

GitHub Actions runs `scripts/test-cloud-sync.mjs` on backend/auth changes, covering per-verse writes, deletion, queued updates, offline persistence, and recovery. Browser smoke/regression tests cover Reader behavior. The live database table/RLS inspection is read-only, and no existing user records were modified during this rollout.

## Remaining Batch 2 acceptance

1. Test registration/email verification/login/logout/password recovery.
2. Test two-device updates and reconnection with dedicated dummy accounts.
3. Implement an explicit, reviewable guest-to-account import for browsers already holding local study data alongside nonempty cloud accounts.
4. Verify privacy and account-switch isolation, resolve remaining cloud preference integration gaps.

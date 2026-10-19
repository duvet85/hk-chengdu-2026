# Travel Wallet — private family trips

**App:** https://duvet85.github.io/hk-chengdu-2026/wallet/

**Supabase backend:** Existing **TJY Project** (`fyvyjdocacqauqcdgowj`), Singapore region. Configured using the browser-safe publishable API key in `config.js`. No additional Supabase project or subscription is required.

## Security model

- The **GitHub repository is public and contains only code and configuration**. Never commit boarding passes, travel vouchers, private ticket numbers, passport data, documents or service-role API keys.
- Five wallet-only public-schema tables: `wallet_members`, `trips`, `trip_stops`, `reservations`, `documents`. These are new and separate from existing TJY Project tables.
- All wallet tables have **Row Level Security** enabled. Only users in `wallet_members` can read or modify trips, stops, reservations and documents. Non-members cannot self-approve.
- Supabase Storage bucket **`travel-documents`** is private. Storage object access also checks family membership and a matching trip ID.
- Viewing files uses **90-second signed links** issued to authenticated members.
- Every approved family member currently has full access to every wallet trip; this is a shared family wallet, not personal folders.
- Files are limited to 15 MB each. PDF, JPEG, PNG, WebP and Apple Wallet pass uploads are supported. Keep original reservations at your airline/hotel as backup.
- No private PDFs or images are cached offline. This application requires internet to sign in and fetch documents.
- The audited access rules do not expose `SECURITY DEFINER` RPC helpers.

## Finish first-time login

**The developer connector cannot modify Supabase Auth's redirect allowlist.**

1. Open https://supabase.com/dashboard/project/fyvyjdocacqauqcdgowj/auth/url-configuration
2. Under **Redirect URLs**, add:
   `https://duvet85.github.io/hk-chengdu-2026/wallet/`
   For production, keep only this exact URL as a wallet redirect (the project may have existing redirects belonging to other apps; do **not** delete them).
3. Visit the live [wallet](https://duvet85.github.io/hk-chengdu-2026/wallet/), enter your own email and request a sign-in link. After you click the link in your email, the site should show **pending family approval**.
4. Once your account exists in Supabase Authentication > Users, an administrator can approve it using the SQL Editor (or ask ChatGPT to do this, once you have completed sign-in):
   ```sql
   insert into public.wallet_members (user_id, display_name)
   select id, 'Owner'
   from auth.users
   where email = 'YOUR_SIGN_IN_EMAIL@example.com'
   on conflict (user_id) do nothing;
   ```
5. Refresh the site to view your private wallet. Repeat for your spouse with a separate email account and a separate `wallet_members` row. Do **not** share magic links between devices.

## Database maintenance

- The source `schema.sql` documents the full database schema and hardened access rules.
- Original deployed Supabase migrations:
  - `create_travel_wallet_private_tables`
  - `harden_wallet_rls_without_exposed_definer_functions`
- Re-running `schema.sql` is **not needed** in TJY Project. Existing users or data are not affected by wallet setup.
- Supabase security advisor was checked after the hardening migration and had no findings.

## Product status

Built and published: login integration, private trips, itinerary stops, reservation metadata, private document upload, signed document views, file deletion, installable-app manifest.

Pending real-device checks: email login (requires redirect allowlist), owner membership activation, upload/open/delete permission tests, iPhone user acceptance, import of prior trip itineraries.

Planned features: edit trip/stops, import existing ChatGPT-generated itineraries, family invites UI, private attachments automatically imported from providers (with permission), encrypted offline document cache and backup/export.

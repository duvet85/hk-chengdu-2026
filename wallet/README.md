# Travel Wallet — private family trips

Live frontend: https://duvet85.github.io/hk-chengdu-2026/wallet/

This is a static mobile-friendly app shell. **No private information is stored in this repository.** Flight tickets, hotel vouchers, boarding passes and reservations must be stored in your Supabase project with RLS and a private Storage bucket.

## Activation

1. Create a **dedicated** Supabase project at https://supabase.com/dashboard/projects. Avoid using a database shared with unrelated apps.
2. In SQL Editor run `schema.sql` in this folder.
3. In Authentication > URL Configuration, add `https://duvet85.github.io/hk-chengdu-2026/wallet/` to redirect URLs. Set email auth/magic links as appropriate.
4. Log in on the website once to create your auth user. You will see *awaiting family approval*.
5. In SQL Editor, run:
   ```sql
   insert into public.wallet_members (user_id,display_name)
   select id,'Owner' from auth.users where email = 'YOUR_EMAIL@example.com'
   on conflict (user_id) do nothing;
   ```
   Repeat with a second approved account for your spouse. Use the *exact* email from Supabase Authentication > Users. Never place these addresses in public frontend source.
6. In GitHub, edit `wallet/config.js` using only the Project URL and the Supabase **publishable/anon key** from Supabase Project Settings > API keys. These are designed for browser use, protected by RLS. Do not use a secret/service-role key.
7. Open the live wallet and verify a whitelisted account can sign in, and that an unapproved account cannot read or upload files.

## Privacy

- The GitHub repository is **public**; it holds code only.
- The `travel-documents` Supabase bucket is **private**. Its policy uses wallet membership and trip IDs.
- PDFs/photos are uploaded through authenticated browser requests to Supabase, not to GitHub.
- Documents are viewed with 90-second signed URLs. Avoid sharing those URLs.
- The app does **not** cache documents offline. It supports HTML/JavaScript app access when online.
- A family member has access to **all trips**. This is intentional for a two-person household wallet.
- File limit 15 MB. For legal/financial-grade records, maintain original copies with the issuing providers.
- Only publish code changes here. NEVER paste booking documents or credentials into issues, commits or pull requests.

## Current limits

- Functional add/view for trips, itinerary stops and reservation metadata; add/view/delete for documents.
- Later enhancements: imports from existing trip planners, edit/delete trip data, secure document categories, device-local offline encryption, family invitations UI, backups, shared calendar.
- The Supabase JS library loads from jsDelivr; travelers in China should download important travel essentials ahead or use provider apps in case the CDN is blocked.

-- TRAVEL WALLET v1 — run this ONLY in a dedicated Supabase project.
-- A single household wallet shared by explicitly approved auth.users.
-- Never put a service-role key, booking document, or password in GitHub.
create extension if not exists pgcrypto;

create table if not exists public.wallet_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Family member',
  created_at timestamptz not null default now()
);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 140),
  destinations text not null default '',
  start_date date not null,
  end_date date not null,
  status text not null default 'planning' check (status in ('planning','upcoming','completed')),
  description text not null default '',
  emoji text not null default '✈️',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trip_dates_valid check (end_date >= start_date)
);
create table if not exists public.trip_stops (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  stop_date date not null,
  stop_time time,
  title text not null,
  details text not null default '',
  place text not null default '',
  map_url text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists trip_stops_date_idx on public.trip_stops(trip_id,stop_date,position);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  category text not null default 'other' check (category in ('flight','hotel','train','transfer','activity','dining','other')),
  title text not null,
  provider text not null default '',
  reference text not null default '',
  reservation_at timestamptz,
  status text not null default 'confirmed' check (status in ('confirmed','pending','cancelled')),
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists reservation_trip_idx on public.reservations(trip_id);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete set null,
  title text not null,
  category text not null default 'other'
    check (category in ('boarding_pass','hotel_voucher','ticket','confirmation','insurance','other')),
  object_path text not null unique,
  filename text not null,
  content_type text not null,
  byte_size bigint not null check (byte_size > 0 and byte_size <= 15728640),
  created_at timestamptz not null default now()
);
create index if not exists documents_trip_idx on public.documents(trip_id);

alter table public.wallet_members enable row level security;
alter table public.trips enable row level security;
alter table public.trip_stops enable row level security;
alter table public.reservations enable row level security;
alter table public.documents enable row level security;

revoke all on table public.wallet_members from anon, authenticated;
revoke all on table public.trips, public.trip_stops, public.reservations, public.documents from anon;
grant usage on schema public to authenticated;
grant select on public.wallet_members to authenticated;
grant select,insert,update,delete on public.trips,public.trip_stops,public.reservations,public.documents to authenticated;

-- SECURITY DEFINER bypasses wallet_members RLS to check whitelist. No user may add themself.
create or replace function public.is_wallet_member()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.wallet_members m
    where m.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_wallet_member() from public, anon;
grant execute on function public.is_wallet_member() to authenticated;

drop policy if exists wallet_self on public.wallet_members;
create policy wallet_self on public.wallet_members for select to authenticated
using (user_id=(select auth.uid()));

drop policy if exists trips_read on public.trips;
drop policy if exists trips_insert on public.trips;
drop policy if exists trips_update on public.trips;
drop policy if exists trips_delete on public.trips;
create policy trips_read on public.trips for select to authenticated using ((select public.is_wallet_member()));
create policy trips_insert on public.trips for insert to authenticated with check ((select public.is_wallet_member()));
create policy trips_update on public.trips for update to authenticated using ((select public.is_wallet_member())) with check ((select public.is_wallet_member()));
create policy trips_delete on public.trips for delete to authenticated using ((select public.is_wallet_member()));

drop policy if exists stop_access on public.trip_stops;
create policy stop_access on public.trip_stops for all to authenticated
using ((select public.is_wallet_member()) and exists(select 1 from public.trips t where t.id=trip_id))
with check ((select public.is_wallet_member()) and exists(select 1 from public.trips t where t.id=trip_id));

drop policy if exists reservation_access on public.reservations;
create policy reservation_access on public.reservations for all to authenticated
using ((select public.is_wallet_member()) and exists(select 1 from public.trips t where t.id=trip_id))
with check ((select public.is_wallet_member()) and exists(select 1 from public.trips t where t.id=trip_id));

drop policy if exists document_access on public.documents;
create policy document_access on public.documents for all to authenticated
using ((select public.is_wallet_member()) and exists(select 1 from public.trips t where t.id=trip_id))
with check ((select public.is_wallet_member()) and exists(select 1 from public.trips t where t.id=trip_id)
  and object_path like trip_id::text || '/%');

-- Physical document bytes live in PRIVATE Supabase Storage, never in the git repo.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('travel-documents','travel-documents',false,15728640,
array['application/pdf','image/jpeg','image/png','image/webp','application/vnd.apple.pkpass','application/octet-stream'])
on conflict(id) do update
set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.is_wallet_document_path(object_name text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
   select 1 from public.trips t
   where t.id::text=split_part(object_name,'/',1)
   and object_name <> t.id::text || '/'
 );
$$;
revoke all on function public.is_wallet_document_path(text) from public,anon;
grant execute on function public.is_wallet_document_path(text) to authenticated;

drop policy if exists wallet_storage_select on storage.objects;
drop policy if exists wallet_storage_insert on storage.objects;
drop policy if exists wallet_storage_delete on storage.objects;
create policy wallet_storage_select on storage.objects for select to authenticated
using(bucket_id='travel-documents' and (select public.is_wallet_member()) and public.is_wallet_document_path(name));
create policy wallet_storage_insert on storage.objects for insert to authenticated
with check(bucket_id='travel-documents' and (select public.is_wallet_member()) and public.is_wallet_document_path(name));
create policy wallet_storage_delete on storage.objects for delete to authenticated
using(bucket_id='travel-documents' and (select public.is_wallet_member()) and public.is_wallet_document_path(name));

-- Add members ONLY through SQL editor after they use the website email sign-in once.
-- Example (replace with actual confirmed emails, never commit real family emails publicly):
-- insert into public.wallet_members(user_id,display_name)
-- select id,'Owner' from auth.users where email='YOUR_EMAIL@example.com'
-- on conflict(user_id) do nothing;
-- Repeat for your spouse.

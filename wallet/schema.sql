-- TRAVEL WALLET v1 — run this ONLY in a dedicated Supabase project.
-- A single household wallet shared by explicitly approved auth.users.
-- Never put a service-role key, booking document, or password in GitHub.
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

-- Member access is checked using wallet_members row-level security. Users cannot add themselves.

drop policy if exists wallet_self on public.wallet_members;
create policy wallet_self on public.wallet_members for select to authenticated
using (user_id=(select auth.uid()));

drop policy if exists trips_read on public.trips;
drop policy if exists trips_insert on public.trips;
drop policy if exists trips_update on public.trips;
drop policy if exists trips_delete on public.trips;
create policy trips_read on public.trips for select to authenticated using (exists (select 1 from public.wallet_members m where m.user_id = (select auth.uid())));
create policy trips_insert on public.trips for insert to authenticated with check (exists (select 1 from public.wallet_members m where m.user_id = (select auth.uid())));
create policy trips_update on public.trips for update to authenticated using (exists (select 1 from public.wallet_members m where m.user_id = (select auth.uid()))) with check (exists (select 1 from public.wallet_members m where m.user_id = (select auth.uid())));
create policy trips_delete on public.trips for delete to authenticated using (exists (select 1 from public.wallet_members m where m.user_id = (select auth.uid())));

drop policy if exists stop_access on public.trip_stops;
create policy stop_access on public.trip_stops for all to authenticated
using (exists (select 1 from public.wallet_members m where m.user_id = (select auth.uid())) and exists(select 1 from public.trips t where t.id=trip_id))
with check (exists (select 1 from public.wallet_members m where m.user_id = (select auth.uid())) and exists(select 1 from public.trips t where t.id=trip_id));

drop policy if exists reservation_access on public.reservations;
create policy reservation_access on public.reservations for all to authenticated
using (exists (select 1 from public.wallet_members m where m.user_id = (select auth.uid())) and exists(select 1 from public.trips t where t.id=trip_id))
with check (exists (select 1 from public.wallet_members m where m.user_id = (select auth.uid())) and exists(select 1 from public.trips t where t.id=trip_id));

drop policy if exists document_access on public.documents;
create policy document_access on public.documents for all to authenticated
using (exists (select 1 from public.wallet_members m where m.user_id = (select auth.uid())) and exists(select 1 from public.trips t where t.id=trip_id))
with check (exists (select 1 from public.wallet_members m where m.user_id = (select auth.uid())) and exists(select 1 from public.trips t where t.id=trip_id)
  and object_path like trip_id::text || '/%');

-- Physical document bytes live in PRIVATE Supabase Storage, never in the git repo.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('travel-documents','travel-documents',false,15728640,
array['application/pdf','image/jpeg','image/png','image/webp','application/vnd.apple.pkpass','application/octet-stream'])
on conflict(id) do update
set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;


drop policy if exists wallet_storage_select on storage.objects;
drop policy if exists wallet_storage_insert on storage.objects;
drop policy if exists wallet_storage_delete on storage.objects;
create policy wallet_storage_select on storage.objects for select to authenticated
using(bucket_id='travel-documents' and exists (select 1 from public.wallet_members m where m.user_id = (select auth.uid())) and exists (select 1 from public.trips t where t.id::text=split_part(name,'/',1)));
create policy wallet_storage_insert on storage.objects for insert to authenticated
with check(bucket_id='travel-documents' and exists (select 1 from public.wallet_members m where m.user_id = (select auth.uid())) and exists (select 1 from public.trips t where t.id::text=split_part(name,'/',1)));
create policy wallet_storage_delete on storage.objects for delete to authenticated
using(bucket_id='travel-documents' and exists (select 1 from public.wallet_members m where m.user_id = (select auth.uid())) and exists (select 1 from public.trips t where t.id::text=split_part(name,'/',1)));

-- Add members ONLY through SQL editor after they use the website email sign-in once.
-- Example (replace with actual confirmed emails, never commit real family emails publicly):
-- insert into public.wallet_members(user_id,display_name)
-- select id,'Owner' from auth.users where email='YOUR_EMAIL@example.com'
-- on conflict(user_id) do nothing;
-- Repeat for your spouse.

-- TRAVEL WALLET v2: PACKING (run on existing wallets to add reusable master + per-trip checklists)
-- Master is shared by approved family members. Trip copies are independent and have their own packed state.
create table if not exists public.packing_base_items (
 id uuid primary key default gen_random_uuid(),
 category text not null default 'Other' check (char_length(category) between 1 and 60),
 name text not null check (char_length(name) between 1 and 150),
 quantity integer not null default 1 check (quantity between 1 and 99),
 notes text not null default '' check (char_length(notes) <= 1000),
 position integer not null default 0,
 created_at timestamptz not null default now()
);
create table if not exists public.packing_trip_items (
 id uuid primary key default gen_random_uuid(),
 trip_id uuid not null references public.trips(id) on delete cascade,
 category text not null default 'Other' check (char_length(category) between 1 and 60),
 name text not null check (char_length(name) between 1 and 150),
 quantity integer not null default 1 check (quantity between 1 and 99),
 notes text not null default '' check (char_length(notes) <= 1000),
 packed boolean not null default false,
 position integer not null default 0,
 created_at timestamptz not null default now()
);
create index if not exists packing_base_items_sort_idx on public.packing_base_items(category,position);
create index if not exists packing_trip_items_trip_idx on public.packing_trip_items(trip_id,category,position);
alter table public.packing_base_items enable row level security;
alter table public.packing_trip_items enable row level security;
revoke all on public.packing_base_items,public.packing_trip_items from anon,authenticated;
grant select,insert,update,delete on public.packing_base_items,public.packing_trip_items to authenticated;
drop policy if exists packing_base_access on public.packing_base_items;
create policy packing_base_access on public.packing_base_items for all to authenticated
using (exists(select 1 from public.wallet_members m where m.user_id=(select auth.uid())))
with check (exists(select 1 from public.wallet_members m where m.user_id=(select auth.uid())));
drop policy if exists packing_trip_access on public.packing_trip_items;
create policy packing_trip_access on public.packing_trip_items for all to authenticated
using (exists(select 1 from public.wallet_members m where m.user_id=(select auth.uid())) and exists(select 1 from public.trips t where t.id=trip_id))
with check (exists(select 1 from public.wallet_members m where m.user_id=(select auth.uid())) and exists(select 1 from public.trips t where t.id=trip_id));
-- Seed only when no base items exist. You can change/delete every item in the app.
with starter(category,name,quantity,notes,position) as (
values
 ('Documents','Passport',1,'Check validity for every traveller',10),
 ('Documents','Travel wallet / cards',1,'Payment cards and some local currency',20),
 ('Documents','Driving licence / International Driving Permit',1,'For any self-drive trip',30),
 ('Documents','Flight and hotel confirmations',1,'Keep offline copies',40),
 ('Documents','Travel insurance details',1,'Policy and emergency contact',50),
 ('Clothing','Underwear',1,'Adjust quantity for the trip length',10),
 ('Clothing','Socks',1,'Adjust quantity for the trip length',20),
 ('Clothing','Tops / shirts',1,'Adjust for weather and duration',30),
 ('Clothing','Bottoms',1,'Trousers, skirts or shorts as needed',40),
 ('Clothing','Sleepwear',1,'',50),
 ('Clothing','Comfortable walking shoes',1,'',60),
 ('Clothing','Jacket / extra layers',1,'Adjust to destination weather',70),
 ('Clothing','Laundry bag',1,'',80),
 ('Toiletries','Toothbrush and toothpaste',1,'',10),
 ('Toiletries','Skincare and sunscreen',1,'',20),
 ('Toiletries','Shampoo / toiletries',1,'Check hotel amenities',30),
 ('Toiletries','Deodorant',1,'',40),
 ('Toiletries','Hairbrush / comb',1,'',50),
 ('Electronics','Phone and charging cable',1,'',10),
 ('Electronics','Universal travel power adapter',1,'Check destination plug type',20),
 ('Electronics','Power bank',1,'Carry in cabin; check airline rules',30),
 ('Electronics','Earphones',1,'',40),
 ('Electronics','Camera / spare batteries',1,'Optional',50),
 ('Health','Personal medications',1,'Pack enough for the full trip',10),
 ('Health','Basic first-aid essentials',1,'',20),
 ('Health','Hand sanitiser',1,'',30),
 ('Travel essentials','Sunglasses',1,'',10),
 ('Travel essentials','Umbrella / rain protection',1,'',20),
 ('Travel essentials','Reusable water bottle',1,'',30),
 ('Travel essentials','Tissues / wipes',1,'',40)
)
insert into public.packing_base_items(category,name,quantity,notes,position)
select s.* from starter s where not exists (select 1 from public.packing_base_items);
-- Give existing trips their own independent unchecked copies without duplicating existing entries.
insert into public.packing_trip_items(trip_id,category,name,quantity,notes,position,packed)
select t.id,b.category,b.name,b.quantity,b.notes,b.position,false
from public.trips t cross join public.packing_base_items b
where not exists (
 select 1 from public.packing_trip_items i
 where i.trip_id=t.id and lower(trim(i.name))=lower(trim(b.name))
 and lower(trim(i.category))=lower(trim(b.category))
);

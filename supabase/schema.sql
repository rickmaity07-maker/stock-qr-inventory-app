-- ============================================================================
-- Stock & QR Inventory App - Supabase PostgreSQL schema
-- Run this whole script in the Supabase SQL editor. It is safe to run again:
-- it creates missing tables and upgrades tables made by older app versions.
-- ============================================================================

-- 1. PRODUCTS
create table if not exists public.products (
  id text primary key,
  name text not null,
  category text not null default 'General',
  qr_code text not null unique,
  factory_barcode text,
  buying_price numeric(12, 2) not null default 0,
  selling_price numeric(12, 2) not null default 0,
  quantity integer not null default 0,
  opening_quantity integer, -- null on rows from older versions; the app fills it in
  min_stock_level integer not null default 5,
  expiry_date text,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Upgrades for tables created by app versions before 2.5
alter table public.products add column if not exists opening_quantity integer;
alter table public.products add column if not exists deleted boolean not null default false;

create index if not exists idx_products_factory_barcode on public.products (factory_barcode);

-- 2. STOCK TRANSACTIONS (sales, restocks and stock corrections)
-- unit prices are saved with every sale so changing a price later never alters past profit.
create table if not exists public.transactions (
  id text primary key,
  product_id text not null references public.products(id) on delete restrict,
  product_name text not null,
  type text not null,
  quantity integer not null,
  unit_buying_price numeric(12, 2) not null,
  unit_selling_price numeric(12, 2) not null,
  performed_by_role text not null default 'STAFF' check (performed_by_role in ('OWNER', 'STAFF')),
  notes text,
  timestamp timestamptz not null default now()
);

-- Older versions only allowed SALE/RESTOCK with positive quantities and deleted sales
-- history when a product was deleted. Products are now archived instead.
alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions drop constraint if exists transactions_quantity_check;
alter table public.transactions drop constraint if exists transactions_product_id_fkey;
alter table public.transactions
  add constraint transactions_type_check check (type in ('SALE', 'RESTOCK', 'ADJUST'));
alter table public.transactions
  add constraint transactions_quantity_check
  check ((type = 'ADJUST' and quantity <> 0) or (type <> 'ADJUST' and quantity > 0));
alter table public.transactions
  add constraint transactions_product_id_fkey
  foreign key (product_id) references public.products(id) on delete restrict;

create index if not exists idx_transactions_product_id on public.transactions (product_id);
create index if not exists idx_transactions_timestamp on public.transactions (timestamp desc);

-- 3. ROW LEVEL SECURITY
-- The app signs in with the project's anon key, so anyone who has that key can read and
-- write these tables. Use a separate Supabase project per store and never publish the key.
alter table public.products enable row level security;
alter table public.transactions enable row level security;

drop policy if exists "Allow full access for authenticated and anon sync" on public.products;
create policy "Allow full access for authenticated and anon sync"
  on public.products for all
  using (true)
  with check (true);

drop policy if exists "Allow full access for authenticated and anon sync" on public.transactions;
create policy "Allow full access for authenticated and anon sync"
  on public.transactions for all
  using (true)
  with check (true);

-- 4. REALTIME (live updates between phones)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'products'
  ) then
    alter publication supabase_realtime add table public.products;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transactions'
  ) then
    alter publication supabase_realtime add table public.transactions;
  end if;
end $$;

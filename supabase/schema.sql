-- ============================================================================
-- Stock & QR Inventory App - Supabase PostgreSQL Schema & Live Sync Setup
-- Run this script in your Supabase SQL Editor to enable cloud storage & real-time sync.
-- ============================================================================

create extension if not exists "uuid-ossp";

-- 1. PRODUCTS TABLE
create table if not exists public.products (
  id text primary key,
  name text not null,
  category text not null default 'General',
  qr_code text not null unique,
  factory_barcode text,
  buying_price numeric(12, 2) not null default 0,
  selling_price numeric(12, 2) not null default 0,
  quantity integer not null default 0,
  min_stock_level integer not null default 5,
  expiry_date text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_products_qr_code on public.products (qr_code);
create index if not exists idx_products_factory_barcode on public.products (factory_barcode);

-- 2. STOCK TRANSACTIONS TABLE (Sales & Restocks)
-- Saves unit_buying_price and unit_selling_price at the exact time of each sale
-- so changing a product's price later never alters past months' revenue or profit.
create table if not exists public.transactions (
  id text primary key,
  product_id text not null references public.products(id) on delete cascade,
  product_name text not null,
  type text not null check (type in ('SALE', 'RESTOCK')),
  quantity integer not null check (quantity > 0),
  unit_buying_price numeric(12, 2) not null,
  unit_selling_price numeric(12, 2) not null,
  performed_by_role text not null default 'STAFF' check (performed_by_role in ('OWNER', 'STAFF')),
  notes text,
  timestamp timestamptz not null default now()
);

create index if not exists idx_transactions_product_id on public.transactions (product_id);
create index if not exists idx_transactions_timestamp on public.transactions (timestamp desc);

-- 3. ENABLE ROW LEVEL SECURITY (RLS) WITH ANON/SYNC POLICIES
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

-- 4. ENABLE REALTIME BROADCAST ACROSS ALL ANDROID DEVICES
alter publication supabase_realtime add table public.products;
alter publication supabase_realtime add table public.transactions;

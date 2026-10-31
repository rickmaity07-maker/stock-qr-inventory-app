-- Stock & QR Inventory — Neon Postgres schema (single shop, one owner).
-- Safe to run more than once: `npm run migrate`.

-- Every insert/update takes the next number from this sequence, so a phone can ask
-- "give me everything that changed after change #N".
create sequence if not exists change_seq;

create table if not exists owner_account (
  id smallint primary key default 1 check (id = 1),     -- exactly one owner
  email text not null,
  password_hash text not null,
  token_version integer not null default 1,             -- bump to sign out every device
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists products (
  id text primary key,
  name text not null check (length(name) between 1 and 200),
  category text not null default 'General',
  qr_code text not null,
  factory_barcode text,
  buying_price numeric(12, 2) not null default 0 check (buying_price >= 0),
  selling_price numeric(12, 2) not null default 0 check (selling_price >= 0),
  quantity integer not null default 0,                  -- cached; truth = opening + transactions
  opening_quantity integer,
  min_stock_level integer not null default 5 check (min_stock_level >= 0),
  expiry_date date,
  deleted boolean not null default false,
  updated_at timestamptz not null,                      -- set by the phone; newest edit wins
  seq bigint not null default nextval('change_seq'),
  created_at timestamptz not null default now()
);
create index if not exists products_qr_code on products (upper(qr_code));
create index if not exists products_seq on products (seq);

create table if not exists transactions (
  id text primary key,
  product_id text not null references products (id) on delete restrict,
  product_name text not null,
  type text not null check (type in ('SALE', 'RESTOCK', 'ADJUST')),
  quantity integer not null,
  unit_buying_price numeric(12, 2) not null check (unit_buying_price >= 0),
  unit_selling_price numeric(12, 2) not null check (unit_selling_price >= 0),
  performed_by_role text not null default 'OWNER',
  notes text,
  occurred_at timestamptz not null,
  seq bigint not null default nextval('change_seq'),
  received_at timestamptz not null default now(),
  constraint transactions_quantity_sign check (
    (type = 'ADJUST' and quantity <> 0) or (type <> 'ADJUST' and quantity > 0)
  )
);
create index if not exists transactions_seq on transactions (seq);
create index if not exists transactions_product on transactions (product_id);
create index if not exists transactions_occurred on transactions (occurred_at desc);

-- Failed sign-in attempts, for rate limiting
create table if not exists login_attempts (
  key text not null,
  at timestamptz not null default now()
);
create index if not exists login_attempts_key_at on login_attempts (key, at desc);

-- Current stock per product, always computed from the ledger
create or replace view product_stock as
select
  p.*,
  case
    when p.opening_quantity is null then p.quantity
    else p.opening_quantity + coalesce(sum(case t.type when 'SALE' then -t.quantity else t.quantity end), 0)::integer
  end as stock
from products p
left join transactions t on t.product_id = p.id
group by p.id;

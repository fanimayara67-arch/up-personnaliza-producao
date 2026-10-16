-- Private requests for quotes and support. Browser clients never access this table.
create table if not exists public.cvt_inquiries (
  id uuid primary key,
  reference text not null unique,
  idempotency_key uuid not null unique,
  payload_hash text not null,
  purpose text not null check (purpose in ('quote','support')),
  customer jsonb not null,
  items jsonb not null,
  details jsonb not null,
  status text not null default 'new' check (status in ('new','reviewing','quoted','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cvt_inquiries_created_idx on public.cvt_inquiries(created_at desc);
alter table public.cvt_inquiries enable row level security;
revoke all on public.cvt_inquiries from public, anon, authenticated;
grant select, insert, update on public.cvt_inquiries to service_role;
notify pgrst, 'reload schema';

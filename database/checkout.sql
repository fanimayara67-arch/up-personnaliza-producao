-- Additive checkout schema. Run once with an administrative database connection.
begin;
create table if not exists public.cvt_orders (
  id uuid primary key,
  session_hash text not null,
  idempotency_key text not null,
  payload_hash text not null,
  snapshot jsonb not null,
  total_cents bigint not null check (total_cents > 0),
  currency text not null default 'BRL' check (currency = 'BRL'),
  live_mode boolean not null,
  status text not null default 'creating' check (status in ('creating','pending','setup_unknown','setup_failed','paid','rejected','refunded','partially_refunded','charged_back','payment_review')),
  preference_id text,
  redirect_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_hash, idempotency_key)
);
create table if not exists public.cvt_payments (
  id text primary key,
  order_id uuid not null references public.cvt_orders(id),
  status text not null,
  amount_cents bigint not null check (amount_cents > 0),
  refunded_cents bigint not null check (refunded_cents >= 0 and refunded_cents <= amount_cents),
  source_updated_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index if not exists cvt_payments_order_id_idx on public.cvt_payments(order_id);
create table if not exists public.cvt_artworks (
  id uuid primary key,
  session_hash text not null,
  side text not null check (side in ('front','back')),
  object_path text unique not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 15728640),
  created_at timestamptz not null default now()
);
alter table public.cvt_orders enable row level security;
alter table public.cvt_payments enable row level security;
alter table public.cvt_artworks enable row level security;
revoke all on public.cvt_orders, public.cvt_payments, public.cvt_artworks from public, anon, authenticated;
grant select, insert, update on public.cvt_orders, public.cvt_payments, public.cvt_artworks to service_role;

-- The order lock serializes simultaneous notifications and keeps stale events
-- from overwriting newer API state. Only the backend service role can call this.
create or replace function public.cvt_record_payment(p_order_id uuid, p_payment jsonb)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  expected bigint;
  gross bigint;
  refunded bigint;
  chargebacks integer;
  pending integer;
  rejected integer;
  next_status text;
begin
  select total_cents into expected from public.cvt_orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if exists (select 1 from public.cvt_payments where id = p_payment->>'id' and order_id <> p_order_id) then
    raise exception 'Payment belongs to another order';
  end if;
  insert into public.cvt_payments(id, order_id, status, amount_cents, refunded_cents, source_updated_at)
    values (p_payment->>'id', p_order_id, p_payment->>'status', (p_payment->>'amountCents')::bigint,
      (p_payment->>'refundedCents')::bigint, (p_payment->>'updatedAt')::timestamptz)
    on conflict (id) do update set status = excluded.status, amount_cents = excluded.amount_cents,
      refunded_cents = excluded.refunded_cents, source_updated_at = excluded.source_updated_at, updated_at = now()
      where public.cvt_payments.source_updated_at < excluded.source_updated_at;
  select
    coalesce(sum(amount_cents) filter (where status in ('approved','refunded','charged_back')),0),
    coalesce(sum(refunded_cents) filter (where status in ('approved','refunded','charged_back')),0),
    count(*) filter (where status = 'charged_back'),
    count(*) filter (where status in ('pending','in_process','authorized','in_mediation')),
    count(*) filter (where status in ('rejected','cancelled'))
    into gross, refunded, chargebacks, pending, rejected from public.cvt_payments where order_id = p_order_id;
  next_status := case
    when chargebacks > 0 then 'charged_back'
    when gross > expected then 'payment_review'
    when gross > 0 and refunded = gross then 'refunded'
    when gross = expected and refunded > 0 then 'partially_refunded'
    when gross = expected then 'paid'
    when gross > 0 or pending > 0 then 'pending'
    when rejected > 0 then 'rejected'
    else 'pending' end;
  update public.cvt_orders set status = next_status, updated_at = now() where id = p_order_id;
  return next_status;
end $$;
revoke all on function public.cvt_record_payment(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.cvt_record_payment(uuid,jsonb) to service_role;
commit;

import { randomUUID } from 'node:crypto';
import { query } from './setup-checkout.mjs';
const id = randomUUID();
const status = await query(`
begin;
insert into public.cvt_orders(id,session_hash,idempotency_key,payload_hash,snapshot,total_cents,live_mode)
  values ('${id}','rollback-only-test','${id}','fixture','{}',11000,false);
do $$
declare result text;
begin
  result := public.cvt_record_payment('${id}','{"id":"rollback-payment-1","status":"approved","amountCents":6000,"refundedCents":0,"updatedAt":"2026-01-01T00:00:01Z"}');
  if result <> 'pending' then raise exception 'Partial payment incorrectly confirmed order'; end if;
  result := public.cvt_record_payment('${id}','{"id":"rollback-payment-2","status":"approved","amountCents":5000,"refundedCents":0,"updatedAt":"2026-01-01T00:00:02Z"}');
  if result <> 'paid' then raise exception 'Approved total did not confirm order'; end if;
  result := public.cvt_record_payment('${id}','{"id":"rollback-payment-2","status":"approved","amountCents":5000,"refundedCents":0,"updatedAt":"2026-01-01T00:00:02Z"}');
  if result <> 'paid' then raise exception 'Duplicate notification changed state'; end if;
  result := public.cvt_record_payment('${id}','{"id":"rollback-payment-2","status":"rejected","amountCents":5000,"refundedCents":0,"updatedAt":"2026-01-01T00:00:01Z"}');
  if result <> 'paid' then raise exception 'Old notification downgraded payment'; end if;
  result := public.cvt_record_payment('${id}','{"id":"rollback-payment-2","status":"approved","amountCents":5000,"refundedCents":2000,"updatedAt":"2026-01-01T00:00:03Z"}');
  if result <> 'partially_refunded' then raise exception 'Partial refund not represented'; end if;
  result := public.cvt_record_payment('${id}','{"id":"rollback-payment-1","status":"refunded","amountCents":6000,"refundedCents":6000,"updatedAt":"2026-01-01T00:00:04Z"}');
  result := public.cvt_record_payment('${id}','{"id":"rollback-payment-2","status":"refunded","amountCents":5000,"refundedCents":5000,"updatedAt":"2026-01-01T00:00:05Z"}');
  if result <> 'refunded' then raise exception 'Full refund not represented'; end if;
  result := public.cvt_record_payment('${id}','{"id":"rollback-payment-2","status":"charged_back","amountCents":5000,"refundedCents":5000,"updatedAt":"2026-01-01T00:00:06Z"}');
  if result <> 'charged_back' then raise exception 'Chargeback not represented'; end if;
  if (select count(*) from public.cvt_payments where order_id='${id}') <> 2 then raise exception 'Duplicate payment records'; end if;
  if has_function_privilege('anon','public.cvt_record_payment(uuid,jsonb)','EXECUTE') then raise exception 'Public RPC execution allowed'; end if;
end $$;
rollback;
select count(*)::integer as remaining_test_rows from public.cvt_orders where id='${id}';
`, false);
if (status[0]?.remaining_test_rows !== 0) throw new Error('Database verification did not roll back.');
console.log(JSON.stringify({ passed: 9, rollbackVerified: true, livePaymentsCreated: 0 }));

import { randomUUID } from 'node:crypto';
import { query } from './setup-checkout.mjs';
const id=randomUUID(),key=randomUUID();
const result=await query(`begin;
insert into public.cvt_inquiries(id,reference,idempotency_key,payload_hash,purpose,customer,items,details)
values ('${id}','ROLLBACK-${id}','${key}','test','support','{"name":"Rollback test"}','[]','{"notes":"Temporary transaction"}');
do $$ begin
  if (select status from public.cvt_inquiries where id='${id}')<>'new' then raise exception 'Invalid initial status';end if;
  if has_table_privilege('anon','public.cvt_inquiries','SELECT') or has_table_privilege('anon','public.cvt_inquiries','INSERT') or has_table_privilege('authenticated','public.cvt_inquiries','SELECT') then raise exception 'Request table is not private';end if;
  update public.cvt_inquiries set status='reviewing' where id='${id}';
  if (select status from public.cvt_inquiries where id='${id}')<>'reviewing' then raise exception 'Status did not update';end if;
end $$;
rollback;
select count(*)::integer as remaining_test_rows from public.cvt_inquiries where id='${id}';`,false);
if(result[0]?.remaining_test_rows!==0)throw new Error('Verification did not roll back.');
console.log(JSON.stringify({privateTable:true,insertAndStatusVerified:true,rollbackVerified:true,liveRequestsCreated:0}));

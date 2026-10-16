-- Additive, repeatable migration. All access is mediated by the Node backend.
create table if not exists public.up_production_teams(id uuid primary key default gen_random_uuid(), name text not null);
create table if not exists public.up_production_operators(user_id uuid primary key references auth.users(id) on delete cascade, team_id uuid not null references public.up_production_teams(id), role text not null check(role in ('admin','operator')), enabled boolean not null default true);
create table if not exists public.up_production_jobs(id uuid primary key default gen_random_uuid(), team_id uuid not null references public.up_production_teams(id), created_by uuid not null references auth.users(id), name text not null, state text not null default 'awaiting_file', revision integer not null default 0, parameters jsonb, analysis jsonb, result jsonb, validation jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.up_production_workers(id uuid primary key default gen_random_uuid(), team_id uuid not null references public.up_production_teams(id), name text not null, token_hash text unique not null, revoked boolean not null default false, capabilities jsonb not null default '{}', heartbeat_at timestamptz, instance_id text, live_authorized boolean not null default false);
create table if not exists public.up_production_tasks(id uuid primary key default gen_random_uuid(), job_id uuid not null references public.up_production_jobs(id) on delete cascade, operation text not null check(operation in ('analyze','nest','validate','preview','export')), capability text not null, snapshot jsonb not null, state text not null default 'queued', worker_id uuid references public.up_production_workers(id), lease_token uuid, lease_until timestamptz, attempts integer not null default 0, idempotency_key text not null, progress integer not null default 0 check(progress between 0 and 100), message text, created_at timestamptz not null default now(), finished_at timestamptz, unique(job_id,idempotency_key));
create unique index if not exists up_production_one_active_job on public.up_production_tasks(job_id) where state in ('queued','running','needs_review');
create unique index if not exists up_production_one_active_worker on public.up_production_tasks(worker_id) where state='running';
create index if not exists up_production_queue on public.up_production_tasks(created_at) where state='queued';
create table if not exists public.up_production_artifacts(id uuid primary key default gen_random_uuid(), job_id uuid not null references public.up_production_jobs(id) on delete cascade, task_id uuid references public.up_production_tasks(id), kind text not null check(kind in ('original','work','preview','result','validation','live')), name text not null, mime text not null, storage_key text not null, sha256 text not null, size bigint not null, created_at timestamptz not null default now());
create table if not exists public.up_production_events(id uuid primary key default gen_random_uuid(), job_id uuid not null references public.up_production_jobs(id) on delete cascade, task_id uuid references public.up_production_tasks(id), action text not null, message text not null, data jsonb not null default '{}', created_at timestamptz not null default now());
create table if not exists public.up_production_messages(id uuid primary key default gen_random_uuid(), job_id uuid not null references public.up_production_jobs(id) on delete cascade, role text not null check(role in ('user','assistant')), content text not null, created_at timestamptz not null default now());
create table if not exists public.up_production_tokens(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, token_hash text unique not null, revoked boolean not null default false, expires_at timestamptz not null default now()+interval '30 days');

-- No direct Data API access, including worker hashes. Service role stays on server.
create unique index if not exists up_production_one_original on public.up_production_artifacts(job_id) where kind='original';
do $$ declare t text; begin
foreach t in array array['teams','operators','jobs','workers','tasks','artifacts','events','messages','tokens'] loop
 execute format('alter table public.up_production_%I enable row level security',t);
 execute format('revoke all on public.up_production_%I from anon, authenticated',t);
 execute format('grant all on public.up_production_%I to service_role',t);
end loop; end $$;

create or replace function public.up_production_enqueue(p_job uuid,p_team uuid,p_revision integer,p_operation text,p_capability text,p_key text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare j up_production_jobs; t up_production_tasks; begin
 select * into j from up_production_jobs where id=p_job and team_id=p_team for update;
 if not found then raise exception 'job unavailable'; end if;
 select * into t from up_production_tasks where job_id=p_job and idempotency_key=p_key;
 if found then return to_jsonb(t); end if;
 if j.revision<>p_revision then raise exception 'revision changed'; end if;
 insert into up_production_tasks(job_id,operation,capability,snapshot,idempotency_key) values(p_job,p_operation,p_capability,to_jsonb(j),p_key) returning * into t;
 update up_production_jobs set state='awaiting_worker',updated_at=now() where id=p_job;
 return to_jsonb(t); end $$;

create or replace function public.up_production_claim(p_worker uuid,p_instance text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare w up_production_workers; t up_production_tasks; begin
 select * into w from up_production_workers where id=p_worker and not revoked for update;
 if not found then raise exception 'worker revoked'; end if;
 -- Ambiguous interrupted work is held for explicit operator review, never replayed.
 update up_production_tasks set state='needs_review',message='Conexão interrompida. Confira o documento antes de repetir.' where worker_id=w.id and state='running' and lease_until<now();
 if exists(select 1 from up_production_tasks where worker_id=w.id and state in ('running','needs_review')) then return null; end if;
 select t0.* into t from up_production_tasks t0 join up_production_jobs j on j.id=t0.job_id where j.team_id=w.team_id and t0.state='queued' and (w.capabilities->'operations') ? t0.capability order by t0.created_at for update of t0 skip locked limit 1;
 if not found then return null; end if;
 update up_production_tasks set state='running',worker_id=w.id,lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds',attempts=attempts+1,message='Trabalho adquirido pelo computador.' where id=t.id returning * into t;
 update up_production_workers set instance_id=p_instance,heartbeat_at=now() where id=w.id;
 update up_production_jobs set state=case t.operation when 'analyze' then 'analyzing' when 'nest' then 'nesting' else 'validating' end,updated_at=now() where id=t.job_id;
 insert into up_production_events(job_id,task_id,action,message) values(t.job_id,t.id,'claimed','Computador iniciou '||t.operation||'.');
 return to_jsonb(t); end $$;

create or replace function public.up_production_progress(p_worker uuid,p_task uuid,p_lease uuid,p_progress integer,p_message text,p_event uuid)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare t up_production_tasks; begin
 select * into t from up_production_tasks where id=p_task and worker_id=p_worker and lease_token=p_lease and state='running' and lease_until>now() for update;
 if not found then return false; end if;
 update up_production_tasks set lease_until=now()+interval '90 seconds',progress=greatest(progress,least(99,greatest(0,p_progress))),message=left(p_message,500) where id=t.id;
 insert into up_production_events(id,job_id,task_id,action,message) values(p_event,t.job_id,t.id,'progress',left(p_message,500)) on conflict(id) do nothing;
 return true; end $$;

create or replace function public.up_production_finish(p_worker uuid,p_task uuid,p_lease uuid,p_ok boolean,p_result jsonb,p_artifacts jsonb,p_message text)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare t up_production_tasks; a jsonb; begin
 select * into t from up_production_tasks where id=p_task and worker_id=p_worker and lease_token=p_lease for update;
 if not found then return false; end if;
 if t.state in ('completed','failed') then return true; end if;
 if t.state<>'running' or t.lease_until<now() then return false; end if;
 for a in select * from jsonb_array_elements(p_artifacts) loop
 insert into up_production_artifacts(id,job_id,task_id,kind,name,mime,storage_key,sha256,size) values((a->>'id')::uuid,t.job_id,t.id,a->>'kind',a->>'name',a->>'mime',a->>'storage_key',a->>'sha256',(a->>'size')::bigint) on conflict(id) do nothing;
 end loop;
 update up_production_tasks set state=case when p_ok then 'completed' else 'failed' end,progress=case when p_ok then 100 else progress end,message=left(p_message,500),finished_at=now() where id=t.id;
 update up_production_jobs set state=case when not p_ok then 'failed' when t.operation='analyze' then 'awaiting_parameters' when coalesce((p_result->'validation'->>'valid')::boolean,true) then 'completed' else 'failed' end,analysis=case when p_ok and t.operation='analyze' then p_result->'analysis' else analysis end,result=case when p_ok and t.operation<>'analyze' then p_result else result end,validation=coalesce(p_result->'validation',validation),updated_at=now() where id=t.job_id;
 insert into up_production_events(job_id,task_id,action,message,data) values(t.job_id,t.id,case when p_ok then 'completed' else 'failed' end,left(p_message,500),p_result);
 return true; end $$;

-- Only the backend may call these transactional operations.
create or replace function public.up_production_configure(p_job uuid,p_team uuid,p_revision integer,p_parameters jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare j up_production_jobs; begin
 select * into j from up_production_jobs where id=p_job and team_id=p_team for update;
 if not found or j.revision<>p_revision then raise exception 'revision changed'; end if;
 if exists(select 1 from up_production_tasks where job_id=p_job and state in ('queued','running','needs_review')) then raise exception 'job busy'; end if;
 update up_production_jobs set parameters=p_parameters,revision=revision+1,state='ready',result=null,validation=null,updated_at=now() where id=p_job returning * into j;
 return to_jsonb(j); end $$;
revoke all on function public.up_production_configure(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.up_production_configure(uuid,uuid,integer,jsonb) to service_role;
revoke all on function public.up_production_enqueue(uuid,uuid,integer,text,text,text) from public,anon,authenticated;
revoke all on function public.up_production_claim(uuid,text) from public,anon,authenticated;
revoke all on function public.up_production_progress(uuid,uuid,uuid,integer,text,uuid) from public,anon,authenticated;
revoke all on function public.up_production_finish(uuid,uuid,uuid,boolean,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.up_production_enqueue(uuid,uuid,integer,text,text,text),public.up_production_claim(uuid,text),public.up_production_progress(uuid,uuid,uuid,integer,text,uuid),public.up_production_finish(uuid,uuid,uuid,boolean,jsonb,jsonb,text) to service_role;

-- Run once in the SQL Editor of your own Supabase project.
-- Authentication is provided by Supabase Auth; no passwords are stored here.
begin;
create table if not exists public.luma_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object' and data ->> 'version' = '2'),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
alter table public.luma_states enable row level security;
alter table public.luma_states force row level security;
revoke all on public.luma_states from anon;
grant select, insert, update on public.luma_states to authenticated;
drop policy if exists "Own Luma data only" on public.luma_states;
create policy "Own Luma data only" on public.luma_states
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Compare-and-swap protects against silent overwrites between devices.
-- Invoker privileges preserve RLS. The user ID is taken from the verified JWT.
create or replace function public.luma_save_state(new_data jsonb, expected_revision integer, expected_user uuid)
returns integer language plpgsql security invoker set search_path = '' as $$
declare saved_revision integer;
begin
  if auth.uid() is null or expected_user is distinct from auth.uid() then raise exception 'LUMA_UNAUTHENTICATED'; end if;
  if new_data ->> 'version' is distinct from '2' or octet_length(new_data::text) > 5000000 then
    raise exception 'LUMA_INVALID_DATA';
  end if;
  if expected_revision = 0 then
    insert into public.luma_states (user_id, data, revision)
    values (auth.uid(), new_data, 1)
    on conflict (user_id) do nothing
    returning revision into saved_revision;
  else
    update public.luma_states set data = new_data, revision = revision + 1, updated_at = now()
    where user_id = auth.uid() and revision = expected_revision
    returning revision into saved_revision;
  end if;
  if saved_revision is null then raise exception 'LUMA_CONFLICT'; end if;
  return saved_revision;
end;
$$;
revoke all on function public.luma_save_state(jsonb, integer, uuid) from public, anon;
grant execute on function public.luma_save_state(jsonb, integer, uuid) to authenticated;
commit;

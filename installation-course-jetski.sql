-- Course de jet-ski partagée en direct
-- À exécuter une seule fois dans Supabase > SQL Editor.

create table if not exists public.jetski_tournament_state (
  id smallint primary key default 1 check (id = 1),
  state jsonb not null default '{}'::jsonb,
  updated_by text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.jetski_tournament_state (id, state, updated_by)
values (1, '{}'::jsonb, '')
on conflict (id) do nothing;

create or replace function public.touch_jetski_tournament_state()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;

drop trigger if exists jetski_tournament_state_updated_at on public.jetski_tournament_state;
create trigger jetski_tournament_state_updated_at
before update on public.jetski_tournament_state
for each row execute function public.touch_jetski_tournament_state();

alter table public.jetski_tournament_state enable row level security;

drop policy if exists "Lecture tournoi jet ski" on public.jetski_tournament_state;
create policy "Lecture tournoi jet ski"
on public.jetski_tournament_state
for select
to authenticated
using (true);

drop policy if exists "Creation tournoi jet ski" on public.jetski_tournament_state;
create policy "Creation tournoi jet ski"
on public.jetski_tournament_state
for insert
to authenticated
with check (id = 1);

drop policy if exists "Modification tournoi jet ski" on public.jetski_tournament_state;
create policy "Modification tournoi jet ski"
on public.jetski_tournament_state
for update
to authenticated
using (id = 1)
with check (id = 1);

grant select, insert, update on public.jetski_tournament_state to authenticated;
alter table public.jetski_tournament_state replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'jetski_tournament_state'
  ) then
    alter publication supabase_realtime add table public.jetski_tournament_state;
  end if;
end
$$;

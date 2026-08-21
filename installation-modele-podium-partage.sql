-- À exécuter une seule fois dans Supabase > SQL Editor.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('podium-templates','podium-templates',true,52428800,array['video/mp4','video/webm'])
on conflict (id) do update set public=true,file_size_limit=52428800,allowed_mime_types=array['video/mp4','video/webm'];

create table if not exists public.podium_template_config (
  id smallint primary key default 1 check (id=1),
  public_url text not null,
  mime_type text not null,
  file_size bigint not null default 0,
  version text not null,
  updated_at timestamptz not null default now(),
  updated_by text not null
);

alter table public.podium_template_config enable row level security;
drop policy if exists "Lecture publique du modèle podium" on public.podium_template_config;
create policy "Lecture publique du modèle podium" on public.podium_template_config for select to anon using (true);
grant select on public.podium_template_config to anon;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='podium_template_config') then
    alter publication supabase_realtime add table public.podium_template_config;
  end if;
end $$;

-- Aucune règle INSERT/UPDATE n'est donnée à anon : seule l'Edge Function
-- utilisant SUPABASE_SERVICE_ROLE_KEY peut remplacer le modèle.
notify pgrst, 'reload schema';


-- À exécuter une fois dans Supabase > SQL Editor avant de redéployer employee-admin.
alter table public.employee_profiles
  add column if not exists approval_status text not null default 'approved'
  check (approval_status in ('pending','approved'));

create or replace function public.liste_employes_connexion()
returns table(username text,display_name text)
language sql stable security definer set search_path=public as $$
  select p.username,p.display_name from employee_profiles p
  where p.active and p.approval_status='approved' order by p.display_name
$$;
grant execute on function public.liste_employes_connexion() to anon,authenticated;

create or replace function public.mon_profil_employe()
returns jsonb language plpgsql security definer set search_path=public as $$
declare p employee_profiles%rowtype;
begin
  select * into p from employee_profiles
  where user_id=auth.uid() and active and approval_status='approved';
  if not found then raise exception 'Compte employé absent, en attente ou désactivé'; end if;
  update employee_profiles set last_seen_at=now() where user_id=p.user_id;
  return jsonb_build_object('username',p.username,'display_name',p.display_name,'role',p.role);
end;$$;
grant execute on function public.mon_profil_employe() to authenticated;
notify pgrst,'reload schema';


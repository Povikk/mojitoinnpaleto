-- Remplace le mot de passe général par le rôle du compte administrateur connecté.
create or replace function public.supprimer_image_importante(p_id bigint,p_operator_name text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.est_admin_mojito() then raise exception 'Action réservée aux administrateurs'; end if;
  if exists(select 1 from public.important_images where id=p_id and is_fixed) then
    raise exception 'Cette image principale est protégée';
  end if;
  delete from public.important_images where id=p_id;
end;$$;
revoke execute on function public.supprimer_image_importante(bigint,text) from anon;
grant execute on function public.supprimer_image_importante(bigint,text) to authenticated;

-- L’ancien secret partagé et ses fonctions ne sont plus nécessaires.
drop function if exists public.changer_mot_de_passe_application(text,text,text);
drop function if exists public.verifier_acces_application(text);
drop table if exists public.app_security;
notify pgrst,'reload schema';


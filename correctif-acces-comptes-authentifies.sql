-- À exécuter une seule fois après l'installation des comptes employés.
-- Les anciennes tables avaient été autorisées pour `anon` uniquement.
-- Ce script donne aux comptes connectés exactement les mêmes droits applicatifs.

do $$
declare permission record;
begin
  for permission in
    select table_schema,table_name,string_agg(privilege_type,', ' order by privilege_type) privileges
    from information_schema.role_table_grants
    where grantee='anon' and table_schema='public'
    group by table_schema,table_name
  loop
    execute format(
      'grant %s on table %I.%I to authenticated',
      permission.privileges,permission.table_schema,permission.table_name
    );
  end loop;
end;
$$;

-- Les politiques RLS réservées à `anon` doivent également accepter les comptes connectés.
do $$
declare policy_row record;
begin
  for policy_row in
    select schemaname,tablename,policyname
    from pg_policies
    where schemaname='public' and 'anon'=any(roles) and not ('authenticated'=any(roles))
  loop
    execute format(
      'alter policy %I on %I.%I to anon, authenticated',
      policy_row.policyname,policy_row.schemaname,policy_row.tablename
    );
  end loop;
end;
$$;

grant usage,select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- Les données d'identité restent protégées par leur politique personnelle.
revoke all on public.employee_profiles from anon;
revoke insert,update,delete on public.employee_profiles from authenticated;
grant select on public.employee_profiles to authenticated;

notify pgrst,'reload schema';


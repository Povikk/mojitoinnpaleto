-- Corrige les noms du podium qui revenaient à leur ancienne casse après synchronisation.
create or replace function public.sauvegarder_podium_ardoises(
  p_week_start timestamp without time zone,
  p_ranking jsonb,
  p_operator_name text
) returns void
language plpgsql security definer set search_path=public as $$
begin
  if p_week_start is null then raise exception 'Semaine invalide';end if;
  if jsonb_typeof(p_ranking)<>'array' or jsonb_array_length(p_ranking)>10 then raise exception 'Classement invalide';end if;
  if nullif(trim(p_operator_name),'') is null or length(trim(p_operator_name))>30 then raise exception 'Nom de l''employé invalide';end if;

  delete from podium_manual_adjustments where week_start=p_week_start;

  with submitted as (
    select lower(trim(x.name)) as normalized_name,(array_agg(trim(x.name)))[1] as name,max(greatest(0,x.total))::numeric as total
    from jsonb_to_recordset(p_ranking) as x(name text,total numeric)
    where nullif(trim(x.name),'') is not null and length(trim(x.name))<=50
    group by lower(trim(x.name))
  ), base_raw as (
    select lower(trim(l.debtor_name)) as normalized_name,sum(l.amount)::numeric as total
    from ardoise_logs l
    where l.operation='add' and coalesce(l.counts_for_podium,true) and nullif(trim(l.debtor_name),'') is not null
      and l.created_at>=p_week_start at time zone 'Europe/Paris'
      and l.created_at<(p_week_start+interval '7 days') at time zone 'Europe/Paris'
    group by lower(trim(l.debtor_name))
  ), base as (
    select *,row_number() over(order by total desc,normalized_name) as position from base_raw
  ), wanted as (
    select s.normalized_name,s.name,s.total-coalesce(b.total,0) as adjustment
    from submitted s left join base b using(normalized_name)
    union all
    select b.normalized_name,b.normalized_name,-b.total
    from base b where b.position<=10 and not exists(select 1 from submitted s where s.normalized_name=b.normalized_name)
  )
  insert into podium_manual_adjustments(week_start,normalized_name,name,adjustment,updated_by,updated_at)
  select p_week_start,normalized_name,name,adjustment,trim(p_operator_name),now() from wanted;

  insert into ardoise_people(name,normalized_name,updated_at)
  select (array_agg(trim(x.name)))[1],lower(trim(x.name)),now()
  from jsonb_to_recordset(p_ranking) as x(name text,total numeric)
  where nullif(trim(x.name),'') is not null and length(trim(x.name))<=50
  group by lower(trim(x.name))
  on conflict(normalized_name) do update set name=excluded.name,updated_at=now();
end;
$$;

grant execute on function public.sauvegarder_podium_ardoises(timestamp without time zone,jsonb,text) to authenticated;
notify pgrst,'reload schema';


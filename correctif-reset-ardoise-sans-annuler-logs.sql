-- Répare la dernière remise à zéro et empêche les prochaines remises à zéro
-- d'annuler les ventes du journal permanent « Contrôle équipe ».

-- Retire seulement les annulations créées au même instant que la dernière
-- remise à zéro. Les lignes de vente permanentes d'origine restent intactes.
delete from public.team_audit_logs audit
using public.ardoise_state state
where state.id=1 and state.balance=0
  and audit.source='tab' and audit.action='cancel'
  and audit.created_at between state.updated_at-interval'30 seconds' and state.updated_at+interval'30 seconds';

create or replace function public.audit_ardoise_log()returns trigger language plpgsql security definer set search_path=public as $$
declare current_service bigint;
begin
  if tg_op='INSERT'and new.operation in('payment','add')then
    select id into current_service from bar_services where status='open'limit 1;
    insert into team_audit_logs(sale_id,service_id,operator_name,source,action,item_name,quantity,unit_amount,total_amount,created_at)
    values(coalesce(new.sale_id,gen_random_uuid()),current_service,new.operator_name,case when new.operation='add'then'addition'else'tab'end,'sale',case when new.operation='add'then coalesce('Ardoise de '||nullif(trim(new.debtor_name),''),'Ajout à l’ardoise')else coalesce(new.item_name,'Montant libre')end,coalesce(new.quantity,1),new.amount/greatest(coalesce(new.quantity,1),1),new.amount,new.created_at);
    return new;
  elsif tg_op='DELETE'and old.operation='payment'then
    if coalesce(current_setting('mojito.reset_ardoise',true),'0')='1'then return old;end if;
    select service_id into current_service from team_audit_logs where sale_id=old.sale_id order by id limit 1;
    insert into team_audit_logs(sale_id,service_id,operator_name,source,action,item_name,quantity,unit_amount,total_amount)
    values(coalesce(old.sale_id,gen_random_uuid()),current_service,old.operator_name,'tab','cancel',coalesce(old.item_name,'Montant libre'),-coalesce(old.quantity,1),-(old.amount/greatest(coalesce(old.quantity,1),1)),-old.amount);
    return old;
  end if;
  if tg_op='DELETE'then return old;else return new;end if;
end;$$;

create or replace function public.remettre_ardoise_a_zero()returns void language plpgsql security definer set search_path=public as $$
declare admin_name text:=public.exiger_admin_mojito();
begin
  insert into podium_manual_adjustments(week_start,normalized_name,name,adjustment,updated_by,updated_at)
  select date_trunc('week',(l.created_at at time zone'Europe/Paris')+interval'4 hours')-interval'4 hours',lower(trim(l.debtor_name)),(array_agg(trim(l.debtor_name)order by l.created_at desc))[1],sum(l.amount),admin_name,now()
  from ardoise_logs l where l.operation='add'and coalesce(l.counts_for_podium,true)and nullif(trim(l.debtor_name),'')is not null group by 1,2
  on conflict(week_start,normalized_name)do update set adjustment=podium_manual_adjustments.adjustment+excluded.adjustment,name=excluded.name,updated_by=excluded.updated_by,updated_at=now();
  perform set_config('mojito.reset_ardoise','1',true);
  update ardoise_state set balance=0,peak=0,updated_at=now()where id=1;
  delete from ardoise_logs where id>0;
end;$$;

revoke execute on function public.remettre_ardoise_a_zero()from anon,public;
grant execute on function public.remettre_ardoise_a_zero()to authenticated;
notify pgrst,'reload schema';


-- À utiliser si installation-controle-equipe.sql a déjà été exécuté.
-- Importe les anciennes lignes d’ardoise encore présentes, dont Giuseppe.
insert into public.team_audit_logs(sale_id,service_id,operator_name,source,action,item_name,quantity,unit_amount,total_amount,created_at)
select coalesce(log.sale_id,gen_random_uuid()),service.id,log.operator_name,'tab','sale',coalesce(log.item_name,'Montant libre'),coalesce(log.quantity,1),log.amount/greatest(coalesce(log.quantity,1),1),log.amount,log.created_at
from public.ardoise_logs log
left join lateral(
  select bar.id from public.bar_services bar
  where bar.opened_at<=log.created_at and coalesce(bar.closed_at,now())>=log.created_at
  order by bar.opened_at desc limit 1
)service on true
where log.operation='payment'
and not exists(
  select 1 from public.team_audit_logs audit
  where audit.action='sale' and audit.source='tab'
    and lower(audit.operator_name)=lower(log.operator_name)
    and audit.created_at=log.created_at
    and audit.item_name=coalesce(log.item_name,'Montant libre')
    and audit.total_amount=log.amount
);

notify pgrst,'reload schema';


-- À exécuter une fois dans l’éditeur SQL de Supabase.
create table if not exists public.team_audit_logs(id bigint generated always as identity primary key,sale_id uuid not null default gen_random_uuid(),service_id bigint references public.bar_services(id) on delete set null,operator_name text not null,source text not null check(source in('tab','order')),action text not null default 'sale' check(action in('sale','cancel')),item_name text not null,quantity integer not null default 1,unit_amount numeric not null default 0,total_amount numeric not null default 0,created_at timestamptz not null default now());
create index if not exists team_audit_logs_week_idx on public.team_audit_logs(created_at desc);
create index if not exists team_audit_logs_operator_idx on public.team_audit_logs(lower(operator_name),created_at desc);
create index if not exists team_audit_logs_sale_idx on public.team_audit_logs(sale_id);
alter table public.team_audit_logs enable row level security;
revoke all on public.team_audit_logs from anon,authenticated;

create or replace function public.audit_ardoise_log()returns trigger language plpgsql security definer set search_path=public as $$
declare current_service bigint;
begin
 if tg_op='INSERT'and new.operation='payment'then select id into current_service from bar_services where status='open'limit 1;insert into team_audit_logs(sale_id,service_id,operator_name,source,action,item_name,quantity,unit_amount,total_amount,created_at)values(coalesce(new.sale_id,gen_random_uuid()),current_service,new.operator_name,'tab','sale',coalesce(new.item_name,'Montant libre'),coalesce(new.quantity,1),new.amount/greatest(coalesce(new.quantity,1),1),new.amount,new.created_at);return new;
 elsif tg_op='DELETE'and old.operation='payment'then select service_id into current_service from team_audit_logs where sale_id=old.sale_id order by id limit 1;insert into team_audit_logs(sale_id,service_id,operator_name,source,action,item_name,quantity,unit_amount,total_amount)values(coalesce(old.sale_id,gen_random_uuid()),current_service,old.operator_name,'tab','cancel',coalesce(old.item_name,'Montant libre'),-coalesce(old.quantity,1),-(old.amount/greatest(coalesce(old.quantity,1),1)),-old.amount);return old;end if;if tg_op='DELETE'then return old;else return new;end if;
end;$$;
drop trigger if exists audit_ardoise_logs_permanent on public.ardoise_logs;
create trigger audit_ardoise_logs_permanent after insert or delete on public.ardoise_logs for each row execute function public.audit_ardoise_log();

-- Récupère aussi les anciennes opérations encore présentes au moment de
-- l’installation (par exemple celles de Giuseppe), sans les dupliquer.
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

create or replace function public.enregistrer_commande_simple_detaillee(p_items jsonb,p_operator_name text)returns uuid language plpgsql security definer set search_path=public as $$
declare clean_name text:=left(trim(p_operator_name),30);current_service bigint;new_sale uuid:=gen_random_uuid();total_amount numeric;item_count integer;
begin
 if length(clean_name)<1 or jsonb_typeof(p_items)<>'array'or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>100 then raise exception 'Commande invalide';end if;
 select coalesce(sum((x->>'amount')::numeric),0),count(*)into total_amount,item_count from jsonb_array_elements(p_items)x;if total_amount<=0 then raise exception 'Montant invalide';end if;
 perform fermer_service_si_inactif();select id into current_service from bar_services where status='open'limit 1;
 if current_service is null then begin insert into bar_services(name,opened_by)values(nom_service_automatique(),clean_name)returning id into current_service;exception when unique_violation then select id into current_service from bar_services where status='open'limit 1;end;end if;
 insert into stats_equipe(operator_name,revenue,items,orders)values(clean_name,total_amount,item_count,1)on conflict(operator_name)do update set revenue=stats_equipe.revenue+excluded.revenue,items=stats_equipe.items+excluded.items,orders=stats_equipe.orders+1,updated_at=now();
 insert into sales_events(service_id,operator_name,revenue,items,orders,source,sale_id)values(current_service,clean_name,total_amount,item_count,1,'order',new_sale);
 insert into team_audit_logs(sale_id,service_id,operator_name,source,action,item_name,quantity,unit_amount,total_amount)select new_sale,current_service,clean_name,'order','sale',left(item_label,80),qty,unit_amount,qty*unit_amount from(select coalesce(x->>'logName',x->>'name','Article')item_label,(x->>'amount')::numeric unit_amount,count(*)::integer qty from jsonb_array_elements(p_items)x group by 1,2)g;
 return new_sale;
end;$$;
grant execute on function public.enregistrer_commande_simple_detaillee(jsonb,text)to anon,authenticated;

create or replace function public.annuler_commande_simple_detaillee(p_sale_id uuid,p_operator_name text)returns void language plpgsql security definer set search_path=public as $$
declare sale sales_events%rowtype;
begin select*into sale from sales_events where sale_id=p_sale_id and source='order'for update;if not found then raise exception 'Commande introuvable';end if;if lower(trim(p_operator_name))<>lower(sale.operator_name)and lower(trim(p_operator_name))not in('kai','summer')then raise exception 'Action refusée';end if;
 insert into team_audit_logs(sale_id,service_id,operator_name,source,action,item_name,quantity,unit_amount,total_amount)select sale_id,service_id,operator_name,source,'cancel',item_name,-quantity,-unit_amount,-total_amount from team_audit_logs where sale_id=p_sale_id and action='sale';
 update stats_equipe set revenue=greatest(0,revenue-sale.revenue),items=greatest(0,items-sale.items),orders=greatest(0,orders-sale.orders),updated_at=now()where lower(operator_name)=lower(sale.operator_name);delete from stats_equipe where revenue=0 and items=0 and orders=0;delete from sales_events where id=sale.id;
end;$$;
grant execute on function public.annuler_commande_simple_detaillee(uuid,text)to anon,authenticated;

create or replace function public.lire_controle_equipe(p_requester_name text,p_week_start timestamptz)returns table(id bigint,sale_id uuid,service_id bigint,service_name text,operator_name text,source text,action text,item_name text,quantity integer,unit_amount numeric,total_amount numeric,created_at timestamptz)language plpgsql stable security definer set search_path=public as $$
begin if lower(trim(p_requester_name))not in('kai','summer')then raise exception 'Action réservée à Kai et Summer';end if;return query select a.id,a.sale_id,a.service_id,s.name,a.operator_name,a.source,a.action,a.item_name,a.quantity,a.unit_amount,a.total_amount,a.created_at from team_audit_logs a left join bar_services s on s.id=a.service_id where a.created_at>=p_week_start and a.created_at<p_week_start+interval'7 days'order by a.created_at desc,a.id desc;end;$$;
grant execute on function public.lire_controle_equipe(text,timestamptz)to anon,authenticated;
notify pgrst,'reload schema';


-- À exécuter une fois dans Supabase > SQL Editor.
alter table public.room_bookings add column if not exists booking_type text not null default 'room';
alter table public.room_bookings add column if not exists formula integer;
alter table public.room_bookings add column if not exists persons integer;
alter table public.room_bookings add column if not exists jetski integer not null default 0;
alter table public.room_bookings add column if not exists sailboat integer not null default 0;
alter table public.room_bookings add column if not exists toro integer not null default 0;

alter table public.room_bookings drop constraint if exists room_bookings_type_check;
alter table public.room_bookings add constraint room_bookings_type_check check (booking_type in ('room','romantic','nautical'));
alter table public.room_bookings drop constraint if exists room_bookings_formula_check;
alter table public.room_bookings add constraint room_bookings_formula_check check (formula is null or formula between 1 and 3);
alter table public.room_bookings drop constraint if exists room_bookings_activity_numbers_check;
alter table public.room_bookings add constraint room_bookings_activity_numbers_check check (
  (persons is null or persons between 1 and 100) and jetski between 0 and 20 and sailboat between 0 and 20 and toro between 0 and 20
);

drop function if exists public.enregistrer_reservation_salle(bigint,timestamptz,timestamptz,text,text,boolean,numeric,text,text,text,integer,integer,integer,integer,integer);
create function public.enregistrer_reservation_salle(
  p_id bigint,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_customer_name text,
  p_phone text,
  p_paid boolean,
  p_amount numeric,
  p_note text,
  p_operator_name text,
  p_booking_type text default 'room',
  p_formula integer default null,
  p_persons integer default null,
  p_jetski integer default 0,
  p_sailboat integer default 0,
  p_toro integer default 0
) returns bigint
language plpgsql security definer set search_path=public
as $$
declare v_id bigint;
begin
  if trim(coalesce(p_customer_name,''))='' then raise exception 'Nom obligatoire'; end if;
  if trim(coalesce(p_operator_name,''))='' then raise exception 'Serveur obligatoire'; end if;
  if p_end_at<=p_start_at then raise exception 'Durée invalide'; end if;
  if coalesce(p_booking_type,'room') not in ('room','romantic','nautical') then raise exception 'Type de réservation invalide'; end if;
  if p_booking_type='romantic' and coalesce(p_formula,0) not between 1 and 3 then raise exception 'Choisis une formule de 1 à 3'; end if;
  if p_booking_type='nautical' and coalesce(p_jetski,0)+coalesce(p_sailboat,0)+coalesce(p_toro,0)=0 then raise exception 'Choisis au moins un véhicule'; end if;
  if exists(select 1 from room_bookings where id is distinct from p_id and start_at<p_end_at and end_at>p_start_at) then raise exception 'Ce créneau est déjà réservé'; end if;

  if p_id is null then
    insert into room_bookings(start_at,end_at,customer_name,phone,paid,amount,note,operator_name,booking_type,formula,persons,jetski,sailboat,toro)
    values(p_start_at,p_end_at,trim(p_customer_name),nullif(trim(p_phone),''),coalesce(p_paid,false),coalesce(p_amount,0),nullif(trim(p_note),''),trim(p_operator_name),coalesce(p_booking_type,'room'),case when p_booking_type='romantic' then p_formula end,case when p_booking_type='nautical' then p_persons end,case when p_booking_type='nautical' then coalesce(p_jetski,0) else 0 end,case when p_booking_type='nautical' then coalesce(p_sailboat,0) else 0 end,case when p_booking_type='nautical' then coalesce(p_toro,0) else 0 end)
    returning id into v_id;
  else
    update room_bookings set start_at=p_start_at,end_at=p_end_at,customer_name=trim(p_customer_name),phone=nullif(trim(p_phone),''),paid=coalesce(p_paid,false),amount=coalesce(p_amount,0),note=nullif(trim(p_note),''),operator_name=trim(p_operator_name),booking_type=coalesce(p_booking_type,'room'),formula=case when p_booking_type='romantic' then p_formula end,persons=case when p_booking_type='nautical' then p_persons end,jetski=case when p_booking_type='nautical' then coalesce(p_jetski,0) else 0 end,sailboat=case when p_booking_type='nautical' then coalesce(p_sailboat,0) else 0 end,toro=case when p_booking_type='nautical' then coalesce(p_toro,0) else 0 end,updated_at=now()
    where id=p_id returning id into v_id;
    if v_id is null then raise exception 'Réservation introuvable'; end if;
  end if;
  return v_id;
end;
$$;

grant execute on function public.enregistrer_reservation_salle(bigint,timestamptz,timestamptz,text,text,boolean,numeric,text,text,text,integer,integer,integer,integer,integer) to anon,authenticated;
notify pgrst, 'reload schema';


-- Todos abren a las 7:30
update horarios set hora_inicio = '07:30';

-- Sábado (6): ambos barberos, 7:30 a 8:00pm
insert into horarios (barbero_id, dia_semana, hora_inicio, hora_fin)
select id, 6, '07:30', '20:00' from barberos;

alter table servicios enable row level security;
alter table barberos  enable row level security;
alter table horarios  enable row level security;
alter table citas     enable row level security;
alter table bloqueos  enable row level security;

create policy "ver servicios" on servicios for select using (activo);
create policy "ver barberos"  on barberos  for select using (true);
create policy "ver horarios"  on horarios  for select using (true);
create policy "reservar" on citas for insert
  with check (estado = 'confirmada' and fecha >= current_date);

-- El cliente necesita saber qué horas están ocupadas, pero NO los datos
-- de otros clientes. Esta función devuelve solo barbero y horas.
create or replace function ocupados(p_fecha date)
returns table (barbero_id bigint, hora_inicio time, hora_fin time)
language sql security definer set search_path = public as $$
  select barbero_id, hora_inicio, hora_fin from citas
    where fecha = p_fecha and estado <> 'cancelada'
  union all
  select barbero_id, hora_inicio, hora_fin from bloqueos
    where fecha = p_fecha;
$$;
grant execute on function ocupados(date) to anon;
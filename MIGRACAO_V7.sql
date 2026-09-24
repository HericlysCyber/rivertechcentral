-- =========================================================
-- RIVER TECH CENTRAL — MIGRAÇÃO V7
-- Controle de teste/contrato por cliente + vencimento automático
-- =========================================================

alter table public.clientes
  add column if not exists tipo_periodo text not null default 'nenhum',
  add column if not exists inicio_periodo timestamptz,
  add column if not exists fim_periodo timestamptz,
  add column if not exists bloqueio_manual boolean not null default false;

alter table public.clientes
  drop constraint if exists clientes_tipo_periodo_check;

alter table public.clientes
  add constraint clientes_tipo_periodo_check
  check (tipo_periodo in ('nenhum','teste','contrato'));

create index if not exists idx_clientes_fim_periodo on public.clientes(fim_periodo);
create index if not exists idx_clientes_bloqueio_manual on public.clientes(bloqueio_manual);

-- =========================================================
-- RPC: verifica o acesso do cliente logado.
-- Se o período venceu, bloqueia cliente e perfil automaticamente.
-- A função usa o horário do servidor do PostgreSQL.
-- =========================================================

create or replace function public.verificar_acesso_cliente()
returns table (
  permitido boolean,
  cliente_id uuid,
  nome text,
  tipo_periodo text,
  inicio_periodo timestamptz,
  fim_periodo timestamptz,
  dias_restantes integer,
  motivo text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.clientes%rowtype;
  d integer;
begin
  select * into c
  from public.clientes
  where auth_user_id = auth.uid()
  limit 1;

  if c.id is null then
    return query select false, null::uuid, null::text, null::text, null::timestamptz, null::timestamptz, 0, 'cliente_nao_encontrado';
    return;
  end if;

  if c.bloqueio_manual or not c.ativo then
    return query select false, c.id, c.nome, c.tipo_periodo, c.inicio_periodo, c.fim_periodo, greatest(0, ceil(extract(epoch from (coalesce(c.fim_periodo, now()) - now())) / 86400.0))::integer, case when c.bloqueio_manual then 'bloqueio_manual' else 'cliente_inativo' end;
    return;
  end if;

  if c.fim_periodo is not null and c.fim_periodo <= now() then
    update public.clientes
      set ativo = false, updated_at = now()
      where id = c.id;

    update public.perfis
      set ativo = false
      where id = c.auth_user_id;

    return query select false, c.id, c.nome, c.tipo_periodo, c.inicio_periodo, c.fim_periodo, 0, 'periodo_expirado';
    return;
  end if;

  if c.fim_periodo is null then
    return query select false, c.id, c.nome, c.tipo_periodo, c.inicio_periodo, c.fim_periodo, 0, 'sem_periodo';
    return;
  end if;

  d := greatest(0, ceil(extract(epoch from (c.fim_periodo - now())) / 86400.0))::integer;

  return query select true, c.id, c.nome, c.tipo_periodo, c.inicio_periodo, c.fim_periodo, d, 'ok';
end;
$$;

revoke all on function public.verificar_acesso_cliente() from public;
grant execute on function public.verificar_acesso_cliente() to authenticated;

-- Permite que o cliente autenticado consulte seu próprio registro durante
-- a verificação. O RPC continua sendo a autoridade para decidir acesso.
drop policy if exists "client_select_own_client" on public.clientes;
create policy "client_select_own_client"
on public.clientes
for select
to authenticated
using (auth_user_id = auth.uid() or public.is_admin());

-- Mantém os clientes administrativos com acesso completo.
drop policy if exists "admin_manage_clientes" on public.clientes;
create policy "admin_manage_clientes"
on public.clientes
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- =========================================================
-- RPC administrativa para períodos.
-- A alteração só pode ser executada por administrador.
-- =========================================================

create or replace function public.admin_definir_periodo(
  p_cliente_id uuid,
  p_tipo text,
  p_dias integer
)
returns public.clientes
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.clientes%rowtype;
  inicio timestamptz := now();
  fim timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Sem permissão administrativa.' using errcode = '42501';
  end if;

  if p_tipo not in ('teste','contrato') then
    raise exception 'Tipo de período inválido.';
  end if;

  if p_dias <= 0 then
    raise exception 'A quantidade de dias deve ser maior que zero.';
  end if;

  fim := inicio + make_interval(days => p_dias);

  update public.clientes
  set tipo_periodo = p_tipo,
      inicio_periodo = inicio,
      fim_periodo = fim,
      ativo = true,
      bloqueio_manual = false,
      updated_at = now()
  where id = p_cliente_id
  returning * into c;

  if c.id is null then
    raise exception 'Cliente não encontrado.';
  end if;

  if c.auth_user_id is not null then
    update public.perfis set ativo = true where id = c.auth_user_id;
  end if;

  return c;
end;
$$;

create or replace function public.admin_renovar_contrato(
  p_cliente_id uuid,
  p_dias integer default 30
)
returns public.clientes
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.clientes%rowtype;
  base timestamptz;
  fim timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Sem permissão administrativa.' using errcode = '42501';
  end if;

  if p_dias <= 0 then
    raise exception 'A quantidade de dias deve ser maior que zero.';
  end if;

  select * into c from public.clientes where id = p_cliente_id for update;
  if c.id is null then raise exception 'Cliente não encontrado.'; end if;

  base := greatest(coalesce(c.fim_periodo, now()), now());
  fim := base + make_interval(days => p_dias);

  update public.clientes
  set tipo_periodo = 'contrato',
      inicio_periodo = case when c.fim_periodo is not null and c.fim_periodo > now() then c.inicio_periodo else now() end,
      fim_periodo = fim,
      ativo = true,
      bloqueio_manual = false,
      updated_at = now()
  where id = p_cliente_id
  returning * into c;

  if c.auth_user_id is not null then
    update public.perfis set ativo = true where id = c.auth_user_id;
  end if;

  return c;
end;
$$;

create or replace function public.admin_bloquear_cliente(p_cliente_id uuid)
returns public.clientes
language plpgsql
security definer
set search_path = public
as $$
declare c public.clientes%rowtype;
begin
  if not public.is_admin() then raise exception 'Sem permissão administrativa.' using errcode='42501'; end if;
  update public.clientes set ativo=false,bloqueio_manual=true,updated_at=now() where id=p_cliente_id returning * into c;
  if c.id is null then raise exception 'Cliente não encontrado.'; end if;
  if c.auth_user_id is not null then update public.perfis set ativo=false where id=c.auth_user_id; end if;
  return c;
end;
$$;

create or replace function public.admin_liberar_cliente(p_cliente_id uuid)
returns public.clientes
language plpgsql
security definer
set search_path = public
as $$
declare c public.clientes%rowtype;
begin
  if not public.is_admin() then raise exception 'Sem permissão administrativa.' using errcode='42501'; end if;
  select * into c from public.clientes where id=p_cliente_id;
  if c.id is null then raise exception 'Cliente não encontrado.'; end if;
  if c.fim_periodo is null or c.fim_periodo <= now() then
    raise exception 'O período deste cliente está vencido. Ative ou renove um período para liberar o acesso.';
  end if;
  update public.clientes set ativo=true,bloqueio_manual=false,updated_at=now() where id=p_cliente_id returning * into c;
  if c.auth_user_id is not null then update public.perfis set ativo=true where id=c.auth_user_id; end if;
  return c;
end;
$$;

revoke all on function public.admin_definir_periodo(uuid,text,integer) from public;
revoke all on function public.admin_renovar_contrato(uuid,integer) from public;
revoke all on function public.admin_bloquear_cliente(uuid) from public;
revoke all on function public.admin_liberar_cliente(uuid) from public;

grant execute on function public.admin_definir_periodo(uuid,text,integer) to authenticated;
grant execute on function public.admin_renovar_contrato(uuid,integer) to authenticated;
grant execute on function public.admin_bloquear_cliente(uuid) to authenticated;
grant execute on function public.admin_liberar_cliente(uuid) to authenticated;

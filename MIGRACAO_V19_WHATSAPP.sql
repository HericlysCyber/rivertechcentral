-- =========================================================
-- RIVER TECH CENTRAL V19 — WHATSAPP POR CLIENTE
-- =========================================================
-- Estrutura para vincular 1 ou 2 números de WhatsApp a cada cliente.
-- Esta etapa NÃO conecta ainda à Meta/WhatsApp Cloud API.
-- Tokens e credenciais de provedor devem ficar em backend/Edge Function/Secrets,
-- nunca no HTML/JavaScript do cliente.

create table if not exists public.whatsapp_conexoes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  apelido text not null default 'WhatsApp principal',
  telefone_e164 text not null,
  provedor text not null default 'meta_cloud',
  phone_number_id text,
  waba_id text,
  nome_exibicao text,
  status text not null default 'preparando' check (status in ('preparando','pendente','conectado','pausado','erro')),
  ativo boolean not null default true,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_conexoes_cliente on public.whatsapp_conexoes(cliente_id);
create unique index if not exists uq_whatsapp_conexoes_cliente_telefone
  on public.whatsapp_conexoes(cliente_id, telefone_e164);

alter table public.whatsapp_conexoes enable row level security;

drop policy if exists whatsapp_admin_all on public.whatsapp_conexoes;
drop policy if exists whatsapp_cliente_select on public.whatsapp_conexoes;
drop policy if exists whatsapp_cliente_insert on public.whatsapp_conexoes;
drop policy if exists whatsapp_cliente_update on public.whatsapp_conexoes;
drop policy if exists whatsapp_cliente_delete on public.whatsapp_conexoes;

create policy whatsapp_admin_all
on public.whatsapp_conexoes for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy whatsapp_cliente_select
on public.whatsapp_conexoes for select to authenticated
using (cliente_id = public.meu_cliente_id() and public.cliente_acesso_valido());

create policy whatsapp_cliente_insert
on public.whatsapp_conexoes for insert to authenticated
with check (cliente_id = public.meu_cliente_id() and public.cliente_acesso_valido());

create policy whatsapp_cliente_update
on public.whatsapp_conexoes for update to authenticated
using (cliente_id = public.meu_cliente_id() and public.cliente_acesso_valido())
with check (cliente_id = public.meu_cliente_id() and public.cliente_acesso_valido());

create policy whatsapp_cliente_delete
on public.whatsapp_conexoes for delete to authenticated
using (cliente_id = public.meu_cliente_id() and public.cliente_acesso_valido());

grant select, insert, update, delete on public.whatsapp_conexoes to authenticated;

drop trigger if exists trg_whatsapp_conexoes_updated_at on public.whatsapp_conexoes;
create trigger trg_whatsapp_conexoes_updated_at
before update on public.whatsapp_conexoes
for each row execute function public.river_touch_updated_at();

-- Limite operacional de 2 números por cliente.
create or replace function public.validar_limite_whatsapp_cliente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  total integer;
begin
  select count(*) into total
  from public.whatsapp_conexoes
  where cliente_id = new.cliente_id
    and (tg_op = 'UPDATE' or id <> new.id);

  if total >= 2 then
    raise exception 'Cada cliente pode ter no máximo 2 números de WhatsApp.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_whatsapp_limite on public.whatsapp_conexoes;
create trigger trg_whatsapp_limite
before insert on public.whatsapp_conexoes
for each row execute function public.validar_limite_whatsapp_cliente();

comment on table public.whatsapp_conexoes is 'Números de WhatsApp vinculados por cliente; preparado para futura conexão com Meta WhatsApp Cloud API.';

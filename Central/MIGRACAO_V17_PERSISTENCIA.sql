-- River Tech Central V17 — persistência por cliente
create extension if not exists pgcrypto;

create table if not exists public.jornal_encartes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  titulo text not null default 'OFERTAS DA SEMANA',
  periodo text default '',
  destaque text default '#1769e0',
  colunas integer not null default 3 check (colunas between 2 and 4),
  cabecalho text default '',
  produtos jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jornal_encartes_cliente_idx on public.jornal_encartes(cliente_id, updated_at desc);
alter table public.jornal_encartes enable row level security;
drop policy if exists jornal_cliente_select on public.jornal_encartes;
drop policy if exists jornal_cliente_insert on public.jornal_encartes;
drop policy if exists jornal_cliente_update on public.jornal_encartes;
drop policy if exists jornal_cliente_delete on public.jornal_encartes;
create policy jornal_cliente_select on public.jornal_encartes for select using (cliente_id = public.meu_cliente_id());
create policy jornal_cliente_insert on public.jornal_encartes for insert with check (cliente_id = public.meu_cliente_id());
create policy jornal_cliente_update on public.jornal_encartes for update using (cliente_id = public.meu_cliente_id()) with check (cliente_id = public.meu_cliente_id());
create policy jornal_cliente_delete on public.jornal_encartes for delete using (cliente_id = public.meu_cliente_id());

create table if not exists public.chatbot_config (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null unique references public.clientes(id) on delete cascade,
  config jsonb not null default '{}'::jsonb,
  ativo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chatbot_config_cliente_idx on public.chatbot_config(cliente_id);
alter table public.chatbot_config enable row level security;
drop policy if exists chatbot_cliente_select on public.chatbot_config;
drop policy if exists chatbot_cliente_insert on public.chatbot_config;
drop policy if exists chatbot_cliente_update on public.chatbot_config;
drop policy if exists chatbot_cliente_delete on public.chatbot_config;
create policy chatbot_cliente_select on public.chatbot_config for select using (cliente_id = public.meu_cliente_id());
create policy chatbot_cliente_insert on public.chatbot_config for insert with check (cliente_id = public.meu_cliente_id());
create policy chatbot_cliente_update on public.chatbot_config for update using (cliente_id = public.meu_cliente_id()) with check (cliente_id = public.meu_cliente_id());
create policy chatbot_cliente_delete on public.chatbot_config for delete using (cliente_id = public.meu_cliente_id());

-- Admins podem auditar/gerenciar essas tabelas pelo mesmo padrão de segurança da Central.
create policy jornal_admin_all on public.jornal_encartes for all using (public.is_admin()) with check (public.is_admin());
create policy chatbot_admin_all on public.chatbot_config for all using (public.is_admin()) with check (public.is_admin());

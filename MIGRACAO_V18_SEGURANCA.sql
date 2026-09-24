-- =========================================================
-- RIVER TECH CENTRAL V18 — REVISÃO DE SEGURANÇA E RLS
-- =========================================================
-- Objetivos:
-- 1) padronizar RLS das tabelas centrais;
-- 2) impedir acesso de cliente expirado/bloqueado aos dados;
-- 3) manter administradores com gerenciamento completo;
-- 4) manter isolamento entre clientes;
-- 5) manter Cartazeamento, Jornal e Chat Bot protegidos por cliente;
-- 6) atualizar updated_at automaticamente nas tabelas de dados.
--
-- Esta migração NÃO altera Rádio Indoor nem conteúdo/layout visual dos módulos.
-- =========================================================

create or replace function public.cliente_acesso_valido()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clientes c
    left join public.perfis p on p.id = c.auth_user_id
    where c.auth_user_id = auth.uid()
      and c.ativo = true
      and c.bloqueio_manual = false
      and c.fim_periodo is not null
      and c.fim_periodo > now()
      and (p.id is null or p.ativo = true)
  );
$$;

revoke all on function public.cliente_acesso_valido() from public;
grant execute on function public.cliente_acesso_valido() to authenticated;

-- Garante RLS e remove políticas antigas das tabelas centrais para evitar
-- combinações permissivas inesperadas entre políticas antigas e novas.
do $$
declare
  t text;
  p record;
begin
  foreach t in array array['clientes','modulos','cliente_modulos','perfis','cartazeamento_layouts','jornal_encartes','chatbot_config'] loop
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;
  end loop;
end $$;

alter table public.clientes enable row level security;
alter table public.modulos enable row level security;
alter table public.cliente_modulos enable row level security;
alter table public.perfis enable row level security;
alter table public.cartazeamento_layouts enable row level security;
alter table public.jornal_encartes enable row level security;
alter table public.chatbot_config enable row level security;

-- CLIENTES
create policy clientes_admin_all
on public.clientes for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy clientes_own_select
on public.clientes for select to authenticated
using (auth_user_id = auth.uid() and public.cliente_acesso_valido());

-- MÓDULOS: cliente só enxerga módulos ativos enquanto possui acesso válido.
create policy modulos_admin_all
on public.modulos for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy modulos_client_select
on public.modulos for select to authenticated
using (ativo = true and public.cliente_acesso_valido());

-- PERMISSÕES DE MÓDULOS: cliente só consulta as próprias permissões.
create policy cliente_modulos_admin_all
on public.cliente_modulos for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy cliente_modulos_client_select
on public.cliente_modulos for select to authenticated
using (cliente_id = public.meu_cliente_id() and ativo = true and public.cliente_acesso_valido());

-- PERFIS
create policy perfis_admin_all
on public.perfis for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy perfis_own_select
on public.perfis for select to authenticated
using (id = auth.uid());

-- CARTAZEAMENTO
create policy cartazeamento_admin_all
on public.cartazeamento_layouts for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy cartazeamento_client_all
on public.cartazeamento_layouts for all to authenticated
using (cliente_id = public.meu_cliente_id() and public.cliente_acesso_valido())
with check (cliente_id = public.meu_cliente_id() and public.cliente_acesso_valido());

-- JORNAL
create policy jornal_admin_all
on public.jornal_encartes for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy jornal_client_all
on public.jornal_encartes for all to authenticated
using (cliente_id = public.meu_cliente_id() and public.cliente_acesso_valido())
with check (cliente_id = public.meu_cliente_id() and public.cliente_acesso_valido());

-- CHAT BOT
create policy chatbot_admin_all
on public.chatbot_config for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy chatbot_client_all
on public.chatbot_config for all to authenticated
using (cliente_id = public.meu_cliente_id() and public.cliente_acesso_valido())
with check (cliente_id = public.meu_cliente_id() and public.cliente_acesso_valido());

-- Permissões explícitas para a API autenticada. RLS continua sendo a barreira.
grant select, insert, update, delete on public.clientes to authenticated;
grant select, insert, update, delete on public.modulos to authenticated;
grant select, insert, update, delete on public.cliente_modulos to authenticated;
grant select, insert, update, delete on public.perfis to authenticated;
grant select, insert, update, delete on public.cartazeamento_layouts to authenticated;
grant select, insert, update, delete on public.jornal_encartes to authenticated;
grant select, insert, update, delete on public.chatbot_config to authenticated;

-- updated_at automático para dados persistidos.
create or replace function public.river_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_jornal_encartes_updated_at on public.jornal_encartes;
create trigger trg_jornal_encartes_updated_at
before update on public.jornal_encartes
for each row execute function public.river_touch_updated_at();

drop trigger if exists trg_chatbot_config_updated_at on public.chatbot_config;
create trigger trg_chatbot_config_updated_at
before update on public.chatbot_config
for each row execute function public.river_touch_updated_at();

drop trigger if exists trg_cartazeamento_layouts_updated_at on public.cartazeamento_layouts;
create trigger trg_cartazeamento_layouts_updated_at
before update on public.cartazeamento_layouts
for each row execute function public.river_touch_updated_at();

-- Índices de apoio à checagem de acesso e isolamento.
create index if not exists idx_clientes_auth_user_id on public.clientes(auth_user_id);
create index if not exists idx_cliente_modulos_cliente_id on public.cliente_modulos(cliente_id);
create index if not exists idx_perfis_id_tipo_ativo on public.perfis(id, tipo, ativo);

-- =========================================================
-- TESTE MANUAL RECOMENDADO APÓS EXECUTAR A MIGRAÇÃO
-- =========================================================
-- 1. Admin: criar cliente.
-- 2. Admin: iniciar teste de 3 dias.
-- 3. Admin: liberar cada módulo individualmente.
-- 4. Cliente: acessar somente módulos liberados.
-- 5. Bloquear cliente no admin: cliente deve perder acesso.
-- 6. Liberar novamente com período válido: acesso deve retornar.
-- 7. Renovar contrato: verificar nova data de vencimento.
-- 8. Simular/aguardar vencimento: verificar bloqueio automático.
-- 9. Cliente A não deve conseguir consultar dados do Cliente B.
-- 10. Cliente expirado/bloqueado não deve conseguir consultar/alterar
--     layouts, encartes ou configuração do Chat Bot via API direta.
-- =========================================================

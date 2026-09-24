-- =========================================================
-- RIVER TECH CENTRAL — MIGRAÇÃO V6
-- 1) adiciona River Music e Chat Bot
-- 2) garante que administradores possam gerenciar módulos/permissões
-- 3) sincroniza o bloqueio do cliente com o perfil de autenticação
-- =========================================================

insert into public.modulos (nome, slug, descricao, icone, url, ativo, ordem)
values
  ('River Music', 'river-music', 'Sistema de música da River Tech.', '🎵', '', true, 5),
  ('Chat Bot', 'chat-bot', 'Assistente virtual da River Tech.', '🤖', '', true, 6)
on conflict (slug) do update set
  nome = excluded.nome,
  descricao = excluded.descricao,
  icone = excluded.icone,
  ativo = excluded.ativo,
  ordem = excluded.ordem;

-- Políticas administrativas para o gerenciamento central.
-- Se as políticas antigas já existirem com outros nomes, estas continuam
-- funcionando em conjunto sem retirar as regras de acesso dos clientes.

drop policy if exists "admin_manage_cliente_modulos" on public.cliente_modulos;
create policy "admin_manage_cliente_modulos"
on public.cliente_modulos
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admin_manage_clientes" on public.clientes;
create policy "admin_manage_clientes"
on public.clientes
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admin_manage_modulos" on public.modulos;
create policy "admin_manage_modulos"
on public.modulos
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admin_manage_perfis" on public.perfis;
create policy "admin_manage_perfis"
on public.perfis
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- =========================================================
-- IMPORTANTE
-- Os novos módulos entram sem URL por enquanto.
-- Quando River Music e Chat Bot tiverem seus endereços definitivos,
-- atualize somente a coluna url, por exemplo:
--
-- update public.modulos set url='https://SEU-ENDERECO' where slug='river-music';
-- update public.modulos set url='https://SEU-ENDERECO' where slug='chat-bot';
-- =========================================================

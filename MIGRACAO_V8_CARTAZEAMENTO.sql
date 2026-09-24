-- =========================================================
-- RIVER TECH CENTRAL — V8
-- Integração do Cartazeamento + layouts personalizados por cliente
-- =========================================================

-- 1) Identifica módulos internos da própria Central.
alter table public.modulos
  add column if not exists modo_acesso text not null default 'externo';

alter table public.modulos
  drop constraint if exists modulos_modo_acesso_check;
alter table public.modulos
  add constraint modulos_modo_acesso_check
  check (modo_acesso in ('externo','interno'));

-- 2) Cartazeamento passa a ser o primeiro módulo interno.
insert into public.modulos (nome, slug, descricao, icone, url, modo_acesso, ativo, ordem)
values
  ('Cartazeamento', 'cartazeamento', 'Crie, personalize e gere placas promocionais.', '🏷️', 'cartazeamento.html', 'interno', true, 2),
  ('Jornal de Ofertas', 'jornal', 'Crie jornais e encartes promocionais.', '📰', '', 'interno', true, 3),
  ('Dashboard', 'dashboard', 'Indicadores e informações da sua operação.', '📊', '', 'interno', true, 4),
  ('River Music', 'river-music', 'Sistema de música da River Tech.', '🎵', '', 'externo', true, 5),
  ('Chat Bot', 'chat-bot', 'Assistente virtual da River Tech.', '🤖', '', 'externo', true, 6)
on conflict (slug) do update set
  nome = excluded.nome,
  descricao = excluded.descricao,
  icone = excluded.icone,
  url = excluded.url,
  modo_acesso = excluded.modo_acesso,
  ativo = excluded.ativo,
  ordem = excluded.ordem;

-- Mantém a Rádio exatamente como módulo externo.
update public.modulos
set modo_acesso = 'externo',
    url = 'https://hericlyscyber.github.io/River-Indor/'
where slug = 'radio';

-- 3) Layouts personalizados de cada cliente.
create table if not exists public.cartazeamento_layouts (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  nome text not null,
  descricao text not null default '',
  tamanho text not null default 'G',
  layout_base text not null default 'classico',
  edicao jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cart_layouts_cliente on public.cartazeamento_layouts(cliente_id);
create index if not exists idx_cart_layouts_nome on public.cartazeamento_layouts(cliente_id, nome);

alter table public.cartazeamento_layouts enable row level security;

drop policy if exists "admin_manage_cartazeamento_layouts" on public.cartazeamento_layouts;
create policy "admin_manage_cartazeamento_layouts"
on public.cartazeamento_layouts
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "client_manage_own_cartazeamento_layouts" on public.cartazeamento_layouts;
create policy "client_manage_own_cartazeamento_layouts"
on public.cartazeamento_layouts
for all
to authenticated
using (cliente_id = public.meu_cliente_id())
with check (cliente_id = public.meu_cliente_id());

-- 4) Atualização automática simples do timestamp quando houver alteração.
create or replace function public.cartazeamento_layout_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_cartazeamento_layout_updated_at on public.cartazeamento_layouts;
create trigger trg_cartazeamento_layout_updated_at
before update on public.cartazeamento_layouts
for each row execute function public.cartazeamento_layout_updated_at();

-- 5) Permissões explícitas.
grant select, insert, update, delete on public.cartazeamento_layouts to authenticated;

-- =========================================================
-- IMPORTANTE
-- =========================================================
-- O Cartazeamento continua usando Flask/ReportLab para gerar o PDF.
-- A Central apenas autentica o cliente, verifica a permissão do módulo
-- e incorpora o Cartazeamento dentro de cartazeamento.html.
-- O endereço do servidor Flask será configurado em config.js:
-- cartazeamentoBackendUrl: "https://SEU-SERVIDOR-DO-CARTAZEAMENTO"
-- =========================================================

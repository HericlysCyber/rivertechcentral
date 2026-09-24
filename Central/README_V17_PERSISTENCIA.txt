RIVER TECH CENTRAL V17 — PERSISTÊNCIA

Esta versão tira o Jornal de Ofertas e o Chat Bot do armazenamento somente local.

1. Execute MIGRACAO_V17_PERSISTENCIA.sql no SQL Editor do Supabase.
2. Entre com uma conta cliente.
3. No Jornal, monte o encarte e use "Salvar encarte". Ao sair e entrar novamente, o último encarte salvo será carregado.
4. No Chat Bot, use "Salvar configuração". A configuração e o estado ativo ficam vinculados ao cliente.
5. RLS limita os registros ao cliente autenticado e permite administração via is_admin().

As imagens do Jornal são armazenadas como dados no registro. Para evitar registros excessivamente grandes, mantenha imagens razoáveis. O próximo refinamento pode migrar essas imagens para Supabase Storage.

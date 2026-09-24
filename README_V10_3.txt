River Tech Central V10.3 — Cartazeamento

Base: V10.2.
Correção principal desta versão:
- carregamento explícito do .env a partir da pasta Cartazeamento;
- evita o erro "Invalid URL '/auth/v1/user': No scheme supplied";
- aceita SUPABASE_URL / SUPABASE_PROJECT_URL;
- aceita SUPABASE_KEY / SUPABASE_PUBLISHABLE_KEY / SUPABASE_ANON_KEY;
- mostra no terminal se a configuração do Supabase foi carregada.

O fluxo de handshake Central ↔ Cartazeamento da V10.2 foi preservado.

IMPORTANTE:
- O arquivo .env desta versão contém apenas a chave publishable do Supabase, não uma service role key.
- Não coloque service role key no frontend ou neste servidor local.

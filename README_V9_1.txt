RIVER TECH — CARTAZEAMENTO V9.1

Correções:
- handshake de autenticação Central <-> Cartazeamento mais robusto;
- reenvio automático do token durante o carregamento do iframe;
- correção de nome/case do logo para hospedagem Linux;
- mantém Flask/ReportLab, geração de prévia, PDF, impressão e layouts.

Para teste local:
1. .env com SUPABASE_URL e SUPABASE_KEY.
2. python app.py
3. Central/config.js: cartazeamentoBackendUrl: "http://127.0.0.1:5000"
4. Abrir Cartazeamento somente pela Central.

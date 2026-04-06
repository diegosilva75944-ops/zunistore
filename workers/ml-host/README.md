# Worker ML no host (fora do Docker)

O site Next.js pode correr em Docker sem acesso a X11/cookies gráficos. Este processo HTTP corre **no mesmo host** (ou noutra máquina na rede privada) com o mesmo repositório e `.env`, e executa `runTestMlImportCore` com Playwright real.

## Arranque no host

Na raiz do projeto (onde está `package.json` e o `.env` com credenciais ML/Supabase usadas pelo pipeline):

```bash
npm install
export ML_HOST_IMPORT_SECRET="gere_um_segredo_longo"
# Opcional: escutar só localhost (defeito)
export ML_HOST_IMPORT_LISTEN_HOST=127.0.0.1
export ML_HOST_IMPORT_PORT=3847
npm run ml-host:worker
```

O script usa `tsx` com `workers/ml-host/tsconfig.json` para resolver `server-only` como no Vitest (o pacote npm `server-only` não é compatível com Node puro).

## App no Docker (ou noutro processo)

No `.env` do contentor / Next:

```bash
ML_HOST_IMPORT_URL=http://host.docker.internal:3847
ML_HOST_IMPORT_SECRET=o_mesmo_segredo
# Opcional: timeout em ms (30s–600s)
# ML_HOST_IMPORT_TIMEOUT_MS=120000
```

No Linux, o Docker pode precisar de `extra_hosts: - "host.docker.internal:host-gateway"` no Compose. Se `host.docker.internal` não resolver, use o IP LAN do host.

## Segurança

- O worker deve ouvir em `127.0.0.1` se só o Docker local falar com ele, ou atrás de firewall se usar `0.0.0.0`.
- O segredo em `Authorization: Bearer` tem de ser forte e igual nos dois lados.
- Não exponha o worker à Internet pública.

## Endpoints

- `GET /health` — estado.
- `POST /internal/ml-import` — corpo JSON `{ "url", "mode", "opts" }`, cabeçalho `Authorization: Bearer <ML_HOST_IMPORT_SECRET>`.

O admin do site continua a usar `/api/admin/test-ml-import`; quando `ML_HOST_IMPORT_URL` está definido, o servidor delega ao worker automaticamente.

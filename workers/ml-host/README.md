# Worker ML no host (fora do Docker)

O site Next.js pode correr em Docker sem acesso a X11/cookies gráficos. Este processo HTTP corre **no mesmo host** (ou noutra máquina na rede privada) com o mesmo repositório e `.env`, e executa `runTestMlImportCore` com Playwright real.

## Arranque no host

Na raiz do projeto (onde está `package.json` e o `.env` com credenciais ML/Supabase usadas pelo pipeline):

```bash
npm install
# Porta (defeito 3847)
export ML_HOST_IMPORT_PORT=3847
# Obrigatório em rede: ML_HOST_IMPORT_SECRET=…  (o bind é sempre 0.0.0.0 — todas as interfaces IPv4)
npm run ml-host:worker
```

O script usa `tsx` com `workers/ml-host/tsconfig.json` para resolver `server-only` como no Vitest (o pacote npm `server-only` não é compatível com Node puro).

## App no Docker (ou noutro processo)

No `.env` do contentor / Next:

```bash
ML_HOST_IMPORT_URL=http://host.docker.internal:3847
# Opcional: o mesmo ML_HOST_IMPORT_SECRET que no worker, se usar autenticação
# ML_HOST_IMPORT_SECRET=…
# ML_HOST_IMPORT_TIMEOUT_MS=120000
```

No Linux, o Docker pode precisar de `extra_hosts: - "host.docker.internal:host-gateway"` no Compose. Se `host.docker.internal` não resolver, use o IP LAN do host.

## Segurança

- O worker escuta sempre em **`0.0.0.0`** (porta por defeito **3847**), para contentores e LAN alcançarem o serviço.
- **Sem `ML_HOST_IMPORT_SECRET`**, qualquer cliente na rede pode chamar o import — defina `ML_HOST_IMPORT_SECRET` no worker e no Next (mesmo valor, `Authorization: Bearer`).

## Endpoints

- `GET /health` — estado.
- `POST /internal/ml-import` — corpo JSON `{ "url", "mode", "opts" }` para import; ou `{ "mlLoginOpen": true }` para abrir o login ML no host e devolver `storageState` (o Next no Docker usa isto). Se `ML_HOST_IMPORT_SECRET` estiver definido no worker, envia `Authorization: Bearer <segredo>`.
- `POST /internal/ml-login-open` — legado/alternativa ao login; mesmo efeito que `mlLoginOpen` em `/internal/ml-import`.

No **Next** (Docker), com `ML_HOST_IMPORT_URL` definido, **tudo** o que chama `runTestMlImport` delega ao worker: Teste ML (`/api/admin/test-ml-import`), importação ML admin e extensão (`/api/admin/import/mercadolivre*`), sync de preço e reimport (`mlSyncImportedProduct`, `fetchMlPricesLikeImport`), cron de reimportação ML.

O botão **Admin → Tokens → Abrir navegador para login ML** usa o **mesmo** `ML_HOST_IMPORT_URL`: se o Next não tiver X11, o pedido vai para `POST /internal/ml-import` com `mlLoginOpen: true` (reinicie o worker após `git pull` para ter esta lógica).

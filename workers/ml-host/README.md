# Worker ML no host (fora do Docker)

O site Next.js pode correr em Docker sem acesso a X11/cookies gráficos. Este processo HTTP corre **no mesmo host** (ou noutra máquina na rede privada) com o mesmo repositório e `.env`, e executa `runTestMlImportCore` com Playwright real.

## Arranque no host

Na raiz do projeto (onde está `package.json` e o `.env` com credenciais ML/Supabase usadas pelo pipeline):

```bash
npm install
# Opcional: escutar só localhost (defeito)
export ML_HOST_IMPORT_LISTEN_HOST=127.0.0.1
export ML_HOST_IMPORT_PORT=3847
# Opcional: ML_HOST_IMPORT_SECRET=…  (se omitir, não há verificação Bearer)
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

- O worker deve ouvir em **`127.0.0.1`** (defeito) quando não usas segredo — assim só processos na mesma máquina (ou Docker com `host.docker.internal`) alcançam o serviço.
- Se definires **`ML_HOST_IMPORT_SECRET`**, o cliente e o worker devem usar o mesmo valor (`Authorization: Bearer`).
- Evita **`0.0.0.0`** sem segredo: qualquer um na rede pode disparar importações.

## Endpoints

- `GET /health` — estado.
- `POST /internal/ml-import` — corpo JSON `{ "url", "mode", "opts" }` para import; ou `{ "mlLoginOpen": true }` para abrir o login ML no host e devolver `storageState` (o Next no Docker usa isto). Se `ML_HOST_IMPORT_SECRET` estiver definido no worker, envia `Authorization: Bearer <segredo>`.
- `POST /internal/ml-login-open` — legado/alternativa ao login; mesmo efeito que `mlLoginOpen` em `/internal/ml-import`.

No **Next** (Docker), com `ML_HOST_IMPORT_URL` definido, **tudo** o que chama `runTestMlImport` delega ao worker: Teste ML (`/api/admin/test-ml-import`), importação ML admin e extensão (`/api/admin/import/mercadolivre*`), sync de preço e reimport (`mlSyncImportedProduct`, `fetchMlPricesLikeImport`), cron de reimportação ML.

O botão **Admin → Tokens → Abrir navegador para login ML** usa o **mesmo** `ML_HOST_IMPORT_URL`: se o Next não tiver X11, o pedido vai para `POST /internal/ml-import` com `mlLoginOpen: true` (reinicie o worker após `git pull` para ter esta lógica).

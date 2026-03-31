# Zuni ML Worker (Flutter)

App Android/iOS para:

- **Fila de sincronização**: lista produtos Mercado Livre do catálogo interno, abre a PDP no **WebView** (rede do celular) e envia o preço lido do JSON-LD para o site.
- **Importar**: chama a mesma API do servidor que o admin (`importMercadoLivreFromPdp`). Se o servidor estiver bloqueado pelo ML, a importação pode falhar — use a fila + WebView para preço.

## Pré-requisitos

1. [Flutter SDK](https://docs.flutter.dev/get-started/install) (stable).
2. No servidor ZuniStore, defina no `.env`:

   `MOBILE_APP_API_KEY=` (string longa aleatória, mínimo 16 caracteres no código do servidor)

3. Deploy da API mobile (já incluída no repositório):

   - `GET /api/mobile/v1/health`
   - `GET /api/mobile/v1/sync/next?limit=10` — header `Authorization: Bearer <chave>`
   - `POST /api/mobile/v1/sync/report` — body `{ "items": [...] }`
   - `POST /api/mobile/v1/import` — body `{ "sourceUrl", "affiliateUrl", "affiliateCode" }`

## Gerar projeto Android/iOS

Na primeira vez, na pasta `mobile/zuni_ml_worker`:

```bash
flutter pub get
flutter create .
```

Isso cria as pastas `android/` e `ios/` se ainda não existirem.

## Executar

```bash
cd mobile/zuni_ml_worker
flutter run
```

## Configuração no app

1. Aba **Config**: URL base (ex.: `https://www.zunistore.com.br`) e a mesma chave de `MOBILE_APP_API_KEY`.
2. **Testar conexão** chama `/api/mobile/v1/health`.

## Próximos passos (não implementados ainda)

- Agendamento em background (`workmanager`) com serviço em primeiro plano no Android.
- Extração de preço além do JSON-LD (fallback DOM igual ao site).
- Envio de HTML completo para o servidor (`import-with-html`) quando a API falhar.

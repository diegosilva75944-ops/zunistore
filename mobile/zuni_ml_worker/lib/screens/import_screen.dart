import "package:flutter/material.dart";

import "../config/settings_store.dart";
import "../services/api_service.dart";

class ImportScreen extends StatefulWidget {
  const ImportScreen({super.key});

  @override
  State<ImportScreen> createState() => _ImportScreenState();
}

class _ImportScreenState extends State<ImportScreen> {
  final _source = TextEditingController();
  final _affiliate = TextEditingController();
  final _code = TextEditingController(text: "ml_mobile");
  String? _result;
  bool _busy = false;

  Future<void> _run() async {
    setState(() {
      _busy = true;
      _result = null;
    });
    try {
      final base = await SettingsStore.instance.getBaseUrl();
      final key = await SettingsStore.instance.getApiKey();
      if (base == null || key == null) {
        setState(() => _result = "Configure URL e chave em Configurações.");
        return;
      }
      final api = ZuniMobileApi(baseUrl: base, apiKey: key);
      final out = await api.importProduct(
        sourceUrl: _source.text.trim(),
        affiliateUrl: _affiliate.text.trim(),
        affiliateCode: _code.text.trim().isEmpty ? "ml_mobile" : _code.text.trim(),
      );
      setState(() => _result = "OK: ${out["productUrl"]} · ação: ${out["action"]}");
    } catch (e) {
      setState(() => _result = "Erro: $e");
    } finally {
      setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _source.dispose();
    _affiliate.dispose();
    _code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          "O servidor executa o mesmo pipeline do admin. Se o ML bloquear o servidor, a importação pode falhar — nesse caso use a fila + WebView para capturar preço.",
          style: TextStyle(fontSize: 13),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _source,
          decoration: const InputDecoration(
            labelText: "URL do produto (Mercado Livre)",
            border: OutlineInputBorder(),
          ),
          keyboardType: TextInputType.url,
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _affiliate,
          decoration: const InputDecoration(
            labelText: "URL de afiliado (link final)",
            border: OutlineInputBorder(),
          ),
          keyboardType: TextInputType.url,
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _code,
          decoration: const InputDecoration(
            labelText: "Código afiliado (opcional)",
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _busy ? null : _run,
          child: _busy ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2)) : const Text("Importar"),
        ),
        if (_result != null) ...[
          const SizedBox(height: 16),
          SelectableText(_result!),
        ],
      ],
    );
  }
}

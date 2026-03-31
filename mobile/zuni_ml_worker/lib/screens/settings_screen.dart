import "package:flutter/material.dart";

import "../config/settings_store.dart";
import "../services/api_service.dart";

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _urlCtrl = TextEditingController();
  final _keyCtrl = TextEditingController();
  bool _loading = true;
  String? _msg;

  @override
  void initState() {
    super.initState();
    _read();
  }

  Future<void> _read() async {
    final u = await SettingsStore.instance.getBaseUrl();
    final k = await SettingsStore.instance.getApiKey();
    setState(() {
      _urlCtrl.text = u ?? "";
      _keyCtrl.text = k ?? "";
      _loading = false;
    });
  }

  Future<void> _save() async {
    final url = _urlCtrl.text.trim();
    final key = _keyCtrl.text.trim();
    if (url.isEmpty || !url.startsWith("http")) {
      setState(() => _msg = "Informe a URL base (https://...).");
      return;
    }
    if (key.length < 16) {
      setState(() => _msg = "A chave deve ter pelo menos 16 caracteres (igual ao MOBILE_APP_API_KEY no servidor).");
      return;
    }
    await SettingsStore.instance.setBaseUrl(url);
    await SettingsStore.instance.setApiKey(key);
    setState(() => _msg = "Salvo.");
  }

  Future<void> _test() async {
    setState(() => _msg = "Testando…");
    try {
      final url = _urlCtrl.text.trim();
      final key = _keyCtrl.text.trim();
      if (url.isEmpty || key.length < 16) {
        setState(() => _msg = "Preencha URL e chave antes.");
        return;
      }
      final api = ZuniMobileApi(baseUrl: url.replaceAll(RegExp(r"/+$"), ""), apiKey: key);
      await api.healthCheck();
      setState(() => _msg = "Conexão OK (health).");
    } catch (e) {
      setState(() => _msg = "Falhou: $e");
    }
  }

  @override
  void dispose() {
    _urlCtrl.dispose();
    _keyCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text(
          "Use a mesma chave definida em MOBILE_APP_API_KEY no servidor e em .env.local.",
          style: TextStyle(fontSize: 13),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _urlCtrl,
          decoration: const InputDecoration(
            labelText: "URL base do site",
            hintText: "https://www.zunistore.com.br",
            border: OutlineInputBorder(),
          ),
          keyboardType: TextInputType.url,
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _keyCtrl,
          decoration: const InputDecoration(
            labelText: "Chave API (Bearer)",
            border: OutlineInputBorder(),
          ),
          obscureText: true,
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            FilledButton(onPressed: _save, child: const Text("Salvar")),
            const SizedBox(width: 12),
            OutlinedButton(onPressed: _test, child: const Text("Testar conexão")),
          ],
        ),
        if (_msg != null) ...[
          const SizedBox(height: 16),
          Text(_msg!, style: const TextStyle(fontSize: 13)),
        ],
      ],
    );
  }
}

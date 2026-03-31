import "dart:convert";

import "package:flutter/material.dart";
import "package:webview_flutter/webview_flutter.dart";

import "../models/sync_models.dart";
import "../services/api_service.dart";
import "../services/ml_price_js.dart";

/// Abre a PDP no WebView, extrai preço via JSON-LD e envia ao servidor.
class WebCaptureScreen extends StatefulWidget {
  const WebCaptureScreen({
    super.key,
    required this.api,
    required this.item,
  });

  final ZuniMobileApi api;
  final SyncQueueItem item;

  @override
  State<WebCaptureScreen> createState() => _WebCaptureScreenState();
}

class _WebCaptureScreenState extends State<WebCaptureScreen> {
  late final WebViewController _controller;
  bool _loading = true;
  String? _status;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: (_) {
            setState(() {
              _loading = false;
            });
          },
        ),
      )
      ..loadRequest(Uri.parse(widget.item.fetchUrl));
  }

  Future<void> _extractAndSend() async {
    setState(() => _status = "Lendo preço…");
    try {
      final raw = await _controller.runJavaScriptReturningResult(kExtractPriceJsonLd);
      var s = raw?.toString() ?? "";
      if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
        try {
          s = jsonDecode(s) as String;
        } catch (_) {}
      }
      final j = jsonDecode(s) as Map<String, dynamic>;
      final ok = j["ok"] == true;
      if (!ok) {
        setState(() => _status = "Não achei preço no JSON-LD. Abra no navegador externo ou tente outra URL.");
        return;
      }
      final price = (j["price"] as num).toDouble();
      setState(() => _status = "Enviando R\$ ${price.toStringAsFixed(2)}…");
      await widget.api.reportSync([
        {
          "product_id": widget.item.productId,
          "ok": true,
          "price": price,
          "promo_price": null,
        },
      ]);
      if (!mounted) return;
      setState(() => _status = "Salvo com sucesso.");
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Preço sincronizado.")),
      );
    } catch (e) {
      setState(() => _status = "Erro: $e");
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text("ML · ${widget.item.code6}"),
        actions: [
          IconButton(
            tooltip: "Extrair e enviar",
            onPressed: _loading ? null : _extractAndSend,
            icon: const Icon(Icons.cloud_upload),
          ),
        ],
      ),
      body: Column(
        children: [
          if (_status != null)
            Material(
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
              child: ListTile(
                title: Text(_status!, style: const TextStyle(fontSize: 13)),
              ),
            ),
          Expanded(
            child: Stack(
              children: [
                WebViewWidget(controller: _controller),
                if (_loading) const Center(child: CircularProgressIndicator()),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

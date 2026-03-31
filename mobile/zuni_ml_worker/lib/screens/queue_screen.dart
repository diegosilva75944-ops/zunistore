import "package:flutter/material.dart";

import "../config/settings_store.dart";
import "../models/sync_models.dart";
import "../services/api_service.dart";
import "web_capture_screen.dart";

class QueueScreen extends StatefulWidget {
  const QueueScreen({super.key});

  @override
  State<QueueScreen> createState() => _QueueScreenState();
}

class _QueueScreenState extends State<QueueScreen> {
  List<SyncQueueItem> _items = [];
  String? _error;
  bool _busy = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final base = await SettingsStore.instance.getBaseUrl();
      final key = await SettingsStore.instance.getApiKey();
      if (base == null || base.isEmpty || key == null || key.length < 16) {
        setState(() {
          _items = [];
          _error = "Configure URL e chave em Configurações.";
          _busy = false;
        });
        return;
      }
      final api = ZuniMobileApi(baseUrl: base, apiKey: key);
      final list = await api.fetchSyncQueue(limit: 15);
      setState(() {
        _items = list;
        _busy = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_busy) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Text(_error!, textAlign: TextAlign.center),
        ),
      );
    }
    if (_items.isEmpty) {
      return const Center(child: Text("Nenhum produto na fila (ou todos recentes)."));
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        itemCount: _items.length,
        itemBuilder: (ctx, i) {
          final it = _items[i];
          return ListTile(
            leading: const Icon(Icons.shopping_bag_outlined),
            title: Text(it.code6, style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text(
              it.fetchUrl,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            onTap: () async {
              final b = await SettingsStore.instance.getBaseUrl();
              final k = await SettingsStore.instance.getApiKey();
              if (b == null || k == null) return;
              if (!context.mounted) return;
              await Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => WebCaptureScreen(
                    api: ZuniMobileApi(baseUrl: b, apiKey: k),
                    item: it,
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}

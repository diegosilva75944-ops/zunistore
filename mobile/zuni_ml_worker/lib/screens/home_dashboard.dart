import "package:flutter/material.dart";

import "../config/settings_store.dart";

class HomeDashboard extends StatelessWidget {
  const HomeDashboard({super.key});

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<bool>(
      future: SettingsStore.instance.isConfigured(),
      builder: (ctx, snap) {
        final ok = snap.data ?? false;
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              ok ? "Configuração OK." : "Configure URL e chave em Configurações.",
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 12),
            const Text(
              "1) Fila: lista produtos ML para atualizar preço.\n"
              "2) Abra o item → aguarde a página → toque no ícone de enviar.\n"
              "3) O preço é lido do JSON-LD na WebView (rede do celular).",
              style: TextStyle(fontSize: 14, height: 1.4),
            ),
          ],
        );
      },
    );
  }
}

import "package:flutter/material.dart";

import "screens/home_dashboard.dart";
import "screens/import_screen.dart";
import "screens/queue_screen.dart";
import "screens/settings_screen.dart";

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ZuniMlWorkerApp());
}

class ZuniMlWorkerApp extends StatelessWidget {
  const ZuniMlWorkerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: "Zuni ML Worker",
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF1565C0)),
        useMaterial3: true,
      ),
      home: const MainShell(),
    );
  }
}

class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _index = 0;

  static const _titles = ["Início", "Fila", "Importar", "Config"];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_titles[_index])),
      body: IndexedStack(
        index: _index,
        children: const [
          HomeDashboard(),
          QueueScreen(),
          ImportScreen(),
          SettingsScreen(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), label: "Início"),
          NavigationDestination(icon: Icon(Icons.queue_outlined), label: "Fila"),
          NavigationDestination(icon: Icon(Icons.add_shopping_cart_outlined), label: "Importar"),
          NavigationDestination(icon: Icon(Icons.settings_outlined), label: "Config"),
        ],
      ),
    );
  }
}

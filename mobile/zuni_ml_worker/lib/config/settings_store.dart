import "package:flutter_secure_storage/flutter_secure_storage.dart";
import "package:shared_preferences/shared_preferences.dart";

const _kBaseUrl = "zuni_mobile_base_url";
const _kApiKey = "zuni_mobile_api_key";

/// URL base do site (ex.: https://www.zunistore.com.br) sem barra final.
class SettingsStore {
  SettingsStore._();
  static final SettingsStore instance = SettingsStore._();

  final _secure = const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  Future<String?> getBaseUrl() async {
    final p = await SharedPreferences.getInstance();
    return p.getString(_kBaseUrl);
  }

  Future<void> setBaseUrl(String url) async {
    final p = await SharedPreferences.getInstance();
    final trimmed = url.trim().replaceAll(RegExp(r"/+$"), "");
    await p.setString(_kBaseUrl, trimmed);
  }

  Future<String?> getApiKey() => _secure.read(key: _kApiKey);

  Future<void> setApiKey(String key) => _secure.write(key: _kApiKey, value: key.trim());

  Future<void> clearApiKey() => _secure.delete(key: _kApiKey);

  Future<bool> isConfigured() async {
    final u = await getBaseUrl();
    final k = await getApiKey();
    return (u != null && u.isNotEmpty && k != null && k.length >= 16);
  }
}

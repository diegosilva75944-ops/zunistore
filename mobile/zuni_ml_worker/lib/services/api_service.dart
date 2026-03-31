import "dart:convert";

import "package:http/http.dart" as http;

import "../models/sync_models.dart";

class ApiException implements Exception {
  ApiException(this.message, [this.statusCode]);
  final String message;
  final int? statusCode;

  @override
  String toString() => "ApiException($statusCode): $message";
}

class ZuniMobileApi {
  ZuniMobileApi({required this.baseUrl, required this.apiKey});

  final String baseUrl;
  final String apiKey;

  Uri _u(String path, [Map<String, String>? query]) {
    final root = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;
    return Uri.parse("$root$path").replace(queryParameters: query);
  }

  Map<String, String> get _headers => {
        "Authorization": "Bearer $apiKey",
        "Content-Type": "application/json",
        "Accept": "application/json",
      };

  Future<void> healthCheck() async {
    final r = await http.get(_u("/api/mobile/v1/health"));
    if (r.statusCode != 200) {
      throw ApiException(r.body, r.statusCode);
    }
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    if (j["ok"] != true) throw ApiException("health inválido", r.statusCode);
  }

  Future<List<SyncQueueItem>> fetchSyncQueue({int limit = 10}) async {
    final r = await http.get(
      _u("/api/mobile/v1/sync/next", {"limit": "$limit"}),
      headers: _headers,
    );
    if (r.statusCode != 200) {
      throw ApiException(r.body, r.statusCode);
    }
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    if (j["ok"] != true) throw ApiException("sync/next falhou", r.statusCode);
    final items = j["items"] as List<dynamic>? ?? [];
    return items.map((e) => SyncQueueItem.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<SyncReportResult>> reportSync(List<Map<String, dynamic>> items) async {
    final r = await http.post(
      _u("/api/mobile/v1/sync/report"),
      headers: _headers,
      body: jsonEncode({"items": items}),
    );
    if (r.statusCode != 200) {
      throw ApiException(r.body, r.statusCode);
    }
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    if (j["ok"] != true) throw ApiException("report falhou", r.statusCode);
    final results = j["results"] as List<dynamic>? ?? [];
    return results.map((e) => SyncReportResult.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Map<String, dynamic>> importProduct({
    required String sourceUrl,
    required String affiliateUrl,
    String affiliateCode = "ml_mobile",
  }) async {
    final r = await http.post(
      _u("/api/mobile/v1/import"),
      headers: _headers,
      body: jsonEncode({
        "sourceUrl": sourceUrl,
        "affiliateUrl": affiliateUrl,
        "affiliateCode": affiliateCode,
      }),
    );
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    if (r.statusCode != 200 || j["ok"] != true) {
      throw ApiException(j["error"]?.toString() ?? r.body, r.statusCode);
    }
    return j;
  }
}

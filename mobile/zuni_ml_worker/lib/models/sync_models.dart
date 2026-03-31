class SyncQueueItem {
  SyncQueueItem({
    required this.productId,
    required this.code6,
    required this.fetchUrl,
    this.sourceUrl,
    this.affiliateUrl,
  });

  final String productId;
  final String code6;
  final String fetchUrl;
  final String? sourceUrl;
  final String? affiliateUrl;

  factory SyncQueueItem.fromJson(Map<String, dynamic> j) {
    return SyncQueueItem(
      productId: j["product_id"] as String,
      code6: j["code6"] as String,
      fetchUrl: j["fetch_url"] as String,
      sourceUrl: j["source_url"] as String?,
      affiliateUrl: j["affiliate_url"] as String?,
    );
  }
}

class SyncReportResult {
  SyncReportResult({required this.productId, required this.updated, this.error});

  final String productId;
  final bool updated;
  final String? error;

  factory SyncReportResult.fromJson(Map<String, dynamic> j) {
    return SyncReportResult(
      productId: j["product_id"] as String,
      updated: j["updated"] as bool,
      error: j["error"] as String?,
    );
  }
}

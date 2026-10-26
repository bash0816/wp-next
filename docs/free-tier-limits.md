# Cloudflare 無料枠の一次確認値 (2026-10-26 取得、実装前に再確認すること)
| サービス | 項目 | 値 | 出典 |
|---|---|---|---|
| R2 (Standard のみ無料) | ストレージ | 10 GB-month/月 | https://developers.cloudflare.com/r2/pricing/ |
| R2 | Class A 操作 | 1,000,000/月 | 同上 |
| R2 | Class B 操作 | 10,000,000/月 | 同上 |
| R2 | Egress | 無料 | 同上 |
| D1 (Workers Free) | 読取行数 | 5,000,000/日 (00:00 UTC リセット) | https://developers.cloudflare.com/d1/platform/pricing/ |
| D1 | 書込行数 | 100,000/日 | 同上 |
| D1 | ストレージ合計 | 5 GB (DB単位の上限は別途 platform/limits で要確認。レビューは500MB/DBと指摘) | 同上 |
| Workers Free | リクエスト | 100,000/日 | https://developers.cloudflare.com/workers/platform/limits/ |
| Workers Free | CPU時間/リクエスト | 10 ms | 同上 |
| Workers Free | メモリ | 128 MB | 同上 |
| Workers Free | サブリクエスト | 50/呼出 | 同上 |
上限超過時: D1は日次上限でエラー、Workersはエラー1027/1102(課金は発生しない旨は各ページ要確認)。R2は超過分が課金対象のため**予算ガード必須**。

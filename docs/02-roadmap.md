# ロードマップ(STEP)
| Phase | 内容 | 完了条件 |
|---|---|---|
| 0 | 要件・設計(本docs)、STEP2設計レビュー | レビューGo、未決事項解消 |
| 1 | monorepo雛形、SQLiteスキーマ、core(hooks/canView)、テスト基盤 | schema+canViewのテストGreen |
| 2 | importer(WXR→D1/SQLite) | 実サイトのpost/page/media取込 |
| 3 | Next.js表示(post/page/archive)、ブロック→React、テーマ最小 | 取込サイトがSSRで表示 |
| 4 | プラグインSDK v0(hook/filter/shortcode/option) + analyzer | サンプルプラグイン1本を変換して動作 |
| 5 | 認証・管理画面・private運用・PWA | privateがAPI/SW/RSSで漏れないテスト |
| 6 | Cloudflareデプロイ(承認後)、R2/S3 | stagingで実機確認 |
| 7 | php-wasmサンドボックス スパイク→採否 | 実測ADR |

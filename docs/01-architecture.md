# アーキテクチャ案 (STEP1)  ※STEP2で別モデルによる設計レビュー必須

```
[既存WP] --(WXR/REST/DB dump, 読取専用)--> [importer CLI]
                                                |
                                  +-------------v--------------+
                                  | packages/core (TS, GPL-3.0) |  hooks/filters, WP_Query相当,
                                  |  schema(SQLite) / capabilities|  options, shortcode, blocks
                                  +--+---------+---------+------+
                                     |         |         |
                  packages/adapter-d1  adapter-sqlite  adapter-r2/s3
                                     |
        apps/web (Next.js, OpenNext for Cloudflare) <-- React blocks/theme renderer
        apps/admin (React SPA)    apps/pwa(SW, manifest)
        packages/plugin-sdk  <-- plugins/<slug>/ (TS変換済み)
        packages/php-sandbox (Phase2: php-wasm, 変換不能プラグイン用)
        tools/plugin-analyzer (PHP AST解析→対応表→変換雛形)
```

## パッケージ(monorepo, pnpm)
- `packages/core` 型・スキーマ・hooks・capabilities・可視性判定(単一の `canView(user, post)`)
- `packages/db` マイグレーション(SQLite方言)、クエリビルダ(Drizzle ORM候補)
- `packages/adapter-*` ストレージ/DB差し替え
- `packages/blocks` Gutenbergブロック→React
- `packages/plugin-sdk` WP API互換(add_action, add_filter, register_block_type, add_shortcode, get_option, register_rest_route…)
- `packages/php-sandbox` Phase2
- `tools/importer`, `tools/plugin-analyzer`
- `apps/web`, `apps/admin`

## データモデル
WP標準(wp_posts, wp_postmeta, wp_terms, wp_term_taxonomy, wp_term_relationships, wp_users, wp_usermeta, wp_comments, wp_options)をSQLiteへ**ほぼ同形で再現**(プラグインのmeta/options互換のため)。変更はADRに記録。`post_status`+`post_password`で可視性を表現。

## public / private の二層
1. コンテンツ可視性(実行時): `canView()` を API/SSR/RSS/sitemap/検索/メディア署名URL/SW の全経路で共用。privateはCDNキャッシュ不可(`Cache-Control: private, no-store`)、SWは `Vary`/認証状態でキャッシュ除外。メディアはprivate時R2署名URLまたはWorker経由配信。
2. リポジトリ(開発時): public=GPL本体。private=本番wrangler設定、シークレット参照名、サイト固有インポートデータ、社内プラグイン変換物。**シークレット値自体はどちらのrepoにも置かない**(Cloudflare secrets)。

## プラグイン移植パイプライン
1. 入力: 稼働中WPのプラグイン一覧(REST/ZIP)。2. ライセンス判定(GPLv2-only等は除外)。3. PHP AST解析で使用WP API抽出→SDK対応率算出。4. 対応率高: TS雛形自動生成+手修正。5. 低: php-wasmサンドボックスに隔離、またはスキップ。6. 結果レポート。

## 主要リスク
- WPフックの全互換は不可能(グローバル状態・PHP依存) → 対応API一覧を明示し「対応表」を正本にする
- D1の制限(行サイズ・書込スループット) → 実測してADR化
- php-wasmのWorkers適合性 → Phase2冒頭でスパイク
- ブロックのサーバーサイドレンダ(動的ブロック)はPHP依存 → 個別にTS再実装

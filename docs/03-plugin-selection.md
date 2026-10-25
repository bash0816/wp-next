# 移植対象プラグインの選定基準 (ADR-004)

## 「移しやすい」の判定(analyzerでスコア化)
1. ライセンスが GPLv2+ / GPLv3 / MIT等で GPL-3.0-only と両立(GPLv2 only は除外)
2. 使用WP APIが SDK v0 範囲内: add_action/add_filter、add_shortcode、get_option/update_option、register_block_type(静的)、the_content系フィルタ
3. 独自DBテーブルを作らない(postmeta/optionsのみ)
4. 外部PHP拡張・ファイルシステム書込・exec系を使わない
5. サーバー側ロジックが小さい(表示・メタ追加・リダイレクト・タグ挿入系)

## 優先する種類(想定カテゴリ。具体名は実サイトの導入一覧をanalyzerにかけて決定)
- ヘッダ/フッタ挿入・アナリティクスタグ系
- shortcode のみで完結する表示系
- SEOメタ/OGP/sitemap系(コアで代替できるものはプラグイン不要として置換)
- リダイレクト管理(optionsのみ)
- 静的ブロック追加系

## 後回し/対象外
EC・会員・フォーム(DB保存+メール)・キャッシュ/最適化(Cloudflare側で代替)・バックアップ・セキュリティ系(基盤側で代替)

## 手順
稼働中WPのプラグイン一覧(名前/版/License)を入力→analyzerでスコア→上位から移植。一覧の提供待ち。

## ハイブリッドによる対応範囲の段階化 (2026-10-25 追記)
着手順は「移しやすい順」(ADR-004)だが、対象範囲はハイブリッドで広がる。
| Tier | 方式 | 対象 | 時期 |
|---|---|---|---|
| A | TS変換(SDK) | 上記の移しやすいもの | Phase 4 |
| B | TS変換+手修正 | 独自テーブルなしだがAPI利用が広いもの | Phase 4後半 |
| C | php-wasm隔離 | 変換困難だがPHP内で完結するもの | Phase 7(実測で採否) |
| X | 対象外 | GPLv2-only、EC/会員、exec/拡張依存、Workersで動かないもの | - |

Tier C の未検証リスク(スパイクで実測する):
- Workersのサイズ/CPU/メモリ上限でPHP runtime+WPコアが載るか
- wpdb は同期API、D1は非同期 → DBブリッジ設計が必要(読取のみ/事前ロード等)
- ファイル書込・cURL・cron・セッションの代替
- ライセンス判定(Tier X)はハイブリッドでも解除されない

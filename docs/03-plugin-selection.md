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

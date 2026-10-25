# 要件整理 (STEP1)  2026-10-25

## 確定事項(ユーザー回答)
| 項目 | 決定 |
|---|---|
| ライセンス | GPL-3.0-only |
| 方式 | ハイブリッド: 主系統=TS製WP互換SDK(Next.js/React)、変換不能プラグイン=php-wasm互換サンドボックス(Phase2) |
| 実行基盤 | Cloudflare Workers + D1(SQLite) / R2、S3互換ストレージ、静的はCloudflare Pages |
| DB | SQLite方言を正とする(D1とローカルSQLiteで同一スキーマ) |
| PWA | 必須(Service Worker / manifest / オフライン閲覧) |
| repo | public `bash0816/wp-next`(GPL本体) + private `bash0816/wp-next-private`(本番設定・サイト固有データ・秘密) |
| 進め方 | STEP制。外部API/課金手段の新規導入は着手前に個別確認 |

## 前提・事実(要一次情報確認)
- WordPress本体は GPLv2-or-later。GPL-3.0-only への組み込みは可。
- 「GPLv2 only」のプラグイン/テーマは GPL-3.0-only と結合不可 → 移植対象から除外 or 別プロセス/別配布で隔離。**プラグイン毎にヘッダの License を機械判定し、不可なら取り込まない**(wordpress.org の plugin ヘッダ `License:` と SPDX)。
- 「cloudvdb」は Cloudflare D1 と解釈(要ユーザー確認。Vectorize の意なら別途)。
- php-wasm は Workers のサイズ/CPU上限により全WPは動かない可能性大。Phase2で実測して可否判断。

## 機能要件
- FR1 インポート: 既存WPからWXR/REST API/DB dumpで 投稿・固定ページ・メディア・ユーザー・タクソノミー・コメント・options を取り込み
- FR2 コア: posts/pages/media/users/terms/comments/menus/options をD1に格納、REST互換API(`/wp-json/wp/v2/*`の主要部分)
- FR3 可視性: public / private / password / draft / pending / future。private はログイン済み権限者のみ(API・SSR・PWAキャッシュ全層で)
- FR4 テーマ: ブロックテーマ(theme.json)をReactコンポーネントへ。クラシックテーマは対象外(Phase後)
- FR5 ブロック: Gutenberg ブロックのHTML/JSONをReactでレンダ(コア+主要ブロック)
- FR6 プラグインSDK: action/filter、shortcode、block登録、options、REST route、cron(Workers Cron Triggers)互換
- FR7 プラグイン移植: WPから「プラグインを入れて」解析→対応表→自動変換→不可なら php-wasm 振り分け、のパイプライン
- FR8 メディア: R2 / S3 アップロード、画像リサイズ(Cloudflare Images or ビルド時)
- FR9 認証: セッション(Cookie)+ パスワードはWP phpass ハッシュ互換で検証し初回ログイン時に argon2/scrypt へ再ハッシュ
- FR10 管理画面: React製(投稿/メディア/設定/プラグイン管理)
- FR11 PWA: manifest, SW, オフライン、private コンテンツは SW でキャッシュしない
- FR12 SEO: sitemap/RSS/OGP/canonical

## 非機能要件
- NFR1 セキュリティ: private 漏洩防止(キャッシュ・RSS・sitemap・検索・REST・メディアURL)、プラグインのサンドボックス化、権限モデル(capabilities)互換
- NFR2 移行安全性: 元WPを破壊しない(読み取りのみ)、差分再同期可能
- NFR3 DB: D1 の制約(1DB 10GB 等、要公式確認)を考慮し、メディアはR2/S3へ
- NFR4 可搬性: Cloudflare 非依存層を `adapter` で分離(D1/better-sqlite3/libSQL、R2/S3)
- NFR5 コスト: 無料枠内で小規模サイトが動く

## スコープ外(当面)
WooCommerce、マルチサイト、クラシックテーマの完全互換、wp-admin PHP画面の完全互換。

## 未決事項(ユーザー確認待ち)
1. 「cloudvdb」= D1 で良いか
2. 最初の移植対象サイト/プラグイン候補(実データで検証したい)
3. Cloudflare アカウント/S3 の利用承認と課金上限(デプロイ前に必須)
4. 認証方式(自前セッション / Cloudflare Access / 外部IdP)

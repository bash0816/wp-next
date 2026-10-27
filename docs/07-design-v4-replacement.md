# 設計 v4: WordPress 完全入れ替え(Docker+SQLite 主系統)  ※STEP2レビュー前の草案
前提: ADR-016〜020。目的=既存WordPressを置き換える、モダナイズ版。DBはWP同形、基盤は設定で選択、受入はE2Eで実WPと同一(基準WP=OCI)。GPL-3.0-only。

## 1. 置き換え対象の分解(WPの責務 → 本プロジェクトの担当)
| WPの責務 | 方針 | 現状 |
|---|---|---|
| データ層(wp_posts等) | WP同形SQLite(`packages/db`)。移行はDB/WXRの取り込み | スキーマ・可視判定済 |
| 認可(capabilities) | `canView`/`visibleWhere`を拡張。roles/caps表を同形で持つ | canViewのみ |
| 認証/セッション | 自前(ADR: S4)。hash=phpass/WP bcrypt検証、session_tokens同形 | S4a済 |
| リクエストルーティング/rewrite | 単一ゲート(`packages/gate`)。パーマリンク構造はoptionから解釈 | /p /search /feed /sitemap /wp-json一部 |
| テンプレート/テーマ描画 | **最大の未解決**。選択肢はA)テーマをReact/Next化 B)ブロックテーマ(theme.json+HTMLテンプレ)をTS実装で解釈。E2E同一性の対象 | 簡易HTMLのみ |
| ブロック/ショートコード/the_content | ブロックはTSパーサ+レンダラ、ショートコードはSDK登録制 | 未 |
| REST API | `/wp-json/wp/v2/*` を順次(posts,pages,users,media,terms,comments,settings) | posts一部 |
| 管理画面 | React製の新管理UI(WP admin完全再現は非目標、機能同等)。段階導入 | 未 |
| メディア | ObjectStore(local FS/S3互換/R2)。全親AND配信 | S3済 |
| Cron/メール/更新 | ジョブ実行基盤(local=プロセス内、CFはCron Trigger) | 未 |
| プラグイン/テーマ互換 | TS SDK(Tier A/B)。php-wasmは移行不能分のみ(Tier C) | 方針のみ |
| パッケージング | Docker(単一イメージ+volume=SQLite+uploads)、compose例 | 未 |
| PWA | SW+manifest。`public-anon`のみキャッシュ | 未 |

## 2. 実行形態(provider)
local=Node(またはBun)+SQLite+ファイルFS、Dockerで配布(主系統)。cloudflare/s3は同じコードにadapter注入。composition rootは`apps/server`(新設)のみが基盤を知る。

## 3. 同一性の担保(ADR-018)
- 差分比較ハーネス: 同一のseed(WXR/SQLite dump)を基準WP(OCI)と本実装に投入し、URL一覧に対して HTML(正規化DOM比較)・REST JSON・feed・sitemap・HTTPステータス/ヘッダを比較。
- 意図した差異は`docs/parity-exceptions.md`に理由付きで列挙(例: セキュリティヘッダ、ゼロキャッシュ方針)。
- 合格条件は段階: P1 REST posts/feed/sitemap → P2 ブロックHTML → P3 テーマ描画 → P4 管理操作の副作用(DB差分)。

## 4. フェーズ(再編)
- P0 基盤: Docker化+composition root+設定(provider選択) ←S4後すぐ
- P1 認証完了: S4b セッション(usermeta session_tokens)/S4c CSRF+ログイン
- P2 読取パリティ: REST全般・feed・sitemap・permalink・ブロック/ショートコード→E2Eハーネス
- P3 テーマ: 方式決定(A/B)→描画パリティ
- P4 管理UI+書込API(投稿作成/更新、メディアアップロード、設定)
- P5 取り込み(WXR/DBダンプ/uploads)と移行ガイド
- P6 プラグイン互換SDK、PWA、php-wasm(Tier C)

## 5. 未決(ユーザー判断が要る)
1. テーマ方式 A(React化)かB(WPブロックテーマ解釈)か → 同一性の観点ではBが近いが実装量大。P3前に決める。
2. 管理画面: WP adminの機能同等で十分か。
3. ランタイム: Node(node:sqlite採用済)で確定してよいか。
4. フロントのReact/Next.js: Dockerサーバ内でSSRに使うか(未回答)。
## 6. リスク
範囲が極めて大きい(テーマ描画とプラグイン互換が支配的)。P2までで「閲覧サイトとして置換可能」を最初のマイルストーンとし、以降は需要で優先付けする。

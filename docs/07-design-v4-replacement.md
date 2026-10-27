# 設計 v4: WordPress 完全入れ替え(Docker+SQLite 主系統)  (v4.1: GPT-6.1-sol STEP2 No-Go のBlocker/Major反映版。再レビュー待ち)
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

## 3. 同一性の担保(ADR-018)— 入力・判定契約
- **fixture**: DBダンプ(posts/postmeta/options/users/usermeta/terms/comments)+uploads+有効テーマ/プラグイン+設定を1セットにし、基準WP(OCI)と本実装へ同一手順で投入。各試験前に初期化。WXRだけでは不足(options・認証・uploads欠落)。
- **正規化**: 時計(日時)・siteurl・nonce/乱数・キャッシュバスタ(?ver=)のみ限定的に正規化。その他は完全一致。
- **観点**: 匿名/ロール別/パスワード保護/private化直後/下書き。HTML(正規化DOM)・REST JSON・feed・sitemap・ステータス/ヘッダ。**書込後はDB差分・uploads差分・ジョブ副作用も比較**。
- **限界**: DOM比較ではCSS/JSの見た目・操作は判定不可 → E3でスクリーンショット差分(Playwright等)とJS操作の主要シナリオを追加。
- **意図した差異**: `docs/parity-exceptions.md` に理由付きで列挙(セキュリティヘッダ、no-store 等)。
- 受入段階名は実装フェーズ(P)と衝突しないよう **E1〜E4**: E1 REST posts/feed/sitemap、E2 ブロックHTML、E3 テーマ描画(+画面差分)、E4 管理操作の副作用。

## 4. 共通サービスと書込経路(レビュー指摘)
管理UIとRESTは同じ「操作サービス層」(`packages/core` 拡張)を通る: 操作認可(edit/delete/設定変更の `can(actor, cap, target)`)、WP_Query相当のクエリ層(`packages/db`、可視条件は`visibleWhere`必須)、hooks/filters/options、リビジョン・自動保存・予約公開、メディア派生生成、パスワード再設定。各責務の担当パッケージとテスト方針はP0〜P4で順に確定。
## 5. DB同形の確定手順
現スキーマは「最小列」。基準WP(OCI)から実スキーマを取得し、列・型・既定値・索引・保存形式の対応表(`docs/db-mapping.md`)を作成。本実装の完全同形化と、比較用の最小DB取り込み(ダンプ→SQLite)を**E2E開始前(P0)**に実装。独自拡張列(auth_version等)は別テーブルまたはメタに退避する方向で検討(ADR-017と整合)。
## 6. 継承する制約(v2 §14 / ADR)
本文は毎回動的生成・認可はSQL・`no-store`・静的アセットは許可リスト完全一致のみ。Docker/SSRでも同じ。**uploads直配信を含む迂回経路を作らない**(メディアは常にゲート経由)。Tier Cは別実行境界+制限RPC。取り込むテーマ/プラグインはGPL-3.0-onlyと両立するライセンス判定を通す(ADR-001)。運用: SQLite+uploadsの整合バックアップ/復元、ジョブ排他・再試行、切替・切戻し手順をP5で定義。

## 7. フェーズ(再編)
- **P0 成立性スパイク+基盤(最優先)**: ①対象範囲の固定(基準WP=7.1.3、代表ブロックテーマ1つ、動的ブロック1つ、プラグイン1本、非対応範囲の明記)②縦断スパイク: 代表テーマの1ページをTSで描画し基準WPと比較(**不成立時の撤退条件: 1ページの描画が基準と構造一致しない原因が「PHP実行必須」と判明した場合、B案を捨てphp-wasm描画(ADR-002のTier C拡大)へ切替**)③DB対応表と最小取り込み④Docker化+composition root+設定
- P1 認証完了: S4b セッション(usermeta session_tokens)/S4c CSRF+ログイン(進行中)
- P2 読取パリティ: REST全般・feed・sitemap・permalink・ブロック/ショートコード→E1,E2
- P3 テーマ描画(P0結果に基づく方式)→E3
- P4 管理UI+書込API(共通サービス層経由)→E4
- P5 取り込み/移行/運用(バックアップ・切替・切戻し)
- P6 プラグイン互換SDK、PWA、php-wasm(Tier C)
「閲覧サイトとして置換可能」の判定はE3通過後(旧記述のP2は誤り)。

## 8. 未決とレビュー推奨(GPT-6.1-sol)
1. テーマ: B(ブロックテーマ解釈)を第一候補、クラシックPHPテーマは別途移植範囲として明示。P0スパイクで確定。
2. 管理画面: 機能同等で可(操作別受入表で保存結果・権限・副作用を比較)。
3. ランタイム: Node固定(Bunは後続、Node依存はadapter内に閉じる)。
4. React: 管理UIに採用、公開描画のNext.js採用は保留(採用時も§6必須)。
→ ユーザー承認待ち(1〜4)。
## 9. リスク
範囲が極めて大きい。支配要因はテーマ描画とプラグイン互換。P0スパイクで成立性を先に判定し、不成立なら撤退条件に従い方式を切り替える。

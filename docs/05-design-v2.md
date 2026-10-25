# 設計 v2 (STEP1改訂)  2026-10-25
01-architecture.md の構成を前提に、04-step2-review.md の指摘を仕様化する。矛盾時は本書が優先。

## 1. 可視性・キャッシュ失効 (B1)
- `canView(actor, post)` を唯一の判定関数とし、REST/SSR/RSS/sitemap/検索/メディア/SWが共用。**直接 post_status を見る実装は禁止**(lint規則+テストで強制)。
- 静的生成(SSG/ISR)は「公開(publish)かつ password なしかつ private 化されたことがない」ページのみ。`visibility_epoch`(投稿ごとの整数、状態変更で+1)を持ち、キャッシュキー/タグに含める。
- 状態遷移 publish→private/draft/trash/password、削除、権限変更時: (1) `revalidateTag('post:<id>')` と一覧/アーカイブ/フィード/sitemap タグ、(2) Cloudflare Cache purge(tag/URL)、(3) `visibility_epoch`+1。失敗時はジョブ再試行し、完了までその投稿を **fail-closed(404)** にする。
- 認証済みリクエストは `Cache-Control: private, no-store`。`Vary: Cookie`。RSC/prefetch/`_next/data` も同ルート規則で判定。
- SW: private/認証応答は**キャッシュしない**(Request に認証 Cookie がある or `X-WP-Visibility` != public はバイパス)。公開コンテンツのキャッシュは `visibility_epoch` 付きマニフェストで検証し、不一致は破棄。ログアウト時は全キャッシュ削除。**既に端末にある旧公開コンテンツは回収不能**(要件として明記、機密は最初から private で作成する運用)。
- 受入: 公開→private 変更後 60 秒以内に未認証 GET が 404、CDN・SW・RSC のいずれからも本文が返らない自動テスト。

## 2. メディア (B2)
- 全メディアは非公開 R2/S3 バケットに保存、配信は Worker `/media/*` 経由で毎回 `canView(attachment)`。
- attachment の可視性: 親投稿に `inherit`。親なし=公開設定フラグ。複数投稿で共用された場合は「いずれかの公開親があれば公開」ではなく **最も制限の強い親に従う(安全側)**、管理画面で明示上書き可。
- サムネイル/派生サイズは原本と同一可視性。旧公開 URL は同一パス維持で Worker が判定するため、private 化で即 404。
- 署名 URL は「機密でない大容量(動画等)」限定オプション。短寿命(<=5分)、失効不可を UI に明示。既定は使わない。

## 3. 実行・信頼モデル (B3)
- Tier A/B: **監査済みコードのみ**同一 Worker にバンドル。取込時に analyzer 報告+人手承認(PR レビュー)+SBOM/ライセンス判定を通過したものだけ。実行時の動的ロードは禁止(Workers でも不可)。
- 権限: SDK は capability 付き `ctx` のみをプラグインに渡す(DB 生ハンドル・環境変数・R2 を渡さない)。plugin 用 options/meta は名前空間 `plugin:<slug>`。ネットワークは SDK の `fetch` ラッパ経由で宣言ホストのみ許可(SSRF対策: 私的IP/メタデータ宛を拒否)。
- Tier C(php-wasm): 別 Worker(Service Binding)+RPC。許可操作は read_option/read_post/…の列挙のみ。DB・外部通信・FS は既定拒否。Phase1 スパイクが不成立なら Tier C は**採用しない**(撤退条件: 同期 wpdb ブリッジが事前ロード方式で表現できない、またはメモリ/CPU が制限内に収まらない)。

## 4. データモデル・互換 (M2)
- 保存層は WP 同形(wp_posts, postmeta, terms, term_taxonomy, term_relationships, termmeta, users, usermeta, comments, commentmeta, options, links 除外)。互換 API 層(WP_Query 相当/get_post_meta 等)を経由し、**生 SQL 互換は対象外**(`$wpdb->query` 直書きプラグインは Tier X か C)。
- ID は DB 上 INTEGER、API/JS 境界では 53bit 超を想定し**文字列**で扱う(WP の ID は実運用で 2^53 未満だが、検証し超過時は取込失敗とする)。
- meta_value は TEXT。PHP serialize は `php-serialize` 互換の読み書きライブラリで処理し、未対応型(オブジェクト)は不透明文字列として保持(往復保証)。重複 meta(同一 key 複数行)を許容。
- 照合: SQLite の大文字小文字非区別比較は `COLLATE NOCASE`(ASCII のみ)のため、日本語等はアプリ層で正規化比較。slug は NFC+小文字化。
- 日時は UTC の ISO8601 TEXT で統一(post_date は GMT 列を正)。

## 5. 認証・認可 (M3)
- 認証: セッション Cookie(HttpOnly, Secure, SameSite=Lax, 署名付きランダム ID を D1 に保持、失効可能)。CSRF は state-changing に double-submit token+Origin 検証。
- パスワード検証: `$wp$2y$`(WP6.8+ bcrypt+HMAC-SHA384 前処理)・`$P$`(phpass)・`$2y$`・旧 MD5 を判別して検証。成功時に新方式(scrypt/argon2id、Workers 上で CPU 予算内の実装を Phase1 で実測)へ再ハッシュ。Workers CPU 上限で bcrypt が不可の場合のフォールバック(検証専用の別 Worker/ログイン時のみ有料枠)を ADR 化。
- 認可: capabilities(read_private_posts, edit_posts, edit_others_posts, manage_options 等)を WP の role→cap 表から移植。`canView` は閲覧、`can(actor, cap, obj)` は操作。password 保護は署名付き一時 Cookie(投稿単位、期限・epoch 連動)。
- REST: 公開フィールドをスキーマで列挙(allowlist)。ユーザー情報(email 等)は既定非公開。

## 6. 移行 (M4)
| 入力 | 取得範囲 | 欠落 |
|---|---|---|
| WXR | posts/pages/CPT/terms/comments/基本 meta/添付メタ | options大半・メディア実体・パスワードハッシュ・ユーザー詳細 |
| REST(認証付き) | 上記+一部 settings/users(権限次第) | ハッシュ・非公開 meta |
| DB ダンプ(推奨) | 全テーブル | 実ファイル(uploads は別途コピー) |
| uploads ディレクトリ | メディア実体 | - |
- 冪等: `source_id→dest_id` 対応表(`migration_map`)。再実行は upsert。`modified_gmt` で差分、削除は「ソースに存在しない」検知でレポート(自動削除しない)。
- 切替: 読み取り専用で並行運用→DNS/ルート切替→ロールバックは元 WP に戻すだけ(元は変更しない)。切替前後で URL 一覧・件数・ハッシュ比較と旧 URL リダイレクト表を検証。

## 7. ライセンス (M5)
- 依存物 SBOM(npm/PHP/画像/フォント)を機械生成し、SPDX 判定。許可: MIT/BSD/Apache-2.0/ISC/GPL-3.0/GPL-2.0-or-later/LGPL-3.0 等 GPL-3.0 と両立するもの。拒否: GPL-2.0-only、SSPL、独自制限、ライセンス不明。
- プラグイン同梱物にも同判定を適用。著作権表示・ライセンス文を保持。公開ビルドは対応ソースを同一 repo(public)で提供。private repo の成果物を配布する場合も GPL 義務が及ぶ旨をチェックリスト化。

## 8. セキュリティ・運用 (Minor)
- 投稿 HTML は保存時/出力時にサニタイズ(許可タグ allowlist、SVG アップロードは既定禁止)。メディア取得/外部 fetch は SSRF 対策ラッパ。予約投稿・cron は Workers Cron+D1 の `lease` 行で排他、冪等キー。バックアップ(D1 export→R2)と復元リハーサルを Phase7 の完了条件に。
- 互換性合格基準: hook 優先度順・参照渡し相当(filter の戻り値連鎖)・動的ブロック・enqueue された CSS/JS。対象バージョンを固定(WP 6.8 系 / Next.js 15 系 / OpenNext Cloudflare — 版は Phase1 で確定し ADR 化)。実サイトの HTML 出力を正規化して比較するゴールデンテスト。

## 9. Phase1 成立性スパイク(完了条件)
S1 認可付き SSR(canView)+SQLite(D1 互換)+非公開メディア Worker 配信、private 化→404 の自動テスト。
S2 php-wasm(ローカル Node)で wpdb 同期呼び出し→事前ロード方式で非同期データ供給できるか。
S3 パスワード検証(bcrypt/phpass)の CPU 時間をローカル計測し Workers 10ms/30ms 枠と比較(実 D1/Workers での実測は承認後)。
結果は ADR 化し Tier C 採否と撤退条件を確定。

## 10. 無料枠制約の反映 (ADR-008, 2026-10-25 追記)
- 前提(要一次確認): Workers無料はCPU時間が1リクエスト約10ms、D1無料は容量・日次読書き行数に上限、R2無料枠あり。上限値はPhase1で公式資料と実測で確定する。
- 影響: (a) bcrypt等の重いハッシュ検証をWorkers無料のCPU枠で行うのは困難な可能性大 → 認証は「ログイン時のみ・低コスト方式(WebCrypto PBKDF2等)へ事前移行」「WP旧ハッシュは移行時にパスワードリセット誘導」を第一案とし、実測で決定。(b) SSRは重いため**公開ページは原則ビルド時静的生成+Cloudflare Pages配信**、動的処理は認証/管理/APIに限定。(c) **Tier C(php-wasm)は無料枠では事実上不成立の公算が大きく、既定で「採用しない」**。スパイクで反証できた場合のみ再検討。(d) 画像リサイズは有料のCloudflare Imagesを使わず、取込/ビルド時に生成。(e) S3はadapter+互換テストのみ。実環境への公開はR2(無料枠)を既定とする。
- B1との整合: 静的生成中心にすると、private化時の失効はPagesの再デプロイ(または該当ページ除去)が必要。小規模サイトでは「公開→private」時に該当パスを即時404にするWorker(軽量ルート判定)をPagesの前段に置く案を検討(Pages Functionsの無料枠要確認)。

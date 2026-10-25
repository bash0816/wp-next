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
- パスワード検証: `$wp$2y$`(WP6.8+ bcrypt+HMAC-SHA384 前処理)・`$P$`(phpass)・`$2y$`・旧 MD5 を判別して検証。成功時に新方式(scrypt/argon2id、Workers 上で CPU 予算内の実装を Phase1 で実測)へ再ハッシュ。Workers CPU 上限で bcrypt が不可の場合のフォールバック(検証専用の別 Worker/ログイン時のみ有料枠 ← ADR-008により撤回。無料枠で不可なら相談)を ADR 化。
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

## 11. v2.1 修正 (STEP2 再レビュー No-Go #1 への対応。§1,2,6,9 より優先)
### 11.1 B1: 配信前ゲート (fail-closed)
- **全ての本文応答はゲートWorkerを通る。キャッシュ/静的資産の読出しはゲートが許可した後にのみ行う**(Pages静的ファイルへ直接到達できる経路を作らない。Pagesはゲート経由のService Bindingまたは非公開オリジンのみ)。
- ゲート: `path→post_id` と `visibility_epoch`・`status` を D1 の単一インデックス読みで取得し `canView` 判定。D1エラー/タイムアウト時は **404/503 (fail-closed)**。キャッシュ(CDN/Next)のキーには必ず `epoch` を含める(URLクエリではなく内部キー)ため、purge失敗でも旧epochのキャッシュは参照されない。
- **書込み順序**(単一トランザクション): ①`status`変更+`epoch`+1 をD1にコミット → ②revalidate/purge をジョブ投入(失敗は再試行、結果はベストエフォート)。①完了後のゲートは旧epochキャッシュにヒットしない。再生成が旧epochで走っても、保存キーが旧epochなので新epochの要求には使われない(競合安全)。
- 予算(無料枠): ゲートの D1 読み1回/リクエスト。Workers無料のリクエスト数/日とD1読取行数/日を Phase1 で公式値確認し、超過時は **「公開ページはepochを短TTL(<=60s)のメモリ/KVキャッシュで確認」へ縮退** (この場合、保証は「最大TTL秒の遅延」と明記し、遅延を許容できないprivate化は管理画面で『即時遮断』操作=KV強制ブロックリスト書込み(Worker無料のKV書込み枠内)を提供)。
- 保証範囲(要件に明記): 「private化後60秒以内にサーバー側配信が遮断される」。**ブラウザHTTPキャッシュ・SW・オフライン保存済みの本文、既にコピーされた内容は保証対象外**。

### 11.2 SW (Cookie判定の撤回)
- SWはCookieを読めない前提とする。サーバーが全応答に `X-WPN-Class: public-anon | private` を付与。**SWは `public-anon` と明示された応答のみ保存**(それ以外・ヘッダ欠落・Vary: Cookie/`Cache-Control: private|no-store` はバイパス)。保存エントリに `epoch` と取得時刻を持たせ、ナビゲーション時にオンラインなら `/wp-json/wpn/v1/epochs?ids=` で検証し不一致は破棄。**検証不能(オフライン)時は、保存済み public-anon を『古い可能性あり』表示付きで表示可**(オフライン閲覧要件との折衷。privateだったものは保存されていないため漏洩しない)。ログアウト/権限変更で全消去。

### 11.3 B2: メディア認可 = 全親のAND
- 関連表 `media_parents(attachment_id, parent_post_id)` を新設(取込時に post_parent と本文内参照・featured image から構築、親変更/削除時に再計算)。
- 配信条件: 全親について `canView(actor, parent)` が真(AND)。password親が複数異なる場合は全パスワードの解除が必要→UI上は事実上不可なので、**異なるpassword親を持つ共有メディアは管理者のみ閲覧可+警告**。親なしは attachment 自身の `visibility` 列(既定 private)。管理者の明示上書きは監査ログに記録。

### 11.4 M1/M6: スパイク合格条件の再定義
- ローカルNode+SQLiteの結果は「論理検証」とし、Workers適合性の合格には使わない。**実Cloudflare無料アカウントのstaging**(ADR-007/008範囲内)で OpenNext SSR + D1 + R2 を実測し、CPU(無料の上限は公式値を確認)、メモリ、D1読取行数/日、リクエスト/日の予算表を作る。無料枠で成立しなければ「採否保留」にして**ユーザーに相談**(有料は要相談 ADR-008)。
- 認証ハッシュの比較基準は無料枠のCPU上限(約10ms級、要公式確認)。「30ms」の記述は撤回(Paid既定はCPU 30秒)。argon2id/scrypt は実測し、無理ならWebCrypto PBKDF2 を第一候補とし、WP旧ハッシュは初回ログイン時にリセット誘導。

### 11.5 M4: 差分同期・切替の安全性
- 差分検出: `modified_gmt` に加え **テーブル別チェックサム**(行ID範囲ごとのハッシュ: posts/postmeta/terms/termmeta/term_*/users/usermeta/comments/commentmeta/options)を比較。meta/options/usermetaの変更も検出。
- 削除: ソースに存在しない行は `pending_deletions` に記録。**未処理の削除が残る間は切替(cutover)をブロック**。管理者が承認(削除 or 保持)して初めて解除。
- 切替手順: (1)旧WPを読み取り専用化(メンテモード) → (2)最終同期 → (3)件数/ハッシュ/URL一覧の検証 → (4)DNS/ルート切替。**切戻し可能期間は新側の書込みを禁止(read-only)** し、書込みを許可した時点を「戻れない点(point of no return)」として管理画面で明示。以後の巻き戻しは逆移送(新→WPのWXR/SQLエクスポート)に限る。

### 11.6 参照渡し
- WPの参照引数(`do_action_ref_array` 等)によるin-place変更は**非対応**と明記。SDKのfilterは「値を受け取り新しい値を返す」形のみ。参照引数を必要とするプラグインは Tier X 扱い(analyzerで検出)。

## 12. v2.2 修正 (再々レビュー No-Go #2 への対応。§11 より優先)
- **KV は認可に使わない**(伝播遅延・負キャッシュのため即時遮断を保証できない)。§11.1 の「KV強制ブロックリスト」「epoch短TTLキャッシュ」案は撤回。認可は **D1 プライマリ読取のみ**。D1 無料枠不足・エラー時は **404/503 で閉じる(fail-closed)**。無料枠で毎リクエストD1読取が成立しない規模のサイトは、対象外とするか有料相談(ADR-008)。D1 読取は1リクエスト1回の単一インデックス読みに限定し、Phase1 で行数/日の予算を実測。
- **複数投稿を含む応答(一覧/アーカイブ/RSS/sitemap/検索/タクソノミー/REST一覧)のキーはサイト共通 `site_generation` を含める**。可視性に影響する変更(status/password/権限/メディア親/term公開設定/削除)は、対象投稿の `epoch`+1 と `site_generation`+1 を**同一D1トランザクション**で更新。ゲートは `site_generation` と投稿 `epoch` を同一クエリで取得し、キーに両方を含める。単一投稿ページのキーは `epoch` のみ+`site_generation` は含めない(一覧の更新で全記事が再生成されるのを避ける。ただし下位互換のため、公開投稿の本文キャッシュは `epoch` で十分)。一覧系は `site_generation` 変更で一斉無効化(許容)。
- **配信方式の確定**: Cloudflare **Workers Static Assets**(`run_worker_first = true`)で、静的アセットを含む全リクエストを先にWorkerへ。Pages(pages.dev)は本番配信に使わない(迂回経路排除)。受入試験: workers.dev/プレビューURL/旧デプロイ版/直接アセットパスからprivate化済み本文が取得できないこと。workers.dev とプレビューURLは公開ドメイン以外では無効化(設定で無効化し、有効なら全て同一ゲートを通す)。
- §1 の「SSG+Cloudflare Pages配信」は上記Workers Static Assets+ゲートに読み替える。

## 13. v2.3 修正 (再レビュー No-Go #3 への対応。§12 より優先)
- **静的成果物の世代固定**: 全ての静的出力(一覧/RSS/sitemap/検索インデックス/本文HTML)は生成時の `site_generation`(と本文は `epoch`)をメタデータとして埋め込む(ファイル内メタ or マニフェスト)。ゲートはD1の現世代と**一致しない成果物を配信しない**(再生成中は404/503=fail-closed)。キャッシュ再格納時も成果物の世代で検証するため、旧ビルドの内容が新世代キーで配信されることはない。可視性変更後は、(a)該当成果物を現世代の認可済みデータから再生成するジョブ、(b)完了まで該当一覧系は動的生成(毎回認可・生成。件数上限・無料CPU枠内の簡易版)かfail-closed、のいずれか。
- 受入試験に追加: 「private化直後(再デプロイ前)に旧RSS/一覧/検索/sitemapから本文・タイトル・抜粋が返らない」「キャッシュミス時も同様」。
- **R2 無料枠ガード(ADR-008)**: Standardストレージクラスのみ使用。メディア+派生+バックアップの合計容量に**上限(無料枠の80%、公式値はPhase1で確認)**と月間操作数予算を設定し、超過見込みで**アップロード受付停止+管理画面警告**。バックアップは保持世代数を固定(例: 直近N=3)。D1/Workers/R2いずれも使用量を管理画面に表示し、80%到達で警告・100%手前で書込み停止。保証できない構成は作業を止めて相談。
- 読み替え: §10(c)・(b)および§11の「Pages配信」記述は全て Workers Static Assets + ゲートWorker(§12)に置換する。

## 14. v3 縮小方針: 動的認可優先 (Opus助言採用, 2026-10-25。§1/§10(b)/§11.1/§12/§13 の静的生成・世代管理を置換)
経緯: 静的生成+認可ゲートの混成方式は、焼き込んだ成果物を取り消せないため、No-Goのたびに epoch/site_generation/世代照合が増え穴も増えた。構造的原因と判断し、混成を廃止する。
- **本文を含む応答は全て毎回動的生成**: HTML・RSC・`_next/data`・一覧・アーカイブ・RSS・sitemap・検索・REST。データ取得と `canView` は同一D1クエリ内(SQLの WHERE で可視行のみ取得)。取得できなければ404。
- **静的配信は「本文を含まない内容ハッシュ付きJS/CSS/フォント/アイコン」のみ**。ビルド時に許可リスト(拡張子+`/_assets/`配下限定)を生成し、**許可リスト外のパスは既定拒否(404)**。Next.jsのRSCペイロード(.txt)・`_next/data`・検索インデックス入りチャンクはビルド検査で本文を含まないことを検証し、含むものは静的資産に含めない(動的ルート化)。Workers Static Assets + `run_worker_first=true`、workers.dev/プレビューは無効化または同一ゲート(§12維持)。
- **HTML/本文のCDN・Nextキャッシュは使わない(MVP)**。epoch / site_generation / 成果物世代 / 再生成ジョブ / KV は全て不要→削除。`visibility_epoch` はSW用の検証(§11.2)にのみ残す。
- 一覧系は件数上限付き簡易版(ページング必須、1ページ上限件数をCPU予算から決定)。検索はD1の動的クエリのみ(FTS5が無料D1で使えるかはPhase1で確認、不可ならLIKE+上限)。
- SW(§11.2)はそのまま: `X-WPN-Class: public-anon` のみ保存、epoch検証。公開コンテンツの再訪を高速化する唯一のキャッシュ層で、保証範囲外(端末保存分)は従来どおり明記。
- 受入試験: private化の次のリクエストから、HTML/RSC/_next/data/RSS/一覧/検索/sitemap/メディア全てで未認証が404(キャッシュ層が無いため設計上即時)。許可リスト外パス・workers.dev・プレビューURLからの本文取得不可。
- **最優先リスク**: 毎回SSRが無料枠CPU(約10ms級、公式値要確認)・D1読取行数/日に収まるか。Phase1スパイクで最初に実測。収まらなければ**作業を止めて相談**(ADR-008。有料へは移行しない)。収まらない場合の選択肢(相談用): 対象サイトの規模を絞る/Reactの描画をクライアント側へ寄せる(HTML骨格+JSON APIのSPA寄り構成)/公開サイトのみ静的化し記事のprivate機能を提供しない。
- R2ガード(§13後半)は維持。

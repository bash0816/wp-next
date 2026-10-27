# 実装計画・テスト戦略 (STEP3)  対象: Phase1 成立性スパイク + Phase2 コア基盤
前提: 設計は 05-design-v2.md §14(v3 動的認可優先)。制約: 無料枠のみ・有料は要相談(ADR-008)・S3は想定のみ。

## 1. 技術選定(要確認項目は Phase1 で版固定しADR化)
pnpm monorepo / TypeScript strict / Vitest / Drizzle ORM(SQLite方言、D1・better-sqlite3両対応) / Next.js + OpenNext for Cloudflare(版はスパイクで確定) / wrangler + workerd(`wrangler dev`でローカルD1・R2エミュレート) / MinIO(S3互換テスト用ローカル) / Playwright(E2E)。外部送信なし(ローカルで完結)。

## 2. 残Major2件の仕様化
- **M-A パスワード解除Cookie**: posts に `auth_version` INTEGER を追加(`post_password` 変更・status変更で+1)。解除Cookie=`HMAC(secret, post_id|auth_version|exp)`。**毎リクエスト D1 の auth_version と照合**し不一致は拒否。`visibility_epoch`(SW用)とは別物として定義。テスト: パスワード変更後に旧Cookieで403/404。
- **M-B R2/D1/Workers 使用量ガード**: 全 R2 操作(GET/HEAD/PUT/LIST、取込・配信・バックアップ)を `usage_counter`(D1、日次/月次)でカウントする `storage` ラッパ経由に限定(直接呼出しは lint で禁止)。閾値 80% で警告、95% で **読取・書込みとも停止(fail-closed、503)**。公開メディアの配信は無料枠が尽きる前に止まる設計。カウンタ自体のD1書込みコストも予算に含める(バッチ集計: 100操作ごとにフラッシュ)。公式の無料枠値は Phase1 で一次確認し設定値(定数ファイル+出典URL)に記録。

## 3. タスク (TDD: テスト→Red→実装→Green。各タスクは tasks.md のチェック欄で追跡)
### Phase1 成立性スパイク(捨てコード可、結果はADR)
| ID | 内容 | テスト/合格条件 |
|---|---|---|
| S0 | monorepo雛形・CI(ローカルスクリプト)・lint(`no direct post_status`/`no direct r2`規則) | `pnpm test` `pnpm lint` Green |
| S1 | schema(WP同形+media_parents+auth_version+usage_counter)、`canView`、可視行のみ返すクエリ | 単体: status×actor×password 全組合せ表テスト。SQLで private 行が結果に出ない |
| S2 | ゲート付きルート(HTML/RSC/_next/data/RSS/sitemap/検索/REST)と許可リスト静的配信 | 統合: private化直後の全経路404、許可リスト外パス404、workers.dev相当の直アクセス不可 |
| S3 | 非公開メディア配信(全親AND、`inherit`、派生) | 統合: 親が1つprivateなら404、親変更で再判定 |
| S4 | 認証(ローカルCPU計測のみでは合格にしない。実Workers実測は S5'): WPハッシュ(`$wp$2y$`,`$P$`,`$2y$`,MD5)検証と再ハッシュ、セッション、CSRF | 既知ベクタ(WP公式のハッシュ例)で検証Green。CPU時間をローカル計測(ms) |
| S4b | **ビルド成果物検査**(§14): 静的出力(JS/RSC/.txt/_next/data/検索インデックス)に本文・非公開タイトル/抜粋が混入していないかを走査 | 本文を意図的に混入した成果物でRed、除去でGreen。許可リスト外ファイルがあればビルド失敗 |
| S5' | **最小縦断の実測を先行**(S5より前): S1-S3+ログイン経路(検証・再ハッシュ)を実Workers無料でCPU実測 | 不成立ならリセット誘導等の代替を検証、無理なら相談 |
| S5 | php-wasm最小実験(wpdb同期→事前ロード) | 実験レポート。撤退条件(§3 Tier C)判定。無料枠ではTier C既定不採用のため**1日以内で打切り** |
| S6 | 実Cloudflare無料アカウントstaging(ADR-007範囲)で SSR+D1+R2 の CPU/メモリ/D1行数を実測 | 予算表。**無料枠で不成立なら作業停止しユーザー相談** |
| S7 | ADR化・Phase1完了レビュー(STEP8/9相当) | Go判定 |
### Phase2 コア基盤(Phase1がGoの場合のみ着手)
core(hooks/filters/capabilities/options/shortcode)、serialize往復、importer(DBダンプ入力)、migration_map・pending_deletions。詳細タスクはPhase1完了後にtasks.mdへ展開しSTEP3再レビュー。

## 4. テスト戦略
- 層: 単体(Vitest) / 統合(Miniflare・workerd+ローカルD1) / E2E(Playwright: private化→未認証取得、SW挙動) / セキュリティ回帰(漏洩経路チェックリスト自動化) / ゴールデン(WPの出力HTMLとの正規化比較、Phase3以降)。
- **漏洩回帰スイート**: 経路一覧(HTML,RSC,_next/data,RSS,sitemap,検索,REST,メディア,派生画像,workers.dev,プレビュー,許可リスト外)×状態(publish/private/draft/trash/password/親private)の表駆動テストを常設。新ルート追加時に表へ追加しないとCIが落ちる(ルート列挙との突合)。
- 判定ロジックは1箇所(canView)で、他からの `post_status` 直参照はlintで失敗。
- 実測テスト(S6)は自動テスト化せず手順書+結果記録(docs/spike-results.md)。

## 5. 影響範囲とリスク
- 新規repoのみ。既存システム(Magi等)に影響なし。外部送信: GitHub push(承認済み)、Cloudflare無料staging(S6、ADR-007)のみ。
- 主リスク: (1)毎回SSRが無料CPU枠に収まらない(S6で判定、不成立=相談) (2)bcrypt検証CPU (3)php-wasm不成立(想定内、Tier C不採用) (4)D1行数/日。
- 撤退/縮小オプション(相談用): 対象規模を絞る / SPA寄り構成 / 公開サイトのみ静的化。

## 6. 完了定義(Phase1)
S1-S4,S7 の全テストGreen、S6の実測結果が無料枠内、漏洩回帰スイートGreen、ADR更新、STEP8/9レビューGo。

## 7. STEP3レビュー(GPT-6.1-sol)で追加した条件 (Go with conditions, 2026-10-26)
無料staging(S5'/S6)の実行**前**に下記が成立していること。Phase1完了判定までに全件解消。
1. **予算ガードの原子性**: 操作「前」に永続・原子的な予算予約(D1の条件付きUPDATE `used+n<=limit`)を行い、失敗/未計上なら操作を拒否(fail-closed)。「100操作ごとフラッシュ」は廃止。テスト: 並行実行、再起動、閾値境界(80%警告/95%停止)、計上失敗時の停止。
2. **ガード対象の拡張**: R2(操作区分別 A/B 予算+容量80%上限+バックアップ保持N世代)、D1(読取行数/書込行数/日)、Workers(リクエスト数/日)。各に計測単位・警告・停止条件・出典URLを定数ファイルへ(値はPhase1で公式一次確認)。
3. **認証の実測合格条件**: ログイン(検証+再ハッシュ)を実Workers無料でCPU計測。不成立時の代替(リセット誘導/PBKDF2)を検証。
4. **ビルド成果物検査**: S4b(上表)。
5. **auth_version**: 本文/パスワード/status変更と `auth_version`+1 は同一トランザクション。テスト: status往復後の旧Cookie拒否、期限切れ、改ざん、パスワード変更後。

## 8. 予算ガードのブロック予約 (ADR-014, 2026-10-27 仕様案 — 実D1接続前にSTEP2/3相当のレビュー必須)
問題: 予約1回=D1書込1行。R2/D1/Workers操作ごとに書くと、D1書込10万行/日の枠を自分で消費する。
- 方式: `BlockedBudget(store, guard, blockSize)`。プロセス(isolate)内に `remaining[key]` を持ち、枯渇したら `guard.reserve(key, blockSize)` で **D1に1回だけ**ブロック分を予約、以後はメモリで払い出す。D1書込は操作数/blockSize に削減(例: 100操作→1行)。
- 安全側の性質: 予約は常に「実使用以上」。isolate破棄・再起動で未使用分は失効=過大計上(無料枠を超えない方向のみにずれる)。
- 残余: 実効上限(95%)の手前 blockSize 未満では小ブロック(残量)で予約し、満杯を超えない。blockSize は key ごとに設定(Class B=大きく、storageバイト=ブロック化せず都度)。
- 失効による過大計上の最大損失: isolate数 × blockSize。isolate数は無料Workersで不定 → blockSize は上限の0.1%以下とする(例: Class A 1e6 → 最大1000)。
- テスト: 払い出しがblock内でD1書込0回(spyで検証)、枯渇時のみ1回、並行(Promise.all)でも払い出し総数が予約総数を超えない、reserve失敗でfail-closed、端数ブロック、blockSize不正値。
- D1日次書込の自己消費予算: ガード由来書込を日次D1書込上限の10%以下に抑える(監視: guard自身の書込回数をカウントし超過で警告)。

## 基盤選択は設定(ADR-016)
- 本体(core/db/gate/auth)は基盤非依存。基盤は部品ごと(db: sqlite|d1、storage: fs|s3|r2 等、ADR-024)に設定で選び、composition root のみが adapter を生成して注入する。CF固有の無料枠・予算は cloudflare provider 側に閉じる。
- 基盤の選択は設定ファイル(第一候補 wpn.config.yaml。形式の最終確定は実装時にユーザー確認、ADR-024)。シークレットは書かず環境変数/Docker secretsで上書き(${ENV}参照)。起動時に検証し、不明provider・必須欠落は起動拒否(fail-closed)。例: `db: {provider: sqlite, path: ./data/wp.db}` / `storage: {provider: fs, path: ./data/uploads}` / `budget: {provider: none}`

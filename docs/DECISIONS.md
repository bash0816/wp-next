# ADR
- ADR-001 (2026-10-25) ライセンス GPL-3.0-only。GPLv2-onlyプラグインは取り込まない
- ADR-002 (2026-10-25) ハイブリッド方式(SDK主、php-wasm補助)。ユーザー回答の「WASM」と「SDK先行」を統合
- ADR-003 (2026-10-25) repoはpublic wp-next + private wp-next-private
- ADR-004 (2026-10-25) 移植対象プラグインは「移しやすいもの」から着手(ユーザー指示)。難物(WooCommerce等・独自テーブル多用・PHP拡張依存)は後回し/対象外
- ADR-005 (2026-10-25) STEP2レビューNo-Go(Blocker3)。設計v2として docs/04-step2-review.md の対応方針を採用。Phase1を成立性スパイクに変更
- ADR-006 (2026-10-25) プラグイン信頼モデル: 監査済みコードのみ実行。Tier Cは別境界+権限制限RPC
- ADR-007 (2026-10-25) ユーザー承認: Cloudflareアカウントの使用可。範囲外(未承認): 有料プラン/従量課金を発生させる設定、S3(AWS)の利用、課金上限の決定。これらは着手前に個別確認
- ADR-008 (2026-10-25) 制約: **有料プラン禁止・基本無料枠内**。S3はアカウント無しのため「想定」(S3互換インターフェースのadapterのみ実装、テストはローカルMinIO/R2で。実AWS利用なし)。Cloudflareは無料枠(Workers/D1/R2/Pages)のみ。無料枠超過が見込まれる機能は設計で回避(静的化・キャッシュ・Pages Functions/ビルド時生成)か、スコープ外にする
- ADR-008 補足 (2026-10-25) 有料になる場合は**必ず事前相談**(ユーザー指示)。無料枠で足りない/有料が必要になった時点で作業を止めて確認する。勝手に有料プラン・従量課金へ移行しない
- ADR-009 (2026-10-26) STEP2 Go(GPT-6.1-sol, v3動的認可優先)。経緯: No-Go 4回→Opus助言で縮小(静的生成+ゲート混成を廃止)→Go。残Major2件は実装計画で解消(STEP3): パスワード解除Cookieの認可バージョン、R2の読取含む操作数ガード
- ADR-010 (2026-10-26) STEP3 Go(条件付き、GPT-6.1-sol)。条件は docs/06-implementation-plan.md §7。次: Phase1 S0着手。無料stagingの実行前に予算ガード成立が必須
- ADR-011 (2026-10-26) TypeScript は 6.0.3 に固定。TS 7 はネイティブバイナリ配布でTermux(android-arm64)向けが無く `tsc` が動かない(F7で実測)。他環境のCIで7へ上げる場合はTermux開発と両立させる方針を別途決める
- ADR-012 (2026-10-26) lintの`no-direct-post-status`許可に `packages/db/src/visiblePosts.ts` を追加(SQLのWHERE句に必須。canView.tsと対で変更する規則をファイル先頭コメントに明記)。教訓: 委任仕様の「null/''」のうち''をHaiku実装が落とした。仕様の境界値は委任テストに明示的に含めさせる
- ADR-013 (2026-10-26) 予算ガード実装(packages/storage)。R2ストレージ予算は期間キーでなく `total` 累積(保存量は月をまたぐため。Haiku実装の月次リセットは過少計上になるのを自己レビューで修正)。D1用BudgetStore(非同期・条件付きUPDATE)とD1/Workers日次予算の適用は未実装 → 無料staging(S5')前に必須。Haikuはこの委任で autocompact thrashing(5.5)により途中停止したが成果物は完成状態だった(再現: 大きめの委任)
- ADR-014 (2026-10-26) D1BudgetStore実装(D1Likeサブセットで実D1に未接続=並行性・2文の実挙動は実D1で未検証)。**既知リスク**: 予約1回ごとにUPDATEが1行書込 → D1無料枠の書込10万行/日を予算ガード自身が消費する。対策案(実装前にSTEP2/3相当で確認): ブロック予約(例100単位でD1から予約し、プロセス内で払い出す。未使用分は失効=安全側過大計上)。実D1接続前に仕様化する
- ADR-015 (2026-10-27) S2 ゲート実装(packages/gate、Web標準Request/Response、既定拒否、本文はエスケープ出力、動的応答はno-store/X-WPN-Class:private固定)。Haiku(5.5)は大きい委任でthrashing→「テスト作成」と「実装のみ(テスト丸読み禁止・出力tail)」に分割して成功。教訓: テスト+実装を1委任にせず、テストを読ませずに仕様を文章で渡す。既知の弱点: StaticAsset.bodyのBodyInit型キャスト(respond.ts)
- ADR-016 (2026-10-28) ユーザー指示: **Cloudflare専用にしない。最初からS3(S3互換)等の他基盤を考慮する**。方針: ①core/db/gate/auth は Web標準(Request/Response/Web Crypto)+ 注入可能な薄いIF(DB=SQL最小サブセット、ObjectStore、時計、乱数、BudgetStore)のみに依存し、D1/R2/Workers固有APIを直接importしない ②基盤固有コードは adapters/ 相当(現状 packages/storage の d1BudgetStore・r2Guarded はCloudflare用adapter。S3互換adapterは ObjectStore IFで別途、実AWS利用なし=ADR-008) ③無料枠定数・予算はadapterごとに持つ ④S4認証はユーザー決定で自前セッション(WPパスワード bcrypt/phpass検証+Cookieセッション+CSRF)、パスワード検証は差し替え可能な PasswordVerifier IF(CPUが厳しい基盤では別実行へ逃がせる)
- ADR-016 補足 (2026-10-28) ユーザー指示: **Cloudflareは「使ってよい選択肢の1つ」であり、設定で選ぶもの**。コード本体は基盤を知らない。基盤(DB/ObjectStore/BudgetStore/実行環境)は設定ファイル(例 wpn.config、provider名+値)で選択し、起動時のcomposition rootだけが adapter を生成して注入する。Cloudflare(D1/R2/Workers)・S3互換・ローカル(SQLite+ファイル)は同格のprovider。無料枠定数と予算ガードはprovider側に持つ(CF以外では不要/別定義)。docs/06にも反映する
- ADR-017 (2026-10-28, 訂正済) ユーザー指示: 目的はWordPressの移植とモダナイズ。**DBスキーマはWP同形を維持する(暫定ではなく方針。正規化しない)**。基盤(DB/Storage/実行環境)のみ設定で差し替え可能にする(ADR-016)。当初記載の「内部を型付きモデルへ正規化」はClaudeの誤解でありユーザー指示で撤回。以下はClaudeの推測でユーザー未確認: ①レガシーhash(phpass/WP bcrypt)のログイン時再ハッシュ ②互換SDK/php-wasmは橋渡しで最終形ではない。確認が取れるまで実装方針として確定しない
- ADR-018 (2026-10-28) ユーザー指示: **E2Eで「WordPressと同じもの」になることを目指す**(出力・挙動の同一性が合格基準)。方針: ①受入基準を、同一データに対する実WPの応答(HTML構造・REST JSON・feed・sitemap・認可結果)との差分比較(golden/E2E)で定義する ②差異は「意図した差異(セキュリティ等)」として一覧化し理由を残す ③ゲートの現行出力(簡易HTML・最小REST)は暫定で、テーマ描画・REST全項目・ブロック/ショートコード展開は同一性E2Eの対象に拡大する ④比較の基準WPの用意方法(実サイトのスナップショット or php-wasm上のWP)は外部サービス/新規手段の導入に当たりうるため、決定前にユーザーへ確認する
- ADR-019 (2026-10-28) ユーザー指示: ADR-018 ④の基準WPは**OCIのサーバーにDockerでWordPressを立てて用意**し、それとの比較で検証する(S-E2E)。既存OCIインスタンス(Always Free)を使用。WPは公開せずlocalhost束縛+SSHトンネルで利用し、検証用データは架空のものにする
- ADR-019 実施記録 (2026-10-28) 基準WPをOCIのDocker上に構築済み(wordpress:7.1.3-apache, PHP 8.3, SQLite Database Integration 3.1.1, メモリ上限350m, localhostのみ束縛, ホスト名/IP/鍵はprivate repoに記載)。/ /wp-json/ /feed/ REST が200。注意: 当該サーバーは「未使用」ではなく、Magi-System用GitHub Actionsランナー等が稼働中。adminパスワードは使い捨て(未保存)で必要時に再設定。利用はSSHトンネル経由
- ADR-020 (2026-10-28) ユーザー確認済みの目的の再定義: **Docker+SQLiteで動くWordPressのモダナイズ版を作り、既存WordPressの完全な入れ替えを目指す**。ライセンスGPL-3.0-only(ADR-001維持)。基盤は設定で選ぶ(ADR-016): 主系統=local(Docker+SQLite)、任意=Cloudflare/S3互換。受入はE2Eで実WPと同一(ADR-018、基準WPはADR-019)。DBはWP同形(ADR-017)。ライセンス注意: WP本体はGPLv2-or-laterのためv3-only化は可。GPLv2-onlyのプラグイン/テーマは取り込めない(ADR-001)
- ADR-021 (2026-10-28) 設計v4(docs/07)をGPT-6.1-solがSTEP2レビュー: No-Go(Blocker2: 互換範囲/成立性スパイクの前倒し、同一性E2Eの入力・判定契約。Major3: WP同形DBの対応表、共通サービス/書込経路、v2§14と運用の継承)。スパイクはGo。未決4点の推奨: テーマ=ブロックテーマ解釈(B)を第一候補、管理画面=機能同等、ランタイム=Node固定、React=管理UIのみ・公開描画のNext.js採用は保留。
- ADR-022 (2026-10-28) 先行事例調査: ブロックテーマをPHPなしで描画する既存実装・WP REST互換サーバーは未発見(存在しない証明ではない)。@wordpress/block-serialization-default-parser 6.0.0(GPL-2.0以降)はパースのみ。php-wasm/Playground 3.1.61は活発(GPL-2.0以降)。SQLite Database Integration 3.1.1は機能プラグイン位置づけ・同時書込1ライター・公式Dockerイメージなし。
- ADR-023 (2026-10-28) ユーザー指示: **Cloudflare Workersは選択肢の1つとして(設定で選ぶ。オプション扱いではない)実装**。主系統はNode(+Docker+SQLite)。Workers対応は adapter(D1/R2/Workers実行)として後段で実装し、本体はnode:sqlite等のNode固有APIをadapter境界の内側に閉じる。Workers無料枠のCPU 10ms等の制約はWorkers adapterの受入条件であり、主系統の設計制約にしない。S5'はオプション扱いに降格。
- ADR-024 (2026-10-28) ユーザー提案: 使う基盤(DB/ObjectStore/実行環境/予算ガード等)は**設定ファイルで選択**する。形式はYAML(wpn.config.yaml)を第一候補とする(コメント可・階層表現・Docker/composeと相性。iniは階層に弱い)。シークレットはファイルに書かず環境変数/Docker secretsで上書き(${ENV}参照)。設定はzod等で起動時に検証し、不明なproviderや必須欠落は起動を拒否(fail-closed)。composition rootのみが設定を読んでadapterを生成。例: db.provider: sqlite|d1 / storage.provider: fs|s3|r2 / runtime: node|workers。形式(YAML/TOML)の最終確定は実装時にユーザー確認。
- ADR-025 (2026-10-28) ユーザー決定: **テーマ方式はB(ブロックテーマをTSで解釈)で進める**。D(ブロックテーマはB、クラシックテーマはphp-wasm=Cで併用)は将来検討とし排除しない。B不成立時の撤退先はC/D(docs/08の撤退条件)。他の案: A(React再作成)、C(php-wasm描画)、E(取り込み時静的変換)は現時点で不採用。
- ADR-026 (2026-10-28) P0スパイク計画(docs/08)のSTEP2/STEP3レビュー(GPT-6.1-sol): 1回目No-Go(Blocker2/Major6/Minor1)→v2→2回目No-Go(Blocker1: DB入力にcomments/term系表が欠落)→v2.1→3回目 **STEP2=Go / STEP3=Go**(新規Blocker/Majorなし)。Goは計画の実施可否のみで、方式成立の確定はB〜Eの実測合格が条件。
- ADR-027 (2026-10-28) P0-C latest-posts: 保護(パスワード付き公開)投稿は基準WPに合わせ「Protected: 」付きで一覧に出す(返すのはid/slug/title/isProtectedのみ、本文・パスワードは返さない)。private/draft/future等は匿名に出さない。実装は packages/db/src/latestPosts.ts(post_status参照はdb側に閉じる)。canView/visibleWhereの規則は変更しない(一覧のタイトル露出のみの例外)。
- ADR-028 (2026-10-28) ユーザー採用: **互換性を4段階に分けて設計する**。L1データ互換(WP同形スキーマ・移行)/L2 API互換(REST・feed・外部連携)/L3機能互換(SEO・フォーム・キャッシュ等をTS/Reactで再実装)/L4プラグイン実行互換(既存PHPプラグインを原則無改修で利用=PHP互換ランタイム・ブリッジ)。完全互換を目標に掲げつつ、レベルごとに実現方法と受入を分ける。対応: L1=ADR-017(db-mapping)、L2=E1、L3=E2/E3(ブロック・テーマ)+E4(管理操作)、L4=php-wasm(ADR-002補助、ADR-025のD案)。**React化だけではPHPプラグインは動かない**ため、L4をどの層で実現するかが最大の設計課題。台帳(docs/coverage)の各項目に compat_level(L1〜L4) 列を持たせる。L4の方式(php-wasmブリッジ等)は未決: 成立性スパイクを別途計画しユーザー判断を仰ぐ。
- ADR-029 (2026-10-28) ロードマップ v2(docs/09)を GPT-6.1-sol が再レビュー: **Go**(v1は No-Go: Blocker3/Major4/Minor1 → §5 で解消)。残Minorは本文統合のみで反映済み。これは計画のGoであり実装・互換達成の認定ではない。次: ゲートID凍結(docs/coverage/gates)、台帳拡張(test_id等の列・粒度)、L4スパイク計画(docs/10)、db-mapping。
- 注記 (2026-10-28) db-mapping: 基準dump.sqlにはCREATE INDEXが無く、基準側の索引は主キーのみ。WP本来の索引(wp_get_db_schemaの KEY 定義)との突合はL1ゲートで別途必要。日時形式(空白区切り vs ISO8601)、options.autoload 値(on/auto/off vs yes)、post_status inherit、PHPシリアライズ値の扱いは未解決の論点(docs/db-mapping.md §4)。
- ADR-030 (2026-10-28) v0.1ゲート凍結案: docs/coverage/gates/v0.1.txt(88 ID: ブロック42=TT25の7テンプレ+2パーツ+参照パターン10を再帰展開して実使用、テンプレ階層14、RESTコレクション12+個別GET20)。**発見**: TT25のsingle等はcomments・navigation・query・post-*系を使うため、v0.1に「コメント表示」「ナビ」「クエリループ」が必須で、現状done=2/42(heading, paragraph)。v0.1は大きい。範囲縮小(コメント除外=wontfixにはユーザー承認が必要)か、v0.1を分割(v0.1a=ページ/投稿本文+ヘッダ/フッタ、v0.1b=コメント・クエリ)するかをユーザー判断に仰ぐ。STEP2レビュー前の凍結案。
- ADR-031 (2026-10-28) ユーザー決定: v0.1は分割せず1つで進める(ゲート88ID・コメントも対象)。止まらず進める運用: 判断が要る点は推奨案で進め、後で報告する。
- ADR-032 (2026-10-28) 段階D D-1(header) STEP2設計レビュー: 1回目No-Go(Major4/Minor1)→設計契約v3(信頼境界2系統・layout6要素・登録表+再帰dispatch・DB境界)→2回目 **Go**(GPT-6.1-sol)。STEP3(テスト計画)は1回目No-Go(Major5/Minor1)でv3に反映済み、再レビュー中。layoutClass.tsは手順違反(STEP2/3前にSTEP4-5委任)の是正として未コミット保留。
- ADR-033 (2026-10-28) 基準WP実測(fixtures/ref/set-header2): ①匿名のpage-listナビにはパスワード保護のpublishページが出る(接頭辞なし)、draftは出ない、並びはmenu_order→title ②navigationブロックのref無しは最新のpublishなwp_navigationを使い、より新しいdraftは無視。③サイトタイトルにホームでのみaria-current="page"。ナビの一覧タイトル露出はADR-027と同種の例外。
- ADR-034 (2026-10-28) D-1 header: **STEP2=Go(2回目)、STEP3=Go(4回目)**(GPT-6.1-sol)。計画=docs/spike-notes/stage-d-plan.md §7。これでSTEP4(テスト作成)へ進む。layoutClass.ts(先行作成分)はGo後に検証してコミット。
- ADR-035 (2026-10-28) D-1b-1 layout入力: 設計訂正3点(基準WP実測): ①used_layout=attrs.layout ?? ブロック型の supports.layout.default(fixtures/ref/block-supports/layout-defaults.json)、テーマ settings.layout は使わない ②グローバルスタイル由来 fallback_gap の var:preset|t|s は var(--wp--preset--t--s) に解決(属性由来 gap は raw) ③layout CSS が空のブロックはコンテナクラスなし(クラス列は部分列で比較)。appearanceTools:true は spacing.blockGap に展開。22件・mutation 4種検出。docs/spike-notes/container-class-hash.md の注記更新は別途。

## ADR-036: D-1b-2 登録表+再帰dispatchとgroupブロック(2026-10-29)
- `blockRegistry.ts`(BlockRegistry/renderTree。未登録ブロックは全階層で拒否)と `groupBlock.ts` を導入。header 領域の group 3階層が基準 `regions/header.html` と正規化DOM一致(site-title/navigation はスタブ置換)。
- コンテナクラスは flex は常に、constrained は contentSize/wideSize 指定時のみ付与(WP の layout CSS 非空条件の近似)。**未検証の近似**: constrained で他要素(blockGap 等)のみの場合は D-1 の基準にないため未確認。
- 検証: 全体622件 Green、型/lint OK、mutation 5種(global-padding除去、container除去、ハッシュ入力誤り、tagName許可、CSS値許可)すべて検出。

## ADR-037: D-1c site-title(2026-10-29)
- `siteTitleBlock.ts` 追加。基準 `regions/header.html`(aria-current なし)と `set-header2`(ホーム、aria-current="page")の site-title と一致。`RenderCtx` に `site`/`page` を optional で追加(未設定なら site-title は RangeError で拒否)。
- 検証: 全体651件 Green、型/lint OK、mutation(aria値、target許可、scheme許可、text の `<`/`&` エスケープ)検出。`&` エスケープのテストが無かったため追加(DOM比較では `&` と `&amp;` は区別できないので、実体参照風の名前で検査)。

## ADR-038: D-1d-1 DBのナビ解決(2026-10-31)
- `packages/db/src/navigation.ts`: `selectLatestNavigationPost`(最新publishのwp_navigation、より新しいdraftは無視)、`selectPublishedPagesForNav`(publish固定ページ、保護ページ含む=ADR-033、DTOは{id,title,slug,parent,menuOrder}のみ)。schema.sql に `menu_order` 列を追加(db-mapping の missing 列の一部)。lint 許可リストに navigation.ts を限定追加。
- 検証: 全体663件 Green、型/lint OK、mutation(status許可、最新規則、menu_order並び、post_type許可、DTOへの余計な列の流出)検出。
- 未対応: ダンプ取り込み側の menu_order 対応は D-1e 以降(L1 ゲートで扱う)。

## ADR-039: D-1d-2 navigation / page-list / navigation-link(2026-10-31)
- `navigationBlock.ts`: 基準3組(regions/header.html、set-header2 の保護ページ・NavB)の `<nav>` と正規化DOM一致。DB結果は呼び出し側が事前取得して `ctx.navigation` に渡す(render に SQL/status 判定を置かない)。modal ID は `renderState.modalCounter` でページ共有。
- 設計訂正: Haiku 実装は子ブロックを専用ローカル registry で描画していた(§7.1-3 の単一 registry に反する)。渡された `renderChildren` を使う形に修正し、テストも実 registry 経由にした。nav 要素の class と data-wp-interactive の間の空白欠落も修正。
- 制限: 階層ページ(parent≠0)、ref 指定、wp_navigation 候補ゼロは診断付き拒否。navigation-link の属性形(`{"label","url","kind"}`)と NavB の post_content は**想定入力**(基準 WP の実 content は未記録)。プロトコル相対URL(`//host`)は拒否。
- 検証: 全体681件 Green、型/lint OK、mutation(modal採番、post null、data-wp-context エスケープ、ハッシュ入力、parent、プロトコル相対、scheme)検出。Haiku の1回目実装は autocompact thrashing で失敗、範囲を絞った再試行で成功。

# Stage D 計画: spike-blocks.html の領域分解

対象: `fixtures/ref/spike-blocks.html` (ID5 の単一投稿, 75047 B) の `<body>`。
抽出: `tools/coverage/extract-regions.mjs` (parse5 の sourceCodeLocation で原バイトをスライス)。
出力: `fixtures/ref/regions/*.html` (10 ファイル, バイト数は UTF-8)。

## 1. 領域一覧とバイト数

| ファイル | 内容 | UTF-8 B |
|---|---|---|
| skip-link.html | `a.skip-link` | 107 |
| header.html | `header.wp-block-template-part` | 3341 |
| main-01.html | `main` の子1 (alignfull group: 投稿本体・前後ナビ・コメント) | 5494 |
| main-02.html | `main` の子2 (alignwide group: query 一覧) | 3129 |
| footer.html | `footer.wp-block-template-part` | 3837 |
| script-01.html | speculationrules (JSON) | 427 |
| script-02.html | navigation view module (`src`) | 299 |
| script-03.html | comment-reply.js (`src`) | 164 |
| script-04.html | wp-emoji-settings (JSON) | 311 |
| script-05.html | emoji インライン JS | 3084 |

注: 先の outline 表示は UTF-16 文字数 (例: main-01 は 5376) で、本表は UTF-8 バイト。`main` の直接の子は 2 つのみのため main-01/02 は粗い。内部の細分は §4 に記す。

## 2. ブロック対応 (gate: docs/coverage/gates/v0.1.txt の blocks.csv 42 件)

クラス名 (`wp-block-*`) からの推定。ブロック名は class の接頭辞から導出しており、正規の block 名は未検証。

| 領域 | 推定ブロック (gate 該当) | gate 非該当 | gate 件数 | packages/render 対応 (renderBlocks.ts 59-64 / renderContent.ts) |
|---|---|---|---|---|
| skip-link | (なし) | - | 0 | - |
| header | group, site-title, navigation | template-part, page-list (pages-list 項目) | 3 | group/site-title/navigation/page-list は非対応 |
| main-02 | group, heading, query, post-template, post-title, post-date | post (項目) | 6 | heading のみ対応。他は非対応 |
| footer | group, columns, column, site-title, spacer, navigation, navigation-link, paragraph | template-part | 8 | paragraph のみ対応。他は非対応 |
| main-01 | group, post-title, post-terms, post-content, post-navigation-link, comments, post-comments-form, heading, paragraph | latest-posts, list, quote, separator, button, comments-query-loop | 9 | heading, paragraph, list, quote, separator は対応。latest-posts は renderContent で DB 組立て対応。他は非対応 |

補足:
- 対応リスト `SUPPORTED_BLOCKS` は heading, paragraph, list, list-item, quote, separator の 6 件 (renderBlocks.ts 58-65)。
- `core/latest-posts` は gate に含まれない。renderContent.ts が DB から組み立てる (LATEST_POSTS_BLOCK)。
- gate 42 件のうち、本フィクスチャに現れる comment-author-name / comment-content / comment-date 等の個別ブロックは、クラス名からは確認できなかった (未検証)。

## 3. 依存の少ない順 (Stage D の着手順候補)

基準: gate 該当ブロック数の少ない順 (同数なら DB 依存の少ない順)。
- skip-link (0 件, DB 依存なし, 静的テーマ文字列のみ)
- header (3 件; site-title, pages 一覧 = DB 依存 2 種、ID は PHP 生成)
- main-02 (6 件; query 一覧 = posts テーブル, 日付, 投稿 ID)
- footer (8 件; site-title + メニュー 8 項目 = DB, テーマ文字列 "Designed with" 等)
- main-01 (9 件; 投稿本体, カテゴリ, 前後投稿, コメント = DB 依存が最大)

Top-3 (ブロック数基準): skip-link, header, main-02。
注: DB 依存数で並べ替えると footer の位置は変わり得る (未確定の判断基準)。script-01〜05 は本文ブロックではないため順位付けの対象外。

## 4. main-01 / main-02 の内部細分 (ファイル化せず記述のみ)

- main-01 内:
  - 投稿タイトル (`h1`, wp-block-post-title, DB)
  - カテゴリ表示 (wp-block-post-terms, テーマ文字列 "Written by" "in" + DB のカテゴリ, リンク URL)
  - 本文 (wp-block-post-content: heading h2, paragraph, link, list, quote, separator, latest-posts)
  - 前後ナビ (wp-block-post-navigation-link x2, DB の前後投稿, 矢印はテーマ文字列)
  - コメント (wp-block-comments: フォーム id respond/commentform 等, hidden の comment_post_ID=5)
- main-02 内:
  - 見出し "More posts" (heading)
  - query (post-template の 3 件, 各 title/date/URL は DB)

## 5. 値の分類 (難易度見積り)

凡例: DB = DB 由来 / TH = テーマ由来 (patterns/*.php 等の文字列) / PHP = PHP 生成 (hash, wp_unique_id 等)

| 領域 | DB | TH | PHP | 難易度 (見積り) |
|---|---|---|---|---|
| skip-link | - | "Skip to content" | - | 低 |
| header | site 名 "wpref", 固定ページ "Sample Page" と URL `http://127.0.0.1:8080/sample-page/`, メニュー ARIA ラベル "Menu" | - | `modal-1`, `modal-1-content` (wp_unique_id), container hash `ec1e7a1e`, `fbffc046`, `6e943505`, インライン SVG 2 個, data-wp-* (Interactivity API) | 中 |
| main-02 | 投稿タイトル 3 件, URL 3 件, 日付 `2026-10-27T23:38:31+00:00` 等 (datetime 3 件), 日付表示 "October 27, 2026" | "More posts" (見出し) | container hash 類 (未列挙) | 中 |
| footer | site 名 "wpref", メニュー 8 項目 (Blog, About, FAQs, Authors, Events, Shop, Patterns, Themes) と URL (`http://127.0.0.1:8080`, `#`, `https://wordpress.org`), 段落の text 一部 | "Designed with", "WordPress", "Twenty Twenty-Five" | style の spacing 変数 (テーマ CSS 変数) | 中〜高 (メニュー DB 依存) |
| main-01 | 投稿タイトル "スパイク用ページ", カテゴリ "Uncategorized" と URL, 前後投稿 "Hello world!" / "入れ子 & <特殊> “文字”" とその URL, latest-posts の 3 件 (URL 含む), 本文中の link `https://example.invalid/`, `comment_post_ID=5` | "Written by", "in", 矢印 ←/→, "Leave a Reply" 等の文言, "Your email address will not be published." | `respond`, `reply-title`, `commentform`, `email-notes`, `wp-comment-cookies-consent`, action `http://127.0.0.1:8080/wp-comments-post.php`, 上記 hash 類 | 高 |
| script-01..05 | - | - | `ver=7.1.3`, `ver=1bf28ded04f9f188bdcb`, emoji の baseUrl (`https://s.w.org/...` 17.0.2), `wp-emoji-release.min.js` 等 | 対象外 (WP コア出力) |

補足:
- 投稿者名 (author name) は本フィクスチャのクラス走査では確認できなかった (未検証)。
- URL は全て `http://127.0.0.1:8080` 系 (サイト基底) か、外部 `https://wordpress.org` `https://example.invalid/` `https://s.w.org/`。
- `data-wp-*` 属性は header の navigation に集中 (`data-wp-interactive="core/navigation"`, `data-wp-context` の JSON, `data-wp-on--click`, `data-wp-class--is-menu-open` 等)。

## 5.1 領域分解の検証

- IP 検査: `command grep -nE "[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+" fixtures/ref/regions/*.html` の結果は全て `127.0.0.1` (計 20 件)。127.0.0.1 以外の IP なし。
- 抽出スクリプトの再実行結果は §7 の報告を参照 (本文書作成時点で未再実行の場合は未検証)。

## 5.2 領域分解の未検証 / 次の作業

- 未検証: gate 42 件と各ブロック名の完全一致 (クラス名からの推定のみ)。
- 未検証: `packages/render` 側で wrapper ブロック (group, query 等) が未対応のまま渡った場合の挙動。テストは未作成。
- 次の作業 (Stage D): 領域単位の失敗テスト (Red) を先に書き、skip-link → header → main-02 の順で対応する。

## 7. D-1 設計契約 (STEP2 No-Go[Major4/Minor1] 対応) と テスト計画 v3
目的: `fixtures/ref/regions/header.html` と、テーマ(parts/header.html → patterns/header.php)+DB から TS で生成した HTML が正規化DOM一致する。範囲外: 一般PHP解釈、CSS全体、ナビの実ブラウザ動作(JS)。
共通契約(docs/08 継承): 比較器は parse5 の正規化DOM(コメント/要素間空白/属性順/siteurl/nonce/ver のみ無視。class/href/子要素順/本文は消さない)。生成側の入力は**テーマとDBダンプのみ**(期待値をコードに埋めない)。比較器負例: header の属性欠落・子要素の欠落・二重化を検出すること。**過適合防止のため2組の入力**: (i)基準そのもの (ii)site名・ページ名・slug・並び・階層を変えたDB(期待値は実WPで再取得して fixtures/ref/set-header2/ に保存。再取得は私がレビュー後に実施)。
匿名Actor固定。DBアクセスは packages/db の関数経由でSQLにて可視性を適用(JSフィルタでの除外は不合格)。

単位(各 Red→Green):
- D-1a テーマ解決: parts/*.html、`wp:pattern {"slug"}`→patterns/*.php。PHPヘッダ(`<?php ... ?>` コメントのみ)除去は許可、**実行式(esc_html_e 等)は独立した小fixtureで TS 代替を検証**(header.php には出力式が無い)。未対応PHP式は診断付き拒否(黙って消さない)。循環: 自己循環・相互循環を拒否、同じpatternの兄弟参照(非循環)は成功。未知ブロックは group/pattern の内側でも拒否。不正属性(JSONパース不能、型違い)は拒否。
- D-1b-1 layout入力生成: attrs・theme.json(settings/styles)・block support から wp_json_encode 入力の6要素(used_layout, has_block_gap_support, gap_value, should_skip_gap_serialization, fallback_gap_value, block_spacing。名前・型・導出規則は docs/spike-notes/container-class-hash.md §ハッシュ入力に統一)を組み立てる関数。検査: global styles と settings の区別、キー順、null、「生成される layout CSS が空ならクラスを付けない」(attrs.style の有無とは区別)、group 2個(ec1e7a1e, fbffc046)と navigation(6e943505)の3値を**独立した期待値**(基準HTML)から検査。固定値の埋め込みはレビューで検出。
- D-1b-2 group の HTML: layout type default/constrained/flex の class、spacing preset→style、align*、container class(layoutClass.ts を使用)。
- D-1c site-title: level 0、DB blogname、href=siteurl、エスケープ(`<>&"'` を含む名前、属性脱出、javascript: URL は含まれない)。
- D-1d-1 DB: ナビ解決 = navigation ブロックに ref が無い場合、WP同様に**最新の publish な wp_navigation 投稿**(基準では ID4、content=`<!-- wp:page-list /-->`)を解決。無ければ範囲外=診断付き拒否。page-list: publish の固定ページのみ、匿名で draft/private/future は出ない・パスワード保護の publish ページは**出る**(実測、§7.1-4 と fixtures/ref/set-header2、ADR-033)。DTO に本文・password を含めない。混在 fixture で検査。
- D-1d-2 navigation HTML: 固定マークアップ(SVG、data-wp-*)、`data-wp-context` の JSON を HTML 属性境界で正しくエスケープ、`modal-N` は描画コンテキスト単位の連番(同一描画内の重複なし、次の描画でリセット)。
- D-1e header 合成: `<header class="wp-block-template-part">` ラッパ。全体を上記2組で正規化DOM一致。
負例/安全まとめ: 未対応PHP式、循環、未知ブロック、不正属性、特殊文字・属性脱出・javascript:URL・data-wp-context の注入、非公開ページ露出。

注: layoutClass.ts(ハッシュ関数)は先行して作成済みだが、STEP2/3 の Go まで未コミットで保留(手順違反の是正)。

### 7.1 設計契約 (v3)
1. **出力の信頼境界(サニタイズ)**: 出力を2系統に分ける。(a)投稿由来HTML(post_content 内の静的ブロック等)は既存 `sanitizeHtml`(許可リスト)を必ず通す。(b)検証済みレンダラが生成する構造(header/nav/button/svg/style/ARIA/data-wp-*)は**サニタイザを通さず、レンダラ内で文脈別に構築**する: 文字列はテキストescape、URLは scheme 検証(http/https/相対のみ)→属性escape、`data-wp-context` は JSON 化→属性escape、CSS値は許可した形式(プリセット変数/長さ)のみ生成。許可リストの一括拡張はしない(投稿由来HTMLに対話属性を許さない)。合格条件は**実際の公開出力経路**での DOM 比較と注入負例。
2. **layout 入力(調査メモと一致)**: 上記の6要素に名前・型を統一。layoutClass.ts はハッシュ化の部品に過ぎず、入力導出(D-1b-1)は別途検証。
3. **登録表+共通再帰 dispatch**: `BlockRegistry: blockName → { validateAttrs(attrs), render(block, ctx) }`。再帰 dispatch は最上位でも group 内でも DB 本文内(wp_navigation の page-list 等)でも同じ規則(未知ブロックは全階層で拒否)。`ctx` = { theme, services(取得サービス), renderState(採番) }。`modal-N` の採番は**ページ全体で共有**(header と footer 間でも重複なし)。現行 `renderContent.ts` の最上位限定の動的判定は、この dispatch に置き換える(既存14件の latest-posts テスト・renderBlocks テストは回帰として維持)。
4. **DB 境界**: `packages/db` が公開ナビ・固定ページを SQL で選別し必要な DTO だけ返す(例 `selectPublishedPagesForNav`, `selectLatestNavigationPost`)。ナビ解決の規則(実測): navigation ブロックに ref が無い場合、**最新の publish な wp_navigation** を使う(draft は新しくても無視: fixtures の NavB/NavDraft)。『最新』= post_date_gmt 降順→ID 降順。候補ゼロは WP が自動生成(DB 書込)するため、D-1 では**診断付き拒否**。ref 指定ありは D-1 範囲外=拒否。テスト: 複数 publish+より新しい draft で選択される ID と描画内容を検査(基準 ID4 固定では検出不能なので、NavB を含む DB を fixture 化)。render に status 判定・SQL は置かない。`post_status` を参照する新規 db ファイルは lint 許可リストに限定追加。**前提**: 現行 schema.sql に `menu_order` と `post_parent` 階層列が無い → db-mapping(docs/db-mapping.md の missing 列)に従い、必要列のみ追加(post_parent は既存、menu_order を追加)し、ダンプ取り込みの対応を D-1d-1 の前提テストに含める。**保護ページ(実測で確定、fixtures/ref/set-header2)**: 匿名の page-list ナビには**パスワード保護の publish ページが出る**(タイトルは素のまま、'Protected:' 接頭辞なし)。draft/private/future は出ない。並びは menu_order→title。SQL 条件は post_type='page' AND post_status='publish'(パスワード列は条件にしない)。DTO は {id, title, slug, parent, menuOrder} のみ(本文・パスワードは返さない)。漏洩テスト: draft/private/future のタイトル・URL が出力に現れないこと、保護ページは**ナビにのみ**出て本文は返さないこと。ADR-027 と同様の『一覧タイトル露出のみ』の例外として ADR に記録する。
5. **対象範囲の明記**: D-1(header 領域一致)は v0.1 ゲート 88ID のうち group / site-title / navigation / page-list 等の**一部**のみの達成であり、header 一致だけで該当ブロック全体や 88ID の達成と扱わない。ゲート ID との対応は各単位完了時に台帳 status と test_id を更新する。
6. **節整理**: D-1 のテスト計画は本節(§7)が唯一の現行契約(旧 v1/v2 の §6 は削除済み。§5.1/5.2 は領域分解の記録)。§1〜5 のブロック名は class 接頭辞からの推定であり、正規名は台帳(blocks.csv)の name で確定する。

### 7.2 テスト配置・実行・想定 Red (STEP3 Minor 対応)
- 配置: packages/db/src/navigation.test.ts(D-1d-1)、packages/render/src/{templateResolve,layoutInput,groupBlock,siteTitle,navigationBlock,headerCompose}.test.ts。fixtures は fixtures/ref/{regions,set-header2,themes}。
- 実行: `pnpm vitest run <file>` を1ファイルずつ。Red の分類: (1)機能不足=モジュール未存在 or 期待と異なる出力、(2)環境不備=fixture 未取得・import 失敗(これは Red と認めず、fixture 不足として報告)。各単位の想定 Red 理由を報告に含める。
- 入力経路の分離: golden(期待値)は fixtures/ref のファイルのみ。生成側の入力はテーマ+DBダンプのみ。両者を同じ変数経由にしない。
- 比較コンテキスト: ホーム由来の set-header2 と single 由来の regions/header.html では site-title の aria-current が異なる → 描画コンテキスト(isHome/isSingular)を ctx に持つ。

### 7.3 進捗(2026-10-31)
- 完了: D-1a(テーマ解決)、D-1b-1(layout入力)、D-1b-2(登録表+group、ADR-036)、D-1c(site-title、ADR-037)、D-1d-1(DBナビ解決、ADR-038)。
- 完了(追記): D-1d-2(navigation、ADR-039)、D-1e(header合成、ADR-040)。**D-1 完了**。次: D-2 footer、D-3 main-01/main-02。
- 完了(追記): D-2a(site-logo / site-tagline / spacer。`footerLeaf.test.ts` 35 件、package 内全体 Green、typecheck・lint OK、mutation 検証済み。STEP6 で補強テスト D2a-21〜23 を追加)。ctx.site に tagline?/logoId? を optional 追加。createDefaultRegistry への登録は D-2e。次: D-2b columns/column。
- 完了(追記): D-2b(columns/column。`columnsBlock.test.ts` 18 件、packages/render 276 件 Green、typecheck・lint OK、mutation 検証済み)。STEP6 でテスト欠陥 2 件を修正(D2b-08: ブロック別 gap が優先されるため blockGapByBlock を変更、D2b-10: 別解析ノードの参照比較)。D2b-14 でハッシュを md5 で独立検算(基準 794e3cfa を再現: `[{"type":"flex","flexWrap":"nowrap"},true,null,false,"var(--wp--preset--spacing--50)",null]`)。次: D-2c paragraph。
- 完了(追記): D-2c(テーマ由来 paragraph。`paragraphBlock.test.ts` 20 件、packages/render 296 件 Green、typecheck・lint OK、mutation 検証済み。STEP6 で外殻 p 検査の補強 D2c-10 を追加。残る生存 1 件は parse5 検査が同入力を拒否する等価変更)。次: D-2d navigation 非 responsive 経路。
- 完了(追記): D-2d(navigation 非 responsive 経路。`navigationBlock.test.ts` 50 件(既存 18 + D2d 32)、packages/render 328 件 Green、typecheck・lint OK、mutation 検証済み)。STEP4 は Haiku が thrashing で報告前に落ちたため、私が残ったテストを検査し欠陥を修正(D2d-07a/b/c が url `#` の拒否で誤って通る問題を絶対 URL に変更、D2d-05c/06a の期待を『非空の名前は 1 つ目から aria-label が付く、空名のみ 1 つ目は属性なし』へ修正)。STEP6 の mutation 生存 4 件(responsive+innerBlocks 拒否、never での flexWrap/overlayBackgroundColor 拒否、ariaLabel 型検査)を D2d-11〜13 で補強。`renderState.navNameCounts`(Map)を header の responsive nav も消費する。**未照合**: 非空 ariaLabel の 1 つ目に属性が付く規則と esc_attr の扱いは WP ソース未照合(footer の空名のみ実測)。overlayMenu never での justifyContent/flexWrap/overlay 色は未実測のため fail-closed。次: D-2e renderFooter と全体比較。
- 完了(追記): D-2e(`renderFooter`、`createDefaultRegistry` を 11 キーへ更新。`footerCompose.test.ts` 14 件 + headerCompose.test の登録キーテスト更新、packages/render 342 件 Green、typecheck・lint OK、mutation 9 件すべて検出)。全体比較 2 組(regions/footer.html、set-footer2)が一致。**D-2 完了**(ADR-042)。次: D-3 main-01/main-02。
- 完了(追記): D-3z1(group の tagName/ariaLabel/border/verticalAlignment、normalizeDom の style 属性正規化。groupBlock.test +D3z1 系、normalizeDom.test +、packages/render 408 件 Green、typecheck・lint OK、mutation 生存 3 件〔border 1辺の未知キー・型、空白のみ宣言〕をテスト補強で殺した)。基準 HTML の `style` 末尾 `;`(静的パターン由来)は comparator 側で正規化(宣言順・値は区別)。次: D-3z2 template-part 解決。
- 完了(追記): D-3z2/D-3z3(templateResolve に `parseTemplate` と `unknown-template` を追加。header/footer の役割を slug 名〔最初は `header`、最後は `footer` を含む〕で要求する設計追加。D-3z3 の `esc_attr_e` 展開は既存実装で成立していたため回帰ガードのみ〔JSON 内の `"`→`&quot;` を含む〕。templateResolve.test 78 件、packages/render 445 件 Green、typecheck・lint OK。mutation 生存は二重に守られた規則の等価変更〔個数/非自己閉じ/閉じコメント/main 内 template-part〕のみ、他はテスト補強で殺した)。z2 と z3 は小さいため STEP4〜7 を 1 サイクルにまとめた。次: D-3a。
- 完了(追記): D-3a1(`ports.ts` の型、`ThemeRegistry`/`PostRegistry`〔private `#brand` による名目型・凍結〕、`createThemeRegistry`〔`createDefaultRegistry` から改名、header/footer の入力側のみ更新、登録 11 キー不変〕・`createPostRegistry`〔空〕・`assertPostRegistry`、`renderTree` の `renderChildren` 契約〔全 innerBlocks を同一参照・同順で渡す、0 回呼びは `childrenOptional` のみ可、override は post/content のみ、`renderState` 共有〕。registryOrigin 4・childrenContract 29・ports 1 件を追加、packages/render 479 件 Green、typecheck・lint OK。mutation 生存は等価変更 1〔長さ超過は every が拒否〕のみ、`childrenOptional` 厳密性をテスト補強)。STEP4 の Haiku が thrashing で 1 回落ち、読む範囲を絞って 2 分割で再委任して成功。D-3a は D-3a1/D-3a2 に分割。次: D-3a2(heading・post-title・post-date)。
- 完了(追記): D-3a2(`headingBlock.ts`〔テーマ由来 heading。level/align/fontSize/style.typography、最外 hN の検査+sanitize〕、`postTitleDate.ts`〔post-title/post-date。保護投稿は `Protected: ` 接頭辞・日付なし、title の直引用符を曲げ、未実測の wptexturize 分岐〔`'`,`--`,`...`,`(c)(r)(tm)`,数字x数字,奇数個の `"`〕は拒否〕。headingBlock 43・postTitleDate 42 件、packages/render 564 件 Green、typecheck・lint OK。mutation 生存は下流で拒否される等価変更〔level の整数/範囲、最外 hN の二重検査〕のみ、他はテスト補強で殺した)。登録表への追加は後続単位で行う(既存の 11 キーテストを保つため)。**wptexturize の全面対応は未実装 → parity-exceptions に記録予定**。次: D-3b queryPosts と query/post-template。
- 完了(追記): D-3b1(db 側。`packages/db` に `postData.ts`〔`UnsupportedDataError`、`formatPostDate`、`readHome`、`postClassName`、`buildPostCtx`、`buildContentPort`〕、`currentPost.ts`〔`openCurrentPost`: 匿名で閲覧可・非保護・存在する post のみ、他は null〕、`queryPosts.ts`〔閉じた spec、publish〔保護を含む〕、`post_date_gmt` 降順→ID 降順、窓内の未対応データはクエリ全体を拒否〕を追加。port 型は `@wpn/core/ports` へ移動し render が再 export〔db → render の依存を作らない〕。テスト補助 `dumpDb.ts`/`mainStates.ts`〔S0〜S3 再現〕、lint 許可リストに currentPost/queryPosts/postData を追加。実測どおり保護項目は `post-password-required` を持ち contentOf を持たない。**STEP6 で実装不備を発見・修正**: 保護クラスの欠落、カテゴリ順が slug 順だった〔名前順へ〕、sticky の添字/値の取り違え、URL の encodeURIComponent 欠落。db 212 件・render 564 件 Green、typecheck・lint OK、mutation 生存は等価変更 1〔spec の必須キー欠落は値の検査が拒否〕のみ)。ContentPort の terms/adjacent/commentsState/hasThumbnail/author は後続単位まで UnsupportedDataError。次: D-3b2(render: query/post-template と more-posts パターン)。
- 完了(追記): D-3b2(render 側。`queryBlock.ts`〔`core/query`: 13 キーの閉じた spec を render 側でも独立に検証、`ctx.queries.queryPosts` の結果を `renderChildren(…, {query})` で子へ。結果 0 件は未実測のため RangeError。`core/post-template`: item ごとに `renderChildren(…, {post, content})`、li のクラスは再検証+エスケープ、コンテナ hash は layoutHashInput 経由で基準 `b4d04ffe` と一致〕。`createThemeRegistry` は 16 キー〔+heading, post-title, post-date, query, post-template〕。`renderChildren` の override 許可キーに `query` を追加〔§9.5-7 の追補。他の未許可キーは従来どおり RangeError〕。`@wpn/db/testing` を追加。more-posts パターン全体が main-02 と一致、S1(保護混在)・S2(同日時・分類)の query も set-main2 と一致。packages/render 629 件 Green、typecheck・lint OK、mutation 生存は等価変更 3〔必須キー欠落は値の検査が拒否、query 属性欠落は spec 検査が拒否、className エスケープは正規表現で到達不能〕のみ)。**D-3b 完了**。次: D-3c(terms/author/hasThumbnail と post-terms・post-author-name・post-featured-image・hidden-written-by)。
- 完了(追記): D-3c(db: `buildContentPort(db,row)` に `terms('category'|'post_tag')`〔term 名の昇順・大文字小文字無視〔MySQL の ci collation を仮定。実測は 2 件の異名のみ〕、親を持つ term・不正 slug は拒否、url は `/category/<slug>/`・`/tag/<slug>/`〕、`author()`〔post_author=0/不在ユーザーは null、`/author/<nicename>/`〕、`hasThumbnail()`。render: `termsAuthor.ts`〔post-terms: category 1 件のみ出力・タグは 0 件のみ空出力、post-author-name: isLink のみ、post-featured-image: 画像なしのみ空出力〕、group に `fontSize` と `style.spacing.blockGap`〔hash 入力のみ・style へは出さない〕、登録 19 キー。hidden-written-by パターンが S0/S3 で main-01 / author-real と一致。db 244・render 近 700 件 Green、typecheck・lint OK。mutation 生存は等価変更〔`authorId===0` は users 検索で null になる〕のみ、他はテスト補強で殺した。STEP5 の Haiku が author() を 1 回だけ呼ぶ WeakMap キャッシュを入れていたのは不自然な stateful スタブに合わせたテスト設計の副作用だったので、テストを冪等なスタブに直してキャッシュを削除)。次: D-3d0(renderContent のポート化)。
- 完了(追記): D-3d0(`renderContent` のポート化。`renderContent(postContent, {queries, siteUrl})` に変更し `node:sqlite`/`@wpn/db` への依存を除去〔依存境界を静的に検査するテスト D3d0-10〕。`createPostRegistry()` が 7 キー〔heading・paragraph・list・list-item・quote・separator・latest-posts〕を登録した凍結インスタンスを返し、投稿本文はこのレジストリだけで描画〔テーマ専用ブロックは入れ子の内側でも UnsupportedBlockError〕。freeform HTML は `PostRegistry.freeform` で従来どおり通し、最後に `sanitizeHtml(texturizeText())`。静的ブロックの子は `renderChildren` を 1 回だけ呼んで最初の null 位置に差し込む〔子の間の空白のみ従来と変わり得る〕。db 側に `makeQueriesPort(db)`〔`latestPosts` は {limit,order} を検証し {slug,title,isProtected} のみ返す〕と core の `LatestPost`/`LatestPostsSpec` 型。既存 `renderContent.test.ts` は期待 HTML・件数・テスト名を変えずに入力の与え方のみ移行、**唯一の変更**: 『静的ブロックのみの本文は renderBlocks と同じ』の比較を toBe → htmlEquals〔子の間の空白差のため〕。db 266・render 約 760 件 Green、typecheck・lint OK、mutation 生存は下流で拒否される等価変更のみ)。次: D-3d post-content。
- 完了(追記): D-3d(`postContent.ts`〔core/post-content: attrs は `{align:"full", layout:{type:"constrained"}}` の完全一致のみ、`contentOf` が無い保護項目・`ctx.post`/`content`/`site` 欠落は RangeError、本文は `renderPostBody`〔投稿用レジストリ+sanitize〕で描画し、子文脈には global/renderState/site/queries だけを渡す〕、`renderContent.ts` から `renderPostBody` を切り出し、登録 20 キー。main-01 の entry-content〔h2・段落・リスト・引用・区切り線・latest-posts 3 件〕と一致。本文内のテーマ専用ブロック〔入れ子 post-content・query・comments・group〕は UnsupportedBlockError、危険要素は除去。postContent 31 件、render 790 件 Green、typecheck・lint OK、mutation 生存は下流で拒否される等価変更 2〔layout 欠落は isPlainObject が拒否、innerBlocks 非空は renderChildren 契約が拒否〕のみ)。次: D-3e adjacent と post-navigation-link。
- 完了(追記): D-3e(db: `adjacent(dir)`〔publish の post のみ、保護投稿を含む〔タイトルは接頭辞なし〕、draft/private/future/page 等は除外、(post_date_gmt, ID) の辞書順、**同日時の別の公開投稿があれば UnsupportedDataError**、隣接なしは null、url は slug を encodeURIComponent〕。render: `postNavigation.ts`〔core/post-navigation-link: attrs は `{type:"previous",showTitle:true,arrow:"arrow"}` か type 省略の 2 形のみ、隣接なしは RangeError、タイトルは post-title と同じ規則〔`postTitleDate.ts` の `typographyTitle`/`safeHref`/エスケープを export〕〕、登録 21 キー。post-navigation パターン全体が S0 の main-01 と S1 の set-main2〔保護 next〕に一致。db 279・render 825 件 Green、typecheck・lint OK、mutation 生存は等価変更 1〔innerBlocks 非空は renderChildren 契約が拒否〕のみ。STEP4 で Haiku のテストに取り違え〔next のタイトルを previous で検査〕を発見し修正)。次: D-3f コメント領域。

## 8. D-2 footer 領域 設計契約 v3 とテスト計画 v3(2026-10-31、STEP2 v1 No-Go: Major5/Minor2、v2 No-Go: Major1/Minor2 を反映)

目的: `fixtures/ref/regions/footer.html`(single 由来)と `fixtures/ref/set-footer2/footer.name-tagline-special.html`(home 由来、特殊文字のサイト名+tagline)に、テーマ(parts/footer.html→patterns/footer.php)+ctx のみから生成した HTML が正規化DOM**全体一致**する。継承: §7.1 の信頼境界・登録表・DB境界・ゲート扱い(§7.1-5)。範囲外: site-logo の実画像、一般PHP、CSS、JS。

### 8.1 基準 WP の実測(ソース: wp-includes/blocks/navigation.php、site-logo.php、site-tagline.php、7.1.3)
1. **navigation の aria-label**: 名前 = `attrs.ariaLabel` → なければ `ref` 公開投稿の title → なければ空。**ページ内で名前ごとの出現回数を数え**(static。header も数える)、2回目以降は `"<名前> <回数>"`、空でなければ aria-label を出す。実測: header の ref 無し nav=名前空(1回目、属性なし)、footer の2つの nav は `" 2"` `" 3"`(先頭に空白)。→ `renderState.navNameCounts?: Map<string, number>`(任意キーの衝突を避け Map、**optional で未設定なら描画側が遅延初期化**=既存 ctx と互換)をページ共有で持つ。
   - **カウンタの前提(v2)**: 全体比較は毎回「新規 ctx → header → footer」の順で行う(基準の ` 2`/` 3` は header が 1 を消費するため)。footer 単独描画では最初の nav に aria-label が付かず次が ` 2` になる=異なる番号になることもテストで固定し、初期値を基準に合わせる実装を禁止する。
   - `ariaLabel` はレンダラ生成物として属性エスケープ(`"`、`<>&`、属性脱出を負例で検査)。
2. **overlayMenu:"never"**: responsive コンテナ(ボタン・modal・data-wp-*)を出さず、`<nav class="is-vertical wp-block-navigation is-layout-flex wp-container-core-navigation-is-layout-<hash> wp-block-navigation-is-layout-flex" aria-label="…"><ul class="wp-block-navigation__container is-vertical wp-block-navigation">…</ul></nav>`。header(responsive)と class 構成が異なる(is-responsive/items-justified/is-content-justification なし、orientation vertical で `is-vertical`)。modal 採番は消費しない。
3. **ref 無し+インライン子ブロック**: 子の navigation-link を描画(wp_navigation の解決は不要)。header の ref 無し+子なしとは別経路。
4. **site-logo**: カスタムロゴ未設定(theme_mod custom_logo=false)のとき出力は空。設定済みは D-2 範囲外=診断付き拒否。
5. **site-tagline**: blogdescription が空なら出力なし。非空なら `<p class="wp-block-site-tagline">`+テキストescape(実測 set-footer2。`level`/`textAlign` 属性は D-2 では未指定のみ対応、指定は拒否)。
6. **site-title の aria-current**: footer の site-title も home でのみ付く(set-footer2 実測)。
7. **paragraph(theme 由来)**: `<p class="has-small-font-size wp-block-paragraph">`(7.1 は `wp-block-paragraph` を付与)。内側 HTML は theme/PHP 展開結果=信頼できない入力として sanitizeHtml を通す。
8. **spacer**: `<div style="height:…[;width:…]" aria-hidden="true" class="wp-block-spacer"></div>`。**width は指定時のみ出力**(基準 footer の 2 つ目の spacer は height のみ、1 つ目は width:0px。省略と `0px` の両方を検査)。`height`/`width` は preset 変数か長さのみ許可。
9. **columns/column**: columns は `is-layout-flex wp-container-core-columns-is-layout-<hash> wp-block-columns-is-layout-flex`(ハッシュは layoutInput 実装済み 794e3cfa)、column は `is-layout-flow wp-block-column-is-layout-flow`、`width:"100%"` は `style="flex-basis:100%"`、`width:""` は style なし。
10. **navigation-link の URL(v2)**: テーマは `"url":"#"` を使う。許可は http(s) 絶対、`/` 始まり(`//`・`/\` は拒否)、**フラグメント `#`/`#[A-Za-z0-9_-]+`** のみ。危険 scheme・プロトコル相対の拒否は回帰で維持。
11. **PHP→属性境界(v2)**: テーマ navigation-link の `label` は PHP 展開(`esc_html_e`)後に JSON 属性となり、`&`/引用符/`<`/実体参照風を含むと WP が再エスケープする挙動は**未実測**。D-2 では展開後ラベルが `[\p{L}\p{N} ._-]` のみなら受理し、それ以外は fail-closed で拒否する(「未検証は拒否」。実測できたら緩和)。テストは受理側の幅だけでなく拒否を固定する。
12. group の blockGap は style 属性ではなくコンテナ CSS(ハッシュ入力に入る)。`verticalAlignment` は group の class に出ない(実測 footer.html)。

### 8.2 単位(各 STEP4→5→6→7、順に)
- ctx の省略規則(v3): `site.tagline?: string`、`site.logoId?: number | null`。**footer 描画で `tagline`/`logoId` が `undefined`(情報未取得)なら診断付き RangeError で拒否**(未取得を『未設定』と誤認しない)。`tagline === ''` は非表示、`logoId === null` は空出力、数値(設定済み)は拒否。header 描画はこれらを参照しないため既存 ctx のまま動く。D-2a のテストに『省略→拒否』『空/null→空出力』『設定済み→拒否』を含める。
- `ref` 指定(v3): D-2 でも navigation の `ref` 指定は未対応=拒否(§8.1-1 の ref タイトル規則は実測説明であり実装対象ではない)。拒否の回帰テストを D-2d に含める。
- 期待値の区別(v3): 『期待値は fixtures の HTML のみ』は**実測DOM比較**(ゲート根拠)に限る。テーマ入力を変えた過適合対策の手書き期待値は『ソース由来・未実測』の分岐回帰であり、ゲート根拠にしない。
- 共通(v2): 追加する ctx フィールド(`site.tagline`/`site.logoId`/`renderState.navNameCounts`)は**すべて optional**とし、既存の header 用 ctx・既存テストを変更せずに型検査・回帰が通ること。合格条件に「既存 header 合成・navigation・投稿由来 paragraph/sanitize の全テスト+`pnpm typecheck` が緑」を含める。
- D-2a: `site-logo`(未設定=空/設定済み=拒否)、`site-tagline`(空=空/非空=実測形/未対応属性=拒否)、`spacer`(height/width 検証)。ctx.site に `tagline?: string`、`logoId?: number | null` を追加(いずれも optional、省略規則は『ctx の省略規則(v3)』)。
- D-2b: `columns`/`column`。
- D-2c: `paragraph`(theme 由来、fontSize→`has-<slug>-font-size`、`wp-block-paragraph`、内側 HTML は sanitize)。既存 renderBlocks の paragraph(投稿由来)との重複を避け、共通部は再利用。
- D-2d: navigation の非 responsive 経路(overlayMenu never、インライン子、orientation vertical、aria-label カウンタ)。header の既存 18 件を回帰として維持。
- D-2e: `renderFooter`(createDefaultRegistry に追加)と全体比較 2 組。**既存 headerCompose.test の登録キー 5 個完全一致テストを新しい集合へ更新する(私が意図的に更新。更新理由を ADR に記録)**。

### 8.3 テスト計画
- 全単位共通: 実測DOM比較の期待値は fixtures の HTML のみ(コードに埋めない)。生成入力は theme+ctx。比較は htmlEquals。各 it に検出対象と想定 Red(機能不足=モジュール未存在/出力差。環境不備は Red と認めない)。
- D-2a: (1)基準 footer の該当部分と一致 (2)tagline 空→出力なし、非空(set-footer2)→一致、特殊文字(`<b>`、`&`)が要素にならない (3)logoId 設定→拒否、未知属性(level、textAlign)→拒否 (4)spacer: height/width に `;` `"` `<` `url(`、負値/単位なし→拒否、preset→`var(--wp--preset--spacing--N)`。
- D-2b: 基準の columns/column と一致、width ''/'100%'/'30%'/不正('abc'、'1;x')、コンテナクラスは layoutInput 経由(ハッシュ直書き禁止)、column 内の子が再帰 dispatch を通る(未知ブロックは column 内でも拒否)。
- D-2c: fontSize 未指定/small/不正スラッグ(`a b`、`"`)、内側 HTML に `<script>`・`onclick`・`javascript:` を含む入力が除去/拒否、基準 2 つの paragraph と一致(printf 展開済みの `<a href="https://wordpress.org" rel="nofollow">` を保持)。
- 過適合対策(v2、全単位): テーマ入力を変えた in-memory テーマ(ラベル・URL・件数・順序・column 幅・spacing を変更)でも描画でき、期待値は WP ソース規則から手書きしたものを使う。**これらは実測 fixture ではなく『ソース由来・未実測』と明記**し、ゲート上は実測 2 組のみを根拠とする。
- D-2d: ref 無し+インライン子の navigation は `ctx.navigation` を省略しても成功する(wp_navigation 投稿必須チェックが残っていないこと。header の ref 無し+子なしは従来どおり ctx.navigation 必須)。footer の 2 nav と一致(aria-label ` 2`/` 3`)、header+footer の同一 ctx で header は属性なし・footer は ` 2` ` 3`、ariaLabel 指定は優先、同名 2 つで `<名前> 2`、新 ctx でリセット、modal 採番を消費しない(header modal-1 のまま)、`ariaLabel` に引用符・`<>&`・`" onmouseover="x` を与えても属性が増えず値が保持される(合成 API 経由で DOM 検査)、`#`/`#a` は受理・`javascript:`/`//host` は拒否、ラベルに `&`/`"`/`<`/実体参照風(PHP 展開後)→拒否、カウンタ名に `__proto__`/`constructor`、footer 単独描画で番号が基準と異なる、orientation 不正→拒否、overlayMenu 未知値→拒否、inline 子の navigation-link は header 側と同じ URL 検証。
- D-2c 追加(v2): 投稿由来 paragraph(renderBlocks)のサニタイズ回帰(既存テスト)を維持。共通化部分は『theme 由来』『投稿由来』の入口を分け、投稿由来は必ず sanitizeHtml を通ることを検査。
- D-2e: regions/footer.html(isHome=false、tagline 空)と set-footer2(isHome=true、tagline/特殊文字名)の 2 組で全体一致。比較器負例(column 欠落、nav の aria-label 欠落、spacer 二重化)。header+footer を同一 ctx で描画しても modal-1 が重複しない。
- ゲート表記: footer 一致は group/columns/column/spacer/navigation/site-tagline/paragraph の部分達成(§7.1-5)。台帳は notes に partial を追記し done にしない。

### 8.4 テスト計画の追補 v4(STEP3 v3 No-Go: Major5/Minor2 を反映。§8.3 と併読、矛盾時は本節が優先)
**A. 採番の mutation 対策(D-2d/e)**
- 名前別カウンタ: 同一 ctx で navigation を `ariaLabel` = `A, B, A, (空), B` の順に描画し、aria-label を厳密に `A / B / A 2 / 属性なし / B 2`(空名は header 想定の初回=属性なし。空名が 2 回目なら ` 2`)と固定。単一カウンタ実装・名前を無視する実装を検出。`__proto__`/`constructor` は初回=名前そのまま、再登場=`<名前> 2`。
- modal 採番(順序固定): `header → footer → header` で modal ID が `modal-1 → (footer は modal 要素なし) → modal-2`、`footer → header` で header が `modal-1`。footer が採番を消費する実装を検出。
**B. 属性導出の独立検査(D-2b/c)**
- 保存 HTML(innerHTML)を**固定**したまま `width`/`fontSize` 属性だけを変えたブロックを渡し、出力が属性由来(`flex-basis:30%`、`has-large-font-size`)になること。保存 HTML のコピーで代用する実装を検出。
- columns のコンテナハッシュ: `ctx.global` の gap(blockGap)を変えたケースで、独立に計算した期待(layoutInput 経由ではなく md5 規則をテスト内で再実装した検算関数、被検査側 helper 非使用)と一致し、基準ハッシュ固定を検出。
**C. サニタイズ負例の具体化(D-2c)**
- 入口ごと(theme 由来 paragraph / 投稿由来 paragraph)に、別ケースで `<script>`、`onclick`/`onerror` 等のイベント属性、`javascript:`/`data:` href を渡す。**方針は『除去』**: 出力 DOM に危険要素・属性・URL が無く、安全な本文テキストと `<a href="https://wordpress.org" rel="nofollow">` は残る。**列挙したサニタイズケースは正常終了を必須**とし(例外は不合格)、危険部分の除去と安全部分の保持を**同じ出力**で検査する。診断付き拒否(`RangeError` 等の所定型)は、不正属性(型違い・範囲外)など**別の入力ケース**に限定し、そこでも TypeError 等は不合格。
**D. fail-closed(D-2a/e)**
- `renderFooter` に、`parts/footer.html` 欠落は `ThemeResolveError` かつ `code === 'unknown-part'`、footer 直下の未知ブロックと column/group 内の入れ子の未知ブロックは `UnsupportedBlockError`(ケースを分けて検査。黙って捨てる実装を検出)。
- D-2a の未取得 ctx: `tagline` だけ省略、`logoId` だけ省略、両方省略、をそれぞれ RangeError(片方の検証削除を検出)。
**E. Red の分類と実行表**
| 単位 | テスト配置 | 実行 | 想定 Red |
|---|---|---|---|
| D-2a | packages/render/src/{siteLogo,siteTagline,spacer}Block.test.ts(または footerLeaf.test.ts にまとめる) | `pnpm vitest run <file>` | 新規モジュール未存在による収集失敗(各 assertion の Red 証拠ではない旨を報告に明記。実装後の最初の実行で assertion 単位の Red/Green を確認するため、**Haiku は実装前に各 assertion が到達可能であること(スタブ実装で失敗内容を確認)を報告する**) |
| D-2b | columnsBlock.test.ts | 同上 | 同上 |
| D-2c | paragraphBlock.test.ts | 同上 | 同上。既存 renderBlocks 投稿 paragraph の回帰は開始時から Green で良い |
| D-2d | navigationBlock.test.ts へ追記(非 responsive 経路) | 同上 | 既存 18 件は Green 維持、新規追加分のみ Red(出力差=機能不足) |
| D-2e | footerCompose.test.ts、headerCompose.test.ts の登録キー集合更新 | 同上 | モジュール未存在。**スタブ導入後、全体比較と fail-closed は assertion 単位で Red になることを確認して報告する。比較器負例(column 欠落/nav の aria-label 欠落/spacer 二重化)は既存 `htmlEquals` に基準DOMと破壊後DOMを渡す検査なので Green を許容し、『改変が成立していること』と『比較 assertion に到達していること』を確認して報告する(比較器自体を失敗させる必要はない)** |
- 既存機能の回帰テスト(header 合成、navigation、投稿 paragraph/sanitize)は開始時点から Green でよい。環境不備(fixture 不足、import パス誤り)は Red と認めず fixture 不足として報告。
**F. 手書き期待値の出典**
- 手書き期待値のコメントに『WP 7.1.3 wp-includes/blocks/<file>.php:<関数> の規則』と test_id(`D2x-NN`)を付す。期待値生成に被検査側の helper を使わない。

## 9. D-3 main 領域(設計 v3、2026-11-01、STEP1。STEP2 は v1・v2 とも No-Go。v3 は実測 M1〜M5 と v2 指摘を反映)

対象: 基準 WP の single(`/spike-blocks/`、投稿 ID 5)の `<main>`。入力は `templates/single.html` + patterns(hidden-written-by / post-navigation / comments / more-posts)。比較対象は `regions/main-01.html`・`main-02.html`、全体ページ `spike-blocks.html` の `<main id="wp--skip-link--target" …>`、追加基準 `fixtures/ref/set-main2/`(README に取得条件)。

### 9.0 実測した事実(STEP2 前に基準 WP で実施済み。DB は丸ごとバックアップから復元・検証済み)
- M1/M2(匿名): **保護投稿(publish+password)は query にも前後ナビにも出る**。query ではタイトルが `Protected: <題>`、li のクラスに `post-password-required`。前後ナビでは接頭辞なしのタイトル(`M-prot`)とリンク。draft・private・future(状態)は匿名では出ない。同日時の query は **ID 降順**。ADR-027(latest-posts)と同じく『一覧にタイトルだけ露出』の例外に当たる。
- M3(post クラス): `post-<ID> post type-post status-publish format-<f> [post-password-required] hentry category-<slug>… tag-<slug>… [post_format-post-format-<f>]`。複数カテゴリはスラッグではなく**名前順**と見られる(Zeta=term2,Alpha=term3 → `category-alpha category-zeta`)。カテゴリを明示すると `category-uncategorized` は付かない。format-aside で `format-aside` と `post_format-post-format-aside`。
- M4: `post_author` が実在ユーザー(admin)なら `<div class="wp-block-post-author-name"><a href="<site>/author/<nicename>/" target="_self" class="wp-block-post-author-name__link">admin</a></div>`、`post_author=0` なら出力なし。
- M5: 承認済みコメント 1 件の投稿では comments-title(`One response to “題”`)、`<ol class="wp-block-comment-template">`(avatar・日付・著者・本文・Reply)が出る。D-3 では拒否、D-4 の入力。
- dump の options: timezone_string=''、gmt_offset=0、date_format='F j, Y'、comment_registration=0、require_name_email=1、show_comments_cookies_opt_in=1、thread_comments=1、page_comments=0。投稿 ID 5 の承認済みコメントは 0 件。

### 9.1 設計決定
1. **ポートは『束縛された関数』**。型は `packages/render/src/ports.ts`(純粋な型。`node:sqlite` を import しない。同期は SQLite スパイク限定、非同期化は別設計=ADR)。render は postId を渡さない。
   - 現在投稿: composition root が `packages/db` の `openCurrentPost(slug|id)` で `{ post: PostCtx; content: ContentPort }` を作る。**匿名閲覧可能・非保護・存在する投稿のみ**返し、他は null。保護投稿のパスワード画面は範囲外。
   - `ContentPort`(現在投稿に束縛): `contentOf()`、`terms('category'|'post_tag')`、`adjacent('previous'|'next')`、`commentsState()`(`'anon-open-empty'|'unsupported'` の列挙のみ。件数を返さない)、`hasThumbnail()`、`author()`(`{name,url}|null`)。
   - 現在投稿に依存しない: `queryPosts(spec)`、`latestPosts(spec)`。
2. **query のカード単位の文脈(Blocker)**: `queryPosts(spec)` は SQL 認可済みの項目 `QueryItem = { post: PostCtx; content: ContentPort }` の配列を返す(項目ごとにその投稿へ束縛されたポート)。`post-template` は項目ごとに、提供された `renderChildren(innerBlocks, { post: item.post, content: item.content })` を呼ぶ(第2引数は §9.5-7 の文脈上書き。`renderState` は参照共有、`ctx.post/content` は局所の上書きで、ループ後は外側の文脈に自然に戻る)。render は項目のポートを作らず、他の投稿へ切り替える手段を持たない。負例: 各カードが自分の title/date/URL を使う(外側の現在投稿を使わない)、post-template の後続ブロックが外側の投稿を見る、項目ポートからは他の投稿の本文が取れない。
3. **query の仕様と選択**: spec は閉じた型(postType:'post'、perPage 1〜100、pages:0、offset:0、order:'desc'、orderBy:'date'、author:''、search:''、exclude:[]、sticky:''、inherit:false、taxQuery:null、parents:[])。SQL 条件は `post_type='post' AND post_status='publish'`(**保護投稿を含む**。実測 M1)、並びは `post_date DESC, ID DESC`(同日時は ID 降順、実測)。DTO の `protected: boolean` を post-title が使い、`Protected: ` 接頭辞(エスケープ後)を付ける。本文・パスワードは DTO に含めない。future 状態・draft・private は SQL で除外。
4. **adjacent**: 現在投稿の `post_date` を基準に、publish(保護を含む)の直前/直後 1 件。タイトルは接頭辞なし(実測 M2)。隣接なしの出力は**未実測**(基準は両側あり)→ 隣接なしの時は `UnsupportedDataError`(契約は D-3e のテストで検証、WP の出力が未実測のため partial として記録。§9.5-6)。
5. **latest-posts**: ADR-027 と既存 `latestPosts.ts` の挙動(保護投稿を `Protected:` 付きで含める)を維持する。ポートの DTO は既存関数の戻り値そのもの。D-3d0 の既存テストは変更しない。
6. **post クラス**: db が算出して `className` で返す。生成規則は 9.0 の M3 の順序。対応は『type=post、status=publish、format ∈ {standard, aside}、カテゴリ名順、タグあり可、保護は `post-password-required`、sticky・サムネイル・他 taxonomy は不可』。不可を含む項目は `UnsupportedDataError`(そのクエリ全体を拒否〔黙って除外して並びをずらさない〕。公開サイトで通常運用する前の spike 範囲の partial として ADR に明記)。render は `className` を再検証(`^[A-Za-z0-9_ -]+$`)しエスケープして出す。カテゴリの『名前順』は 2 件の異名でのみ確認(同名・日本語名は未実測)。
7. **日付**: db が options を読み、`timezone_string=''`・`gmt_offset=0`・`date_format='F j, Y'` のときだけ `dateIso`(`+00:00`)と `dateText` を返す。他は `UnsupportedDataError`。
8. **コメント**: `commentsState()` が `'anon-open-empty'` になる条件は、投稿 comment_status='open' かつ comment_registration=0 かつ require_name_email=1 かつ show_comments_cookies_opt_in=1 かつ承認済みコメント 0 件。承認済み 1 件以上は `'unsupported'`(D-4)。件数・未承認の有無は返さない。コメント者 Cookie の有るリクエストは composition root が拒否(D-4)。フォーム定数(maxlength 65525/245/100/200、`Post Comment`、`Leave a Reply`)は基準値、`comment_post_ID` は PostCtx.id、action は `site.url + '/wp-comments-post.php'`。
9. **post-author-name**: `author()` が `null` なら空出力、`{name,url}` なら M4 の形(`name` はテキスト、`url` は `site.url` 配下の http(s) を検証して属性エスケープ、`isLink:true` のみ対応)。`hasThumbnail()` が false なら featured-image は空出力、true なら RangeError。post-terms の `post_tag`: 0 件は空出力、1 件以上は RangeError(基準で未実測)。category は `regions/main-01.html` の形(`<div style="font-weight:300" class="taxonomy-category wp-block-post-terms"><a href="<site>/category/<slug>/" rel="tag">名</a></div>`。`style` は attrs.style.typography.fontWeight(`^[1-9]00$`)から導出し、未対応の style キーは拒否。複数カテゴリの区切りは未実測のため 1 件のみ対応、2 件以上は RangeError)。
10. **信頼境界(Major)**: レジストリは**出自を区別する不透明な型**にする。`ThemeRegistry` と `PostRegistry` はブランド付き型で、`createThemeRegistry()`(D-2 の 11 キー + D-3 追加)と `createPostRegistry()`(heading・paragraph・list・list-item・quote・separator・latest-posts のみ、全て sanitize 経由)から**のみ**作る(凍結)。`post-content` は `PostRegistry` 以外を受け取らない(型で拒否+実行時にも出自タグを検査)。**子の無視を禁止**: `renderTree` の dispatch は、子ブロックを持つ block について、レンダラが `renderChildren` を呼ばなかった場合に拒否する(子の未検証捨て禁止)。投稿本文の全階層で、script・イベント属性・テーマ専用ブロック(`wp:query`・`wp:post-content`・`wp:comments` 等)・list/quote 内の混入・入れ子 post-content を負例にする。
11. **main の id**: `renderMain` が最上位 `tagName:"main"` の group にのみ `id="wp--skip-link--target"` を付ける(skip-link の href と同値を定数共有)。出力に main が 1 つだけ、`id` 重複なしを検査し、違えば RangeError。
12. 台帳は §7.1-5 に従い notes に `partial=` を追記し status は todo のまま。

### 9.2 実装単位(順に STEP1〜7)
(**§9.5 の追補は §9.1〜9.2 の記述より優先する**。D-3d0 の『既存テストは Green のまま』は『期待 HTML を変えずに入力の与え方だけを §9.5-4 に従い移行した上で Green』の意味。)
- D-3z1: `groupBlock` の属性拡張(tagName〔div/main/nav/header/footer/section の許可リスト〕、ariaLabel、align、border top/bottom〔preset 色・`^\d+px$`〕、layout〔default/constrained/flex の nowrap・space-between・verticalAlignment〕)。受入: 既存 header/footer テスト Green、属性エスケープ、不正値拒否。
- D-3z2: template の `wp:template-part`(header/footer)解決。受入: single.html の先頭/末尾、欠落は ThemeResolveError。
- D-3z3: パターン内の属性レベル `esc_attr_e` 展開(post-navigation パターン)と特殊文字拒否。受入: 既存の `esc_html_e` 展開テスト Green。
- D-3a: `ports.ts` の型、`ThemeRegistry`/`PostRegistry` ブランド型、`createDefaultRegistry` → `createThemeRegistry` 改名(登録キー・header/footer テスト維持)、`renderChildren` 呼び出し検査、heading・post-title(`Protected:` 接頭辞)・post-date。
- D-3b: `packages/db` の `queryPosts`(SQL 条件・順序・`className`・日付・`QueryItem` 束縛)と query/post-template と more-posts パターン(main-02 一致、set-main2 の混在・タイブレーク・クラス)。
- D-3c: `terms`/`author`/`hasThumbnail` と post-terms・post-author-name・post-featured-image、hidden-written-by パターン(post_author=0 と実在ユーザーの両方)。
- D-3d0: `renderContent` のポート化(DB 直接参照の除去、latest-posts を `latestPosts(spec)` ポート越し、`PostRegistry` に heading・paragraph・list・list-item・quote・separator・latest-posts を登録、公開 API の移行を含む)。既存テストは Green のまま。
- D-3d: post-content ブロック(`contentOf` → PostRegistry の再帰、外殻クラス、layout)。
- D-3e: `adjacent` と post-navigation-link ×2(set-main2 の保護隣接、矢印、`rel`)と post-navigation パターン。
- D-3f: comments / comments-title / comment-template / comments-pagination / post-comments-form(`'anon-open-empty'` のみ)と comments パターン。
- D-3g: `renderMain`(single.html 解決→main 外殻)と main-01/main-02/`spike-blocks.html` の `<main>` 全体一致、header→main→footer の ctx 共有。

### 9.3 リスク・未決
- 同期ポート(SQLite 限定)の将来の非同期化は別設計。
- カテゴリ順(名前順の根拠は 2 件のみ)、隣接なしの出力、sticky・サムネイル・format の全種は未実測=拒否。
- 保護投稿を通常運用でも一覧に出す方針(WP と同じ)は ADR-027 の延長。公開用途で変えるなら別 ADR。

### 9.5 v4・v5 追補(STEP2 v3/v4 の指摘への対応。9.1 の該当項より優先。STEP2 は v5 で Go)
1. **保護項目は本文を取れない(Blocker)**: `ContentPort.contentOf` は optional(`(() => string) | undefined`)。db は保護項目のポートでは `contentOf` を**付与しない**。`post-content` は `contentOf` が無ければ RangeError(型でも実行時でも拒否)。`openCurrentPost` も保護投稿は null。負例: 保護項目の card 内に `post-content` を置くと拒否、保護項目のポートの `contentOf` が undefined、DTO/ポートのどこからも本文・パスワードが取れない。
2. **保護カードに日付を出さない(Major)**: 実測(set-main2 混在 fixture)で、保護投稿のカードの `post-date` は出力されない(title のみ)。`post-date` は `post.protected === true` なら空出力。受入条件: 混在 fixture の保護カード(`post-22`)が一致、通常カードは日付あり。
3. **子の検証契約(Major)**: `renderTree` は、`innerBlocks` を持つ block について、レンダラが提供された `renderChildren` を通して**元の全 innerBlocks(同一性で照合)を描画した**ことを検査する。`renderChildren([])`・一部のみ・別配列は拒否(レンダラが自前で別ソースの子を作る navigation の post.content 等は『innerBlocks が空』のブロックなので対象外)。負例: 子を捨てるレンダラ、子の一部だけ描画するレンダラ、子を別レジストリで描画するレンダラ。
4. **D-3d0 の互換境界(Major)**: `renderContent` の公開 API は `render` 側から DB 型を除去し、`latestPosts` ポートを受け取る形に変える(`{ db, siteUrl }` の直接渡しは廃止)。既存 `renderContent.test.ts` は**期待 HTML を変えず、入力の与え方だけ**を移行する(テスト用に db から `latestPosts` ポートを作るアダプタを `packages/db` が提供し、テストはそれを使う)。この移行は ADR に記録し、変更差分が『入力構築のみ』であることを STEP6 で確認する。
5. **category の出力と参照(Minor)**: 9.1-9 を `regions/main-01.html` の形(`style="font-weight:300"` を含む)に修正済み。
6. **隣接なし(Minor)**: `adjacent()` が null を返す(隣接なし)ときの出力は未実測のため、`UnsupportedDataError` を投げる契約を D-3e のテスト対象にする(WP の出力が未実測でも契約は検証できる。partial として記録)。
7. **`renderChildren` の文脈上書き(Major)**: `renderChildren(blocks, override?)` を `(blocks: ParsedBlock[], override?: { post?: PostCtx; content?: ContentPort }) => string` に拡張する。`override` が許すキーは `post` と `content` のみ(他のキーは RangeError)。実装は `{ ...ctx, ...override }` の新しいオブジェクトを子の描画に渡し、`renderState` は参照を共有、外側の `ctx` は変更しない(ループ後は自然に元へ戻る)。§9.5-3 の子の検証(元の全 innerBlocks が renderChildren を通ること)はこの関数で行うので、post-template が項目ごとに呼ぶ場合も『元の innerBlocks 全体がカードごとに描画された』ことを検査できる(項目数 0 の場合は呼ばれなくてよい:空の query は出力なし)。負例: `override` に未許可キー、項目間で文脈が漏れる(card 2 が card 1 の post を使う)、ループ後に外側の post が上書きされたまま。

## 10. D-3 テスト計画(v1、STEP3。対象は §9.1〜9.5 の設計 v5)

共通規則(D-2 §8.3〜8.4 を継承): 期待値は fixtures(`regions/main-0*.html`、`set-main2/*`、`spike-blocks.html`、`themes/twentytwentyfive`)から取り、手書きの期待は出典コメントと test_id(`D3x-NN`)を付ける。WP ソース規則は『未照合』と明記。Red の理由は『出力差=機能不足』かモジュール未存在の収集失敗(各 assertion の Red はスタブ導入後に確認)。ハッシュ(`wp-container-core-*-<8桁>`)は fixture 値と、`node:crypto` の md5 による独立検算の両方で検査し、実装へ固定値を埋め込まない。mutation は sed+`cmp` で実施し、生存は『等価変更』か『テスト補強』かを判断する。比較は `htmlEquals`(正規化 DOM)。信頼境界・認可の負例は各単位で必須。

### D-3z1 group 属性拡張(`groupBlock.test.ts` へ追記)
- 基準一致: `post-navigation` パターンの外側 group(`align:wide`、margin top/bottom、layout default)と内側 nav group(`tagName:"nav"`、`ariaLabel`、`align:wide`、border top color/width、padding、flex nowrap space-between)が main-01 の該当 HTML と一致。`more-posts` の外側 group(constrained、padding)と card group(border bottom、flex、`verticalAlignment:"center"`)が main-02 の `li` 内 group と一致(verticalAlignment は出力に class を出さない事実と、ハッシュ入力への影響有無を独立 md5 で確認)。
- tagName: 許可リスト(div/main/nav/header/footer/section)は要素名に反映、`script`・`a`・`DIV`・空・非文字列は RangeError。終了タグも同じ名前。
- ariaLabel: `aria-label` 属性として出力、`"`・`<>&`・`" onmouseover="x` で属性が増えず値が保持される(DOM 検査)。非文字列は RangeError。nav 以外の tagName でも付与される実測は無い → 許可は nav のみ(他は RangeError)。
- align: full/wide のみ、`alignfull`/`alignwide` が基準のクラス順位置に出る。不正値は RangeError。
- border: top/bottom の color は `var:preset|color|<slug>`(slug `^[a-z0-9-]+$`)→`var(--wp--preset--color--<slug>)`、width は `^\d+px$`。style 内の順序は基準(border → padding)に一致。`url()`・`;`・負値・単位なし・未知キー(`radius` 等)・`top: []` 以外の空配列は RangeError(`"top":[],"right":[]` は無視する基準入力を受理)。
- 回帰: 既存 groupBlock/headerCompose/footerCompose テスト Green。mutation: tagName 許可リスト、border 順序、width 正規表現、ariaLabel のエスケープ。

### D-3z2 template-part 解決(`templateResolve.test.ts` へ追記)
- `single.html` の `wp:template-part {"slug":"header"}` を `parts/header.html` に、`footer` を `parts/footer.html` に解決し、`<header|footer class="wp-block-template-part">` で包む既存合成と接続する(トップ構造の分解結果を検査)。slug 未知・`area` 等の未対応属性・`theme` 属性は ThemeResolveError/RangeError。循環(template-part が自身を含む)は拒否。パス走査(`../`)は拒否。
- 負例: 欠落、空 slug、非文字列 slug。mutation: slug→ファイル名の対応。

### D-3z3 属性レベル `esc_attr_e`(`templateResolve.test.ts` へ追記)
- `post-navigation` パターンの JSON 内 `<?php esc_attr_e( 'Post navigation', 'twentytwentyfive' ); ?>` と HTML 属性内のそれの両方が、`Post navigation` に展開される(出典: 基準 `aria-label="Post navigation"`)。
- 特殊文字(`"`・`<>&`・`\`)を含む文字列、未対応関数(`_e`、`echo`)、複数式、閉じ忘れは診断付き拒否(黙って残さない・消さない)。既存 `esc_html_e` テストは Green。

### D-3a ports と型、レジストリ分離、renderChildren 契約、heading・post-title・post-date(`ports.test.ts`、`registryOrigin.test.ts`、`postTitleDate.test.ts`)
- ブランド型: `createThemeRegistry()`/`createPostRegistry()` 以外の Map を `post-content` 入口(後続)や `PostRegistry` を要求する関数へ渡すと型エラー(`// @ts-expect-error` を使う型テスト、`tsc` が実際に検出することを確認)。実行時にも出自タグ不一致は RangeError。レジストリは凍結(後から set できない)。キー集合の完全一致をテーマ側(D-2 の 11 キー+D-3 追加)と投稿側(7 キー)で固定。
- `renderChildren` 契約(§9.5-3,7): 子を捨てる/一部のみ/空配列を渡す/別レジストリで描画する偽レンダラが拒否される。`override` の未許可キーは RangeError。`{post, content}` の上書きが子の描画中だけ有効で、戻った後に外側の `ctx.post` が不変。項目間で漏れない。`renderState` は共有(modalCounter/navNameCounts が子の描画で進む)。
- heading: 登録表入口で `wp-block-heading`、level、align、fontSize、style(typography の text-transform 等)を main-02 の `<h2 class="wp-block-heading alignwide has-small-font-size" style="font-style:normal;font-weight:700;letter-spacing:1.4px;text-transform:uppercase">` と一致。属性値の検証(未知キー拒否、`url()`)。投稿由来 heading は従来の sanitize 経路を維持(既存テスト Green)。
- post-title: level(1/3)、`isLink` と `target="_self"`、fontSize、`Protected: ` 接頭辞(`protected:true`)、エスケープ(`<>&"`)。main-01 の `<h1 class="wp-block-post-title">`(リンクなし)と main-02 の h3(リンクあり)が一致。`ctx.post` 未提供は RangeError。
- post-date: `isLink`、`textAlign:"right"`→`has-text-align-right`、`<time datetime>` と表示文字列は DTO の `dateIso`/`dateText` を使う。**保護項目は出力なし**(set-main2 の `post-22`)。属性エスケープ。日付 DTO が無ければ RangeError。

### D-3b `queryPosts` と query/post-template と more-posts(`packages/db/src/queryPosts.test.ts`、`packages/render/src/queryBlock.test.ts`)
- db: 混在 DB(publish・保護・draft・private・future〔状態〕・page・同日時 2 件)を作り、結果が set-main2 の実測と同じ集合・順序(保護を含む、draft/private/future を除く、同日時は ID 降順)。perPage 超過、`offset`/`exclude`/`order` 等 spec の他の値は RangeError(spec 検証)。`className` の生成: 基準 3 件、複数カテゴリ(名前順)、タグ、format aside、保護(`post-password-required`)を set-main2 の li クラスと一致。sticky・サムネイル・他 taxonomy・他 format・`post_type` が post 以外を含む項目は `UnsupportedDataError` でクエリ全体を拒否。日付 DTO: options が基準でなければ `UnsupportedDataError`。
- 認可の負例: `QueryItem` から他投稿の本文は取れない、保護項目のポートに `contentOf` が無い、`post_status` を render 側に出さない(lint)。`className` はスラッグを `^[a-z0-9-]+$` で検証(`" onclick=` を含む名前の term を DB に入れても出力に出ない/拒否)。
- render: `regions/main-02.html` 全体(more-posts パターン展開→group→heading→query→post-template→3 カード)が一致。set-main2 の混在・タイブレーク・クラス 2 組が一致(保護カードは日付なし・`Protected:` 付き)。空の結果は出力なし。`queryPosts` ポート未提供は RangeError。カード間でポートが漏れない・外側の `post` が戻る(D-3a の契約を実使用で再確認)。
- mutation: SQL 条件(保護を含める/future を含める)、並び(ID 昇順化)、perPage、クラスの順序、日付抑止。

### D-3c post-terms・post-author-name・post-featured-image・hidden-written-by(`termsAuthor.test.ts`)
- post-terms: category 1 件が `regions/main-01.html` の形(`style="font-weight:300"` と `taxonomy-category`)で一致。`fontWeight` 値の検証(`^[1-9]00$`)、未対応 style キー拒否。2 件以上のカテゴリ・`post_tag` 1 件以上は RangeError、`post_tag` 0 件は出力なし。リンク URL は `site.url` 配下で検証、term 名/スラッグのエスケープ。
- post-author-name: `author()` が null → 空出力(main-01 一致)、`{name,url}` → set-main2 の `main.author-real.html` の形に一致、`isLink:false` や未知属性は RangeError、`url` が `javascript:` や別オリジンなら拒否、`name` の `<>&"` はエスケープ。
- post-featured-image: `hasThumbnail()` false → 出力なし、true → RangeError、属性 `aspectRatio:"3/2"` は検証して受理。
- パターン: `hidden-written-by` 全体(group flex wrap + paragraph + author + paragraph + terms)が main-01 該当部と一致、実在著者版は main.author-real と一致。
- mutation: null 分岐、`isLink`、fontWeight 検証、カテゴリ件数ガード。

### D-3d0 `renderContent` のポート化(`renderContent.test.ts` 移行、`postRegistry.test.ts`)
- 既存テストは期待 HTML を変えず、入力の与え方(db→`latestPosts` ポート)のみ移行(§9.5-4)。差分が入力構築のみであることを STEP6 で `git diff` により確認。移行前後で同じ件数のテストが Green。
- `PostRegistry` のキー集合固定(7 キー)。投稿本文に `wp:query`・`wp:post-content`・`wp:comments`・`wp:navigation`・テーマ専用の未登録ブロックを入れると UnsupportedBlockError。list/quote 内の混入(入れ子)も拒否。script・`onclick`・`javascript:`・`data:` を含む本文は除去/拒否(サニタイズ)。
- latest-posts: 保護投稿を `Protected:` 付きで含める(ADR-027)、draft/private/future は除外、`DatabaseSync` を render が import していない(lint/依存検査)。
- mutation: レジストリ検査、ポート越しの呼び出し、サニタイズ。

### D-3d post-content(`postContent.test.ts`)
- `contentOf` の結果を `PostRegistry` で再帰描画し、`entry-content alignfull wp-block-post-content has-global-padding is-layout-constrained wp-block-post-content-is-layout-constrained` の外殻で包む。main-01 の post-content 全体(h2・p・list・quote・hr・latest-posts)が一致(ハッシュなし)。`align:"full"`・`layout:{type:"constrained"}` 以外は RangeError。
- `contentOf` 未提供(保護項目)は RangeError。入れ子 `post-content` を本文に含めると拒否。`ctx.post` 無しは RangeError。
- mutation: 外殻クラス、PostRegistry の使用(ThemeRegistry に差し替えると負例が落ちる)。

### D-3e `adjacent` と post-navigation-link とパターン(`postNavigation.test.ts`、`packages/db/src/adjacent.test.ts`)
- db: 基準 DB で ID 5 の prev=ID 1、next=ID 7。set-main2 の混在 DB で next=保護投稿(タイトル接頭辞なし)、draft/private/future は無視。隣接なし(最初/最後の投稿)は `null`。同日時の隣接は未実測→`UnsupportedDataError`。認可の負例: 直接 ID 指定の API が無いこと、他投稿の本文が取れないこと。
- render: `post-navigation-link` previous/next の HTML(矢印 span の位置と `aria-hidden`、`rel="prev|next"`、`is-arrow-arrow` クラス)が main-01 一致。属性 `type`/`showTitle`/`arrow` の検証(`arrow:"arrow"` 以外、`showTitle:false`、`linkLabel` 等は RangeError)。タイトルのエスケープ(`<特殊>`・`&`)。隣接が `null` のときは `UnsupportedDataError` 契約。パターン全体(外側 group + nav group)が一致。
- mutation: prev/next 取り違え、矢印位置、rel。

### D-3f コメント領域(`comments.test.ts`、`packages/db/src/commentsState.test.ts`)
- db: `commentsState()` が基準 DB の ID 5 で `'anon-open-empty'`。承認済み 1 件(ID 1)、`comment_status='closed'`、`comment_registration=1`、`require_name_email=0`、cookies opt-in 0 の各条件で `'unsupported'`。件数・未承認の有無が戻り値や例外メッセージに出ない。
- render: comments パターン全体(wrapper、`Comments` 見出し、comments-title・comment-template・pagination が 0 件で出力なし、post-comments-form)が `regions/main-01.html` の該当部と一致。フォーム定数(`maxlength` 4 つ、`autocomplete`、`required`、hidden の `comment_post_ID` と `comment_parent`)を fixture から取って一致。`comment_post_ID` に `PostCtx.id` を使う(別 ID で変わる)。action は `site.url` 検証後 + `/wp-comments-post.php`。`'unsupported'` は RangeError。`reply-title` の `Cancel reply` のパスは投稿の permalink 由来(`/spike-blocks/#respond`)でエスケープ。
- mutation: 状態ガード、`comment_post_ID`、定数。

### D-3g `renderMain` と全体比較(`mainCompose.test.ts`)
- 毎回『新規 ctx → header → main → footer』。`regions/main-01.html`・`main-02.html` の各一致に加え、`spike-blocks.html` の `<main id="wp--skip-link--target" …>` 全体が一致。set-main2 の混在版(`main.mixed-status-protected-adjacent`)と classes 版が一致(同じ ctx 構成〔保護・分類を DB に再現〕)。author-real 版も一致。
- main の id: 最上位 main にのみ付く、main が 2 つ、既存 id、複数 `wp--skip-link--target` は RangeError。
- header→main→footer の ctx 共有: modal 採番(header の modal-1)、aria-label カウンタ(footer の nav が ` 2` ` 3` になる〔main に nav がないこと〕)、新規 ctx でリセット。`single.html` 欠落は ThemeResolveError、未知ブロックは UnsupportedBlockError(main 直下と group 内)。
- 比較器負例: card 1 件欠落、nav の `rel` 欠落、`post-password-required` 欠落、保護カードに日付を追加、main の id 欠落。
- 台帳: 各単位の block 行に `partial=` を追記(status は todo)。

### 実行表
| 単位 | 配置 | 実行 | Red の理由 |
|---|---|---|---|
| D-3z1 | groupBlock.test.ts へ追記 | `pnpm --filter @wpn/render exec vitest run src/groupBlock.test.ts` | 新規追加分のみ Red(未対応属性による RangeError/出力差)。既存は Green |
| D-3z2/z3 | templateResolve.test.ts へ追記 | 同上 | 同上 |
| D-3a | ports/registryOrigin/postTitleDate.test.ts | 同上 | モジュール未存在。スタブ導入後に assertion 単位で確認 |
| D-3b | packages/db/src/queryPosts.test.ts、render/queryBlock.test.ts | 両パッケージ | モジュール未存在 |
| D-3c〜f | 各 *.test.ts | 同上 | モジュール未存在(db 側は関数未存在) |
| D-3d0 | renderContent.test.ts 移行、postRegistry.test.ts | 同上 | 入力移行の差分のみ。新テストは Red |
| D-3g | mainCompose.test.ts | 同上 | モジュール未存在。全体比較・fail-closed はスタブ後に assertion 単位で Red |

### 10.9 テスト計画 v2 追補(STEP3 v1 No-Go への対応。§10 の該当記述より優先)
1. **現在投稿の認可(Blocker)**: `openCurrentPost` のテスト(`packages/db/src/openCurrentPost.test.ts`)を D-3b の前提として追加。slug 経路と id 経路の**両方**で、存在しない、保護(publish+password)、draft、private、future〔状態〕、`post_type='page'`、`post_type='attachment'` を渡しても `null`(例外ではなく null、メッセージ等に存在の有無を出さない)。公開・非保護の post は PostCtx と束縛ポートを返す。query の除外テストでは代替しない。
2. **保護項目の秘密漏えい(Blocker)**: 実 DB に識別可能な秘密値(本文 `SECRET-BODY-<uuid>`、パスワード `SECRET-PW-<uuid>`)を入れ、保護項目の `QueryItem`・`PostCtx`・全ポートの戻り値・例外メッセージを `JSON.stringify`(循環・関数は除く)し、秘密値が含まれないことを検査。保護カード内に実際に `post-content` を置いて描画すると RangeError(`contentOf` 不在による)。DTO に `content`/`password` 系プロパティが存在しないことも列挙検査。
3. **子検証の同一性とカードごと(Major)**: `renderChildren` の負例に『別配列(同内容の複製)を渡す』『2 枚目のカードだけ子を省略する』『最初のカードだけ描画する』を追加。検査は呼び出しごと(カードごと)に、元の全 innerBlocks の同一性(参照)を要求する。空 query(項目 0)は呼ばれなくても成功、項目 1 以上で 1 度も呼ばれなければ拒否。
4. **レジストリ出自の回避(Major)**: 実際の `post-content` 入口(D-3d)で、(a) テーマ由来レジストリ、(b) 偽造タグ付きの通常 Map、(c) 取得後に `set` で変更を試みたレジストリ(凍結で例外)、(d) 出自タグを後から書き換える試み、(e) 投稿本文内の `wp:post-content` 入れ子と `wp:query` 混入、を拒否。型・共通 dispatch の検査は D-3a、実入口での拒否は D-3d に置く。
5. **実行表の具体化(Major)**(波括弧展開は使わず各ファイルを明示する。render は `pnpm --filter @wpn/render exec vitest run <file>`、db は `pnpm --filter @wpn/db exec vitest run <file>`):
   - D-3z1: render `src/groupBlock.test.ts`
   - D-3z2/z3: render `src/templateResolve.test.ts`
   - D-3a: render `src/ports.test.ts`、`src/registryOrigin.test.ts`、`src/postTitleDate.test.ts`
   - D-3b: db `src/openCurrentPost.test.ts`(認可。D-3b の前提として最初に実行)、db `src/queryPosts.test.ts`、render `src/queryBlock.test.ts`
   - D-3c: render `src/termsAuthor.test.ts`
   - D-3d0: render `src/renderContent.test.ts`、`src/postRegistry.test.ts`
   - D-3d: render `src/postContent.test.ts`
   - D-3e: db `src/adjacent.test.ts`、render `src/postNavigation.test.ts`
   - D-3f: db `src/commentsState.test.ts`、render `src/comments.test.ts`
   - D-3g: render `src/mainCompose.test.ts`
   - 毎単位: `pnpm typecheck`(終了コード。型テストの `@ts-expect-error` が未使用警告にならない=実際に型エラーが出ていることを確認)と `node tools/lint/check.mjs`、および両パッケージ全体の vitest。Red の報告は、(i)収集失敗〔モジュール未存在〕、(ii)スタブ導入後に assertion 単位で Red、(iii)元から Green の検査〔回帰・比較器負例・型テスト〕の 3 区分に分けて書き、(iii) を機能不足の Red として数えない。
6. **D-3b の page と全体拒否の区別(Major)**: (a) SQL が `post_type='post'` のみを選ぶので、混在 DB の page は結果に出ない(除外ケース)。(b) 選択済みの post 項目に未対応データ(sticky、サムネイル、他 taxonomy の term、format が standard/aside 以外)があると、`UnsupportedDataError` でクエリ全体を拒否(別ケース)。page は (b) の対象にしない。
7. **mutation の実施・判定(Major)**: 各 mutation について、(1)変更が成立したことを `cmp` で確認、(2)対象テストを実行し、失敗した test_id と assertion を記録、(3)生存は『等価変更』か『テスト補強』を理由付きで判断。必須の対象: ポート束縛(別投稿のポートを渡す)、本文漏えい(DTO に content を足す)、レジストリ出自の検査削除、子検証の同一性判定、文脈復元(上書きを外側へ残す)、保護の日付抑止、保護の SQL 条件、`openCurrentPost` の status/password/type 条件。
8. **fixture の由来(Minor)**: set-main2 の README に再現入力(DB 追加分)を追記済み。期待 DOM は fixture から抽出し、テストの DB は README の入力から組み立てる。期待をテスト内で手書きしない。
9. **単位間の依存(Minor)**: D-3a=型・共通 dispatch(ブランド型、`renderChildren` 契約、凍結)、D-3d=実入口〔post-content〕での出自拒否と入れ子混入、D-3d0=既存 HTML 不変と入力移行(別々に確認)。依存順は D-3z1→z2→z3→a→b→c→d0→d→e→f→g。
11. **タイトルのエスケープと fixture の DOM(Major)**: 基準の出力は `入れ子 &#038; <特殊> &#8220;文字&#8221;` と `<特殊>` を**生の文字**で含む。HTML のトークナイザは、`<` の直後が ASCII 英字でも `!`・`/`・`?` でもない場合(`<特殊>` の `特` など)はタグ開始とせず**テキスト**として扱う(`<!--`・`</` 等は別規則)ため、DOM 上は text ノード `<特殊>` で、安全にエスケープした `&lt;特殊&gt;` と**同じ DOM** になる。よって (a) 出力は常にエスケープし(`<` → `&lt;` 等)、(b) fixture との比較は `htmlEquals`(正規化 DOM)で行い、(c) テストで『fixture の該当箇所をパースすると text ノードが `入れ子 & <特殊> “文字”` であり、生成物も同じ text ノードで、かつ要素ノード `特殊` が存在しない』を明示的に検査する(既存 `latest-posts` の同題でも同じ扱い)。ASCII 英字で始まる `<script>` 等は要素にならないよう必ずエスケープされることを別の負例で検査する。テキストの正規化(数値文字参照 `&#038;`・`&#8220;` はパース後に同じ文字になる)も同様に DOM で比較する。

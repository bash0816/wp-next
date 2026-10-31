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

## 8. D-2 footer 領域 設計契約 v2 とテスト計画 v2(2026-10-31、STEP2 v1 No-Go: Major5/Minor2 を反映)

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
- 共通(v2): 追加する ctx フィールド(`site.tagline`/`site.logoId`/`renderState.navNameCounts`)は**すべて optional**とし、既存の header 用 ctx・既存テストを変更せずに型検査・回帰が通ること。合格条件に「既存 header 合成・navigation・投稿由来 paragraph/sanitize の全テスト+`pnpm typecheck` が緑」を含める。
- D-2a: `site-logo`(未設定=空/設定済み=拒否)、`site-tagline`(空=空/非空=実測形/未対応属性=拒否)、`spacer`(height/width 検証)。ctx.site に `tagline: string`、`logoId: number|null` を追加。
- D-2b: `columns`/`column`。
- D-2c: `paragraph`(theme 由来、fontSize→`has-<slug>-font-size`、`wp-block-paragraph`、内側 HTML は sanitize)。既存 renderBlocks の paragraph(投稿由来)との重複を避け、共通部は再利用。
- D-2d: navigation の非 responsive 経路(overlayMenu never、インライン子、orientation vertical、aria-label カウンタ)。header の既存 18 件を回帰として維持。
- D-2e: `renderFooter`(createDefaultRegistry に追加)と全体比較 2 組。**既存 headerCompose.test の登録キー 5 個完全一致テストを新しい集合へ更新する(私が意図的に更新。更新理由を ADR に記録)**。

### 8.3 テスト計画
- 全単位共通: 期待値は fixtures の HTML のみ(コードに埋めない)。生成入力は theme+ctx。比較は htmlEquals。各 it に検出対象と想定 Red(機能不足=モジュール未存在/出力差。環境不備は Red と認めない)。
- D-2a: (1)基準 footer の該当部分と一致 (2)tagline 空→出力なし、非空(set-footer2)→一致、特殊文字(`<b>`、`&`)が要素にならない (3)logoId 設定→拒否、未知属性(level、textAlign)→拒否 (4)spacer: height/width に `;` `"` `<` `url(`、負値/単位なし→拒否、preset→`var(--wp--preset--spacing--N)`。
- D-2b: 基準の columns/column と一致、width ''/'100%'/'30%'/不正('abc'、'1;x')、コンテナクラスは layoutInput 経由(ハッシュ直書き禁止)、column 内の子が再帰 dispatch を通る(未知ブロックは column 内でも拒否)。
- D-2c: fontSize 未指定/small/不正スラッグ(`a b`、`"`)、内側 HTML に `<script>`・`onclick`・`javascript:` を含む入力が除去/拒否、基準 2 つの paragraph と一致(printf 展開済みの `<a href="https://wordpress.org" rel="nofollow">` を保持)。
- 過適合対策(v2、全単位): テーマ入力を変えた in-memory テーマ(ラベル・URL・件数・順序・column 幅・spacing を変更)でも描画でき、期待値は WP ソース規則から手書きしたものを使う。**これらは実測 fixture ではなく『ソース由来・未実測』と明記**し、ゲート上は実測 2 組のみを根拠とする。
- D-2d: footer の 2 nav と一致(aria-label ` 2`/` 3`)、header+footer の同一 ctx で header は属性なし・footer は ` 2` ` 3`、ariaLabel 指定は優先、同名 2 つで `<名前> 2`、新 ctx でリセット、modal 採番を消費しない(header modal-1 のまま)、`ariaLabel` に引用符・`<>&`・`" onmouseover="x` を与えても属性が増えず値が保持される(合成 API 経由で DOM 検査)、`#`/`#a` は受理・`javascript:`/`//host` は拒否、ラベルに `&`/`"`/`<`/実体参照風(PHP 展開後)→拒否、カウンタ名に `__proto__`/`constructor`、footer 単独描画で番号が基準と異なる、orientation 不正→拒否、overlayMenu 未知値→拒否、inline 子の navigation-link は header 側と同じ URL 検証。
- D-2c 追加(v2): 投稿由来 paragraph(renderBlocks)のサニタイズ回帰(既存テスト)を維持。共通化部分は『theme 由来』『投稿由来』の入口を分け、投稿由来は必ず sanitizeHtml を通ることを検査。
- D-2e: regions/footer.html(isHome=false、tagline 空)と set-footer2(isHome=true、tagline/特殊文字名)の 2 組で全体一致。比較器負例(column 欠落、nav の aria-label 欠落、spacer 二重化)。header+footer を同一 ctx で描画しても modal-1 が重複しない。
- ゲート表記: footer 一致は group/columns/column/spacer/navigation/site-tagline/paragraph の部分達成(§7.1-5)。台帳は notes に partial を追記し done にしない。

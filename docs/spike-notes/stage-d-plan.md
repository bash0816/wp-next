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

## 6. 検証

- IP 検査: `command grep -nE "[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+" fixtures/ref/regions/*.html` の結果は全て `127.0.0.1` (計 20 件)。127.0.0.1 以外の IP なし。
- 抽出スクリプトの再実行結果は §7 の報告を参照 (本文書作成時点で未再実行の場合は未検証)。

## 7. 未検証 / 次の作業

- 未検証: gate 42 件と各ブロック名の完全一致 (クラス名からの推定のみ)。
- 未検証: `packages/render` 側で wrapper ブロック (group, query 等) が未対応のまま渡った場合の挙動。テストは未作成。
- 次の作業 (Stage D): 領域単位の失敗テスト (Red) を先に書き、skip-link → header → main-02 の順で対応する。

## 6. D-1 header 領域のテスト計画 v2 (STEP3 No-Go[Major5/Minor1] 対応版)
目的: `fixtures/ref/regions/header.html` と、テーマ(parts/header.html → patterns/header.php)+DB から TS で生成した HTML が正規化DOM一致する。範囲外: 一般PHP解釈、CSS全体、ナビの実ブラウザ動作(JS)。
共通契約(docs/08 継承): 比較器は parse5 の正規化DOM(コメント/要素間空白/属性順/siteurl/nonce/ver のみ無視。class/href/子要素順/本文は消さない)。生成側の入力は**テーマとDBダンプのみ**(期待値をコードに埋めない)。比較器負例: header の属性欠落・子要素の欠落・二重化を検出すること。**過適合防止のため2組の入力**: (i)基準そのもの (ii)site名・ページ名・slug・並び・階層を変えたDB(期待値は実WPで再取得して fixtures/ref/set-header2/ に保存。再取得は私がレビュー後に実施)。
匿名Actor固定。DBアクセスは packages/db の関数経由でSQLにて可視性を適用(JSフィルタでの除外は不合格)。

単位(各 Red→Green):
- D-1a テーマ解決: parts/*.html、`wp:pattern {"slug"}`→patterns/*.php。PHPヘッダ(`<?php ... ?>` コメントのみ)除去は許可、**実行式(esc_html_e 等)は独立した小fixtureで TS 代替を検証**(header.php には出力式が無い)。未対応PHP式は診断付き拒否(黙って消さない)。循環: 自己循環・相互循環を拒否、同じpatternの兄弟参照(非循環)は成功。未知ブロックは group/pattern の内側でも拒否。不正属性(JSONパース不能、型違い)は拒否。
- D-1b-1 layout入力生成: attrs・theme.json(settings/styles)・block support から wp_json_encode 入力の6要素(layout, has_global_padding?, gap, hasBlockGap?, fallbackGap, styleOverrides)を組み立てる関数。検査: global styles と settings の区別、キー順、null、style が空ならクラスを付けない、group 2個(ec1e7a1e, fbffc046)と navigation(6e943505)の3値を**独立した期待値**(基準HTML)から検査。固定値の埋め込みはレビューで検出。
- D-1b-2 group の HTML: layout type default/constrained/flex の class、spacing preset→style、align*、container class(layoutClass.ts を使用)。
- D-1c site-title: level 0、DB blogname、href=siteurl、エスケープ(`<>&"'` を含む名前、属性脱出、javascript: URL は含まれない)。
- D-1d-1 DB: ナビ解決 = navigation ブロックに ref が無い場合、WP同様に**最新の publish な wp_navigation 投稿**(基準では ID4、content=`<!-- wp:page-list /-->`)を解決。無ければ範囲外=診断付き拒否。page-list: publish の固定ページのみ、匿名でprivate/draft/future/保護ページが出ない(混在fixtureで検査、保護ページは実WPで期待値を取得して判断=ADR-027を暗黙拡張しない)、タイトル・URL漏洩なし、公開→非公開に変えた後の再描画で消える、空・複数件・並び(menu_order,title)・親子階層。
- D-1d-2 navigation HTML: 固定マークアップ(SVG、data-wp-*)、`data-wp-context` の JSON を HTML 属性境界で正しくエスケープ、`modal-N` は描画コンテキスト単位の連番(同一描画内の重複なし、次の描画でリセット)。
- D-1e header 合成: `<header class="wp-block-template-part">` ラッパ。全体を上記2組で正規化DOM一致。
負例/安全まとめ: 未対応PHP式、循環、未知ブロック、不正属性、特殊文字・属性脱出・javascript:URL・data-wp-context の注入、非公開ページ露出。

注: layoutClass.ts(ハッシュ関数)は先行して作成済みだが、STEP2/3 の Go まで未コミットで保留(手順違反の是正)。

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

## 6. D-1 header 領域のテスト計画 (STEP3 相当)
目的: `fixtures/ref/regions/header.html` と、テーマ(parts/header.html → patterns/header.php)+DB から TS で生成した HTML が正規化DOM一致する。
入力: fixtures/ref/themes/twentytwentyfive、基準DBダンプ(options: blogname=wpref, siteurl; posts: page 一覧=ナビ項目)。コードに期待値を埋めない。
実装単位(TDD順、各 Red→Green):
1. D-1a テーマ解決: `resolveTemplatePart(theme, slug)`(parts/*.html)、pattern 参照 `wp:pattern {"slug"}`(patterns/*.php の `<?php ... ?>` ヘッダ除去、`esc_html_e('X','domain')`/`esc_attr_e`/`echo esc_url(...)` の TS 代替、未対応PHP式は診断付きで拒否、循環検出)。
2. D-1b group ブロック: layout type default/constrained/flex の class(is-layout-*, wp-block-group-is-layout-*, is-content-justification-*, is-nowrap, has-global-padding)と style 属性(spacing preset → var(--wp--preset--spacing--N))、container class ハッシュ(layoutClass.ts)。
3. D-1c site-title: level 0 は `<p class="wp-block-site-title"><a href target=_self rel=home>`、DB blogname。
4. D-1d navigation: 子なし → ページ一覧フォールバック(DB の publish 固定ページ)。data-wp-* 属性、responsive container の固定マークアップ、id='modal-1' (wp_unique_id 相当の連番)、SVG。
5. D-1e header 全体合成: template-part ラッパ `<header class="wp-block-template-part">`。
負例/安全: 未知ブロック・未対応PHP式・pattern 循環は診断付きで拒否(フォールバックしない)。タイトル等の DB 値は文脈別エスケープ(テキスト/属性/URL)。非公開ページがナビに出ない(匿名)。
合格: header.html と正規化DOM一致(class/href/子要素順/本文は消さない)+上記負例。

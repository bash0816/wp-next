# set-main2: main 領域の追加基準(架空データ、基準WP 7.1.3 / TT25)
取得: 基準WPの `/spike-blocks/`(投稿 ID 5)と `/hello-world/`(匿名)の `<main>`。一時的にテスト投稿・カテゴリ・タグ・コメント状態を作って取得し、**DB ファイルを丸ごとバックアップから復元済み**(sha256 一致、投稿一覧・カテゴリ・タグを確認、復元後の main が regions/main-01,02 と一致)。投稿保護パスワードは架空値で HTML には出ない。
- main.mixed-status-protected-adjacent.html: 公開・保護(publish+password、23:27:00)・draft(23:26:15)・private(23:26:20)・future 状態(23:26:25、DB で状態のみ変更)を混在。結果: 前後ナビ(prev=Hello world!, next=保護投稿 `M-prot`〔タイトルは接頭辞なし〕)、query は保護投稿を `Protected: M-prot` で含み(クラスに `post-password-required`)、draft/private/future は匿名では出ない。
- main.classes-tiebreak-format-tag.html: 同日時 2 件(ID 降順で並ぶ)、複数カテゴリ(Zeta=term 2, Alpha=term 3 → `category-alpha category-zeta`、Uncategorized は付かない)、タグあり+format aside(`format-aside … tag-t-one post_format-post-format-aside`)。
- main.author-real.html: 投稿 ID 5 の post_author を 1(admin)にした場合の post-author-name(`<div class="wp-block-post-author-name"><a href=".../author/admin/" target="_self" class="wp-block-post-author-name__link">admin</a></div>`)。post_author=0 では出力なし(regions/main-01.html)。
- main.comment-approved-hello-world.html: 承認済みコメント 1 件の投稿の comments 領域(D-4 の入力。D-3 では拒否)。

## 再現入力(テストが DB を組み立てる際の根拠。基準 DB〔dump.sql〕への追加分)
- mixed-status-protected-adjacent: 投稿 ID 22 `M-prot`(publish、`post_password` 非空、2026-10-27 23:27:00、slug m-prot)、ID 23 `m-draft`(draft、23:26:15)、ID 24 `m-priv`(private、23:26:20)、ID 25 `m-fut`(post_status を future に変更、23:26:25)。すべて post、カテゴリ Uncategorized。現在投稿は ID 5。
- classes-tiebreak-format-tag: 上の 22〜25 は含めない(別取得)。ID 26 `tieA1`・27 `tieA2`(publish、同じ 2026-10-27 23:40:00)、カテゴリ Zeta(term 2)・Alpha(term 3)、ID 28 `classC1`(2026-10-28 01:00:00、カテゴリ Zeta と Alpha)、ID 29 `classC2`(02:00:00、タグ `t-one`〔slug t-one〕、format aside)。現在投稿は ID 5。
- author-real: 投稿 ID 5 の `post_author` を 1(admin、nicename admin)に変更。
- comment-approved-hello-world: dump のまま。現在投稿は ID 1(承認済みコメント 1 件)。

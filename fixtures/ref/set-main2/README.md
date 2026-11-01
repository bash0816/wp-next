# set-main2: main 領域の追加基準(架空データ、基準WP 7.1.3 / TT25)
取得: 基準WPの `/spike-blocks/`(投稿 ID 5)と `/hello-world/`(匿名)の `<main>`。一時的にテスト投稿・カテゴリ・タグ・コメント状態を作って取得し、**DB ファイルを丸ごとバックアップから復元済み**(sha256 一致、投稿一覧・カテゴリ・タグを確認、復元後の main が regions/main-01,02 と一致)。投稿保護パスワードは架空値で HTML には出ない。
- main.mixed-status-protected-adjacent.html: 公開・保護(publish+password、23:27:00)・draft(23:26:15)・private(23:26:20)・future 状態(23:26:25、DB で状態のみ変更)を混在。結果: 前後ナビ(prev=Hello world!, next=保護投稿 `M-prot`〔タイトルは接頭辞なし〕)、query は保護投稿を `Protected: M-prot` で含み(クラスに `post-password-required`)、draft/private/future は匿名では出ない。
- main.classes-tiebreak-format-tag.html: 同日時 2 件(ID 降順で並ぶ)、複数カテゴリ(Zeta=term 2, Alpha=term 3 → `category-alpha category-zeta`、Uncategorized は付かない)、タグあり+format aside(`format-aside … tag-t-one post_format-post-format-aside`)。
- main.author-real.html: 投稿 ID 5 の post_author を 1(admin)にした場合の post-author-name(`<div class="wp-block-post-author-name"><a href=".../author/admin/" target="_self" class="wp-block-post-author-name__link">admin</a></div>`)。post_author=0 では出力なし(regions/main-01.html)。
- main.comment-approved-hello-world.html: 承認済みコメント 1 件の投稿の comments 領域(D-4 の入力。D-3 では拒否)。

## 再現入力(取得時の DB 状態。**累積**であり、各 fixture は下記の状態の DB から取得した)
基準 dump.sql(投稿 ID 1/2/3/5/7、カテゴリ Uncategorized のみ、コメント 1 件〔ID 1〕)に、次を順に追加した。
- 状態 S1(mixed-status-protected-adjacent の取得時): dump + ID 22 `M-prot`(publish、`post_password` 非空、2026-10-27 23:27:00、slug m-prot)、ID 23 `m-draft`(draft、23:26:15)、ID 24 `m-priv`(private、23:26:20)、ID 25 `m-fut`(post_status を future に変更、23:26:25)。すべて post、カテゴリ Uncategorized。現在投稿は ID 5。(ID 8〜21 は未使用〔自動採番の欠番〕。)
- 状態 S2(classes-tiebreak-format-tag の取得時): S1 + カテゴリ Zeta(term 2)・Alpha(term 3)を新規作成 + ID 26 `tieA1`・27 `tieA2`(publish、同じ 2026-10-27 23:40:00、既定カテゴリ Uncategorized)、ID 28 `classC1`(2026-10-28 01:00:00、カテゴリ Zeta と Alpha のみ)、ID 29 `classC2`(02:00:00、タグ `t-one`、format aside、カテゴリ Uncategorized)。現在投稿は ID 5。**S1 の保護・draft・private・future 投稿も DB に残っている**(ID 5 の next は保護投稿 `M-prot`)。
- 状態 S3(author-real の取得時): S2 + 投稿 ID 5 の `post_author` を 1(admin、nicename admin)に変更。現在投稿は ID 5。
- 状態 S3(comment-approved-hello-world の取得時): 同じ S3 のまま、現在投稿は ID 1(承認済みコメント 1 件)。この HTML の query には S2 で追加した ID 26〜29(新しい順 4 件: 29・28・27・26)が現れる。前後ナビは prev なし(ID 1 が最古)、next は ID 5。
テストはこの累積状態を段階的に組み立てる(S1→S2→S3)。基準 regions/main-01,02 の取得状態は dump のみ(S0)。

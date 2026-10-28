# set-header2: header 領域の追加基準(架空データ、基準WP 7.1.3 / TT25)
取得: 基準WPのホーム `/`(匿名)の `<header class="wp-block-template-part">`。基準 regions/header.html は single 投稿ページ由来のため、サイトタイトルの `aria-current="page"`(ホームのみ)が差分。比較時は描画コンテキスト(ホーム/single)を揃える。
- header.pages-protected-and-draft.html: 固定ページ「Prot Page」(publish+パスワード)と「Draft Page」(draft)を一時作成した状態。**保護ページは匿名のナビに出る**(タイトルは素のまま、"Protected:" 接頭辞なし)、draft は出ない。並びは menu_order→title(Prot Page が Sample Page より前)。
- header.navB-newer-draft-ignored.html: 新しい publish の wp_navigation(NavB: Bee へのリンク)と、さらに新しい draft の wp_navigation(Dee)を一時作成した状態。**最新の publish の wp_navigation が使われ(Bee)、draft は無視される**。
一時投稿は取得後に force delete 済み(基準WPは ID 1,2,3,4,5,7 のみ)。

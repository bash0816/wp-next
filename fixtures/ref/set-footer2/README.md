# set-footer2: footer 領域の追加基準(架空データ、基準WP 7.1.3 / TT25)
取得: 基準WPのホーム `/`(匿名)の `<footer class="wp-block-template-part">`。blogname=`Foo & <Bar> "Q"`、blogdescription=`Tag line & <b>more</b>` を一時設定して取得し、取得後に wpref / 空へ復元済み(復元を確認)。
- footer.name-tagline-special.html: footer の site-title(ホームのため `aria-current="page"`)に特殊文字入りの名前、site-tagline が `<p class="wp-block-site-tagline">…</p>` として出る(blogdescription が空のときは何も出ない=regions/footer.html)。
- 基準 regions/footer.html は single 由来(site-title に aria-current なし、tagline なし)。

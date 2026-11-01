# パリティ例外(基準 WordPress との意図的な差異・未実測の仮定)

基準 WP(7.1.3 / twentytwentyfive)の出力と**一致しない、または一致を未確認**の項目を理由付きで一覧にする。ここに載せたものだけが許容される差異で、載っていない差異は不具合として扱う(docs/09 §1)。fail-closed(拒否)にしている項目は『拒否=黙って違う出力を返さない』ことを意味する。

| ID | 領域 | 内容 | 扱い | 根拠・解消条件 |
|---|---|---|---|---|
| PX-001 | wptexturize | post-title / post-navigation-link のタイトルで直引用符の対 `"x"` だけを曲がり引用符に変換する。`'`・`--`・`...`・`(c)`・`(r)`・`(tm)`・数字x数字・奇数個の `"` を含む題名は RangeError で拒否 | 拒否(fail-closed) | 基準 fixture の題名は直引用符の対のみ。他は未実測。解消: wptexturize の実測とポート |
| PX-002 | post-terms | カテゴリは**名前順(大文字小文字を無視)**。実測は 2 件の異名のみ。複数カテゴリの表示(区切り)・タグ表示は拒否 | 仮定+拒否 | M3 は Zeta/Alpha の 2 件のみ。MySQL の ci collation を仮定 |
| PX-003 | adjacent | 前後投稿で、基準と同じ公開日時の別の公開投稿があると拒否(UnsupportedDataError)。隣接なしは拒否(RangeError) | 拒否 | 同日時のタイブレークと隣接なしの出力は未実測 |
| PX-004 | query | 結果が 0 件の query は拒否。sticky・サムネイル・他 taxonomy・standard/aside 以外の format を含む窓はクエリ全体を拒否 | 拒否 | 未実測。通常運用のサイトでは頻出し得るため、解消優先度が高い |
| PX-005 | post-date / 日付 | `timezone_string=''`・`gmt_offset=0`・`date_format='F j, Y'` のときだけ表示。他は拒否。保護投稿のカードは日付を出さない(実測 M1) | 拒否 | 日時書式・タイムゾーン対応は別単位 |
| PX-006 | 保護投稿 | query・前後ナビ・latest-posts に**タイトルのみ**露出(`Protected: ` 接頭辞は query/latest-posts のみ。前後ナビは接頭辞なし)。本文・日付・パスワードは出さない。現在投稿として開くのは非保護のみ(パスワード入力画面は未対応) | 実測どおり(ADR-027) | M1/M2 |
| PX-007 | コメント | 匿名・open・承認済み 0 件のときだけ描画。承認済みあり・closed・ログイン済み・既存コメント者 Cookie は未対応 | 拒否 | D-4 で実装(M5 の fixture あり) |
| PX-008 | post-author-name / featured-image | 著者が解決できない(post_author=0)場合は空、実在する場合は `isLink` のリンク。featured image はサムネイルなしのみ(ありは拒否) | 拒否 | M4 |
| PX-009 | 描画の空白 | 投稿本文の静的ブロックで、子ブロック間の空白だけが基準と変わり得る。比較は正規化 DOM(`htmlEquals`) | 許容 | 文字列完全一致ではなく DOM 一致を合格基準にしている(docs/07) |
| PX-010 | group の属性 | 未知の属性(anchor・className・metadata・色など)は黙って捨てずに RangeError。`tagName` は div/main/nav/header/footer/section、`ariaLabel` は nav のみ | 拒否 | 出力に反映できない属性の無言脱落を防ぐ |

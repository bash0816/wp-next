# P0 成立性スパイク計画(ブロックテーマをTSで描画できるか)
目的: B案(ブロックテーマをTSで解釈)の成立性を、小さく早く判定する。基準=OCI基準WP 7.1.3 + twentytwentyfive 1.5(ブロックテーマ)。
## 対象(固定)
- 投稿1件(`/spike-blocks/`, ID5): heading / paragraph(strong,link) / list / quote / separator / **動的ブロック `core/latest-posts`**
- 比較単位: ①`.entry-content` 相当(the_content) ②ページ全体(正規化DOM、`<head>`の動的CSS除く)
- プラグイン1本は別途(スパイクB)。まずテーマ/ブロック。
## 段階と合格条件
| 段階 | 内容 | 合格 |
|---|---|---|
| A | 基準HTML・テーマ一式(templates/parts/patterns/theme.json)を fixtures/ref に保存 | 保存済み・再取得手順あり |
| B | `post_content`→HTML(コアの静的ブロック。パーサは@wordpress/block-serialization-default-parser) | ①が正規化DOMで完全一致 |
| C | 動的ブロック latest-posts をTSで再現(DBクエリ→HTML) | ①が一致 |
| D | テンプレ合成: single.html + parts(header/footer)+ pattern 展開、`core/post-title`等のテンプレート系ブロック | ページ全体のbody構造が一致 |
| E | theme.json → global-styles/CSS変数の生成 | `<style>` 差分が説明可能な範囲 |
## 判定
- B,C,D が合格 → B案Go(以降P2/P3で網羅を拡大)。
- 「PHP実行が本質的に必要」(例: テーマ/ブロックがPHP関数・フィルターに依存し再現不能)と判明、またはD〜Eの工数が許容を超える → B案撤退、php-wasm描画(ADR-002 Tier C拡大)へ切替。判断はユーザーに相談。
- 各段階後に差分一覧を `docs/parity-exceptions.md` 候補として記録。

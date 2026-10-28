# Container class ハッシュ (wp-container-*-is-layout-XXXXXXXX) の生成規則

対象: 基準WordPress (wpref, WP 7.1.3, twentytwentyfive) の `wp_render_layout_support_flag`。
基準環境は読み取り専用で参照した(`sudo docker exec wpref php -d display_errors=0 /dev/stdin ...` による `php` 実行のみ。ホストは `<REF_HOST>`)。

## 結論

- 前提の訂正: 接尾辞は PHP の `serialize()` の md5 ではない。**`wp_json_encode()` が返す JSON 文字列の md5 の先頭8桁**。
- 式: `prefix . substr( md5( wp_json_encode( $input ) ), 0, 8 )`
- 生成するかどうかは `if ( ! empty( $style ) )` で決まる (layout.php 1296〜1297)。空の style のブロックにはコンテナクラスが付かない。
- prefix は `'wp-container-' . sanitize_title( $block['blockName'] ) . '-is-layout-'` (core/group なら `wp-container-core-group-is-layout-`)。

## コード位置 (基準WP 7.1.3, 読み取りのみ)

- `wp-includes/functions.php` 8208〜8225: `wp_unique_id_from_values( array $data, string $prefix )`。`$serialized = wp_json_encode( $data ); $hash = substr( md5( $serialized ), 0, 8 ); return $prefix . $hash;`
- `wp-includes/functions.php` 約4443: `wp_json_encode( $value, $flags = 0, $depth = 512 )`。
- `wp-includes/block-supports/layout.php` 955: `wp_render_layout_support_flag( $block_content, $block )`。
- `wp-includes/block-supports/layout.php` 1160〜1210: ハッシュ入力配列の組み立て。
- `wp-includes/block-supports/layout.php` 1234〜1237: `$container_class = wp_unique_id_from_values( $container_class_hash_input, 'wp-container-' . sanitize_title( $block['blockName'] ) . '-is-layout-' );`
- `wp-includes/block-supports/layout.php` 86: `wp_sanitize_block_gap_value()`。
- `wp-includes/block-supports/utils.php` 23: `wp_should_skip_block_supports_serialization()`。

行番号は調査時点の読み取り結果。1234〜1237 と 1290〜1298 は今回の作業で再確認した。1160〜1210 は調査時点の読み取り結果であり、今回の再確認では未実施。

## ハッシュ入力 (配列の順序通り)

```php
$container_class_hash_input = array(
    $used_layout,                    // $block['attrs']['layout'] ?? $fallback_layout
    $has_block_gap_support,          // isset( $global_settings['spacing']['blockGap'] ) (bool)
    $gap_value,                      // wp_sanitize_block_gap_value( $style_attr['spacing']['blockGap'] ?? null )
    $should_skip_gap_serialization,  // wp_should_skip_block_supports_serialization( ..., 'spacing', 'blockGap' ) (bool)
    $fallback_gap_value,             // 下記参照
    $block_spacing,                  // $style_attr['spacing'] ?? null
);
// 以降、$responsive_media_queries の各 breakpoint が追加される場合がある (未検証: 今回の例では確認していない)
```

`$fallback_gap_value` の決定:
1. 既定値 `$block_type->supports['spacing']['blockGap']['__experimentalDefault'] ?? '0.5em'`。
2. `$global_block_gap_value = $variation_block_gap_value ?? $global_styles['blocks'][ $block_name ]['spacing']['blockGap'] ?? $global_styles['spacing']['blockGap'] ?? null;` が null でなければ上書き。
3. `$global_styles` は `wp_get_global_styles()` の値。`$global_settings` (`wp_get_global_settings()`) ではない。
   - twentytwentyfive では `$global_styles['spacing']['blockGap']` が `"1.2rem"`。
   - `$global_settings['spacing']['blockGap']` は bool `true`。上書きには使われない (`has_block_gap` 判定にのみ使われる)。

## JSON 型の影響 (wp_json_encode)

- PHP の `serialize()` ではないため、型は JSON の型で決まる。
- `null` は `null`、`true`/`false` は JSON の真偽値、文字列は `"..."`。
- 連想配列は JSON オブジェクト `{...}`。キーの順序は挿入順 (attrs の記述順) に従う。キー順が違えば JSON 文字列が違い、したがってハッシュも違う (文字列をハッシュしているための帰結。キー順を変えた実験は行っていない)。
- 空配列は `[]` (今回の例では未使用)。
- 数値 (int/float) の扱い: 今回の入力に数値は含まれなかった。未検証。
- 文字列内の `/` や非 ASCII の JSON エスケープ: `wp_json_encode` の既定フラグ (0) の挙動に依存するが、今回の例には該当文字がないため未検証。
- `json_encode` が失敗した場合 (深さ超過など) の挙動: 未検証。

## 検証 (wpref 内で実 render 結果と照合)

手順: `fixtures/ref/themes/twentytwentyfive/patterns/*.php` を `sudo docker exec -i wpref php ... /dev/stdin <files>` で読み込み、実際にレンダリングされた `wp-container-*-is-layout-XXXXXXXX` を取得。同じ入力を再現する PHP (`wp_unique_id_from_values` と同じ式) で計算して比較した。スクリプトはローカル `$TMPDIR/wpspike/verify2.php` にあり、リポジトリには含めていない。

| パターン | 実 render のハッシュ | 再現入力の layout | 再計算結果 | 判定 |
|---|---|---|---|---|
| header.php (1つ目) | ec1e7a1e | flex, nowrap, space-between | ec1e7a1e | MATCH |
| header.php (2つ目) | fbffc046 | flex, nowrap, right | fbffc046 | MATCH |
| event-rsvp.php | a2902c9c | default | a2902c9c | MATCH |
| event-rsvp.php | c3356f6f | flex, vertical, stretch | c3356f6f | MATCH |
| event-rsvp.php | 3e2b038e | flex, nowrap, right | 3e2b038e | MATCH |
| event-rsvp.php | df9ef4b9 | flex, vertical, stretch, verticalAlignment space-between | df9ef4b9 | MATCH |
| pricing-3-col.php | 13b221f0 | flex, wrap, space-between | 13b221f0 | MATCH |
| page-link-in-bio-with-tight-margins.php | 048d343b | flex, vertical, space-between, nowrap, stretch | 048d343b | MATCH |
| page-link-in-bio-with-tight-margins.php | 235bf788 | flex, nowrap | 235bf788 | MATCH |

- MATCH は 9 件、4 ファイル (header, event-rsvp, pricing-3-col, page-link-in-bio-with-tight-margins) から取得。
- 同じ検証で MISMATCH の候補がある (header.php と pricing-3-col.php の `default` / `constrained`、page-link の `default`)。これらは「そのファイルの実 render には現れなかったハッシュ」との比較であり、式の不一致を示すものではない。実 render で現れたハッシュはすべて MATCH。
- ただし「候補 layout が実 render に出なかった理由」は、`if ( ! empty( $style ) )` の判定 (layout.php 1296〜1297) で style が空になったためと推測される。その具体的な条件 (どの属性で style が空になるか) は未検証。
- 基準の fixture 対応: `fixtures/ref/spike-blocks.html` の 162 行目 (CSS `.wp-container-core-group-is-layout-ec1e7a1e{flex-wrap:nowrap;justify-content:space-between;}`) と 195 行目 (マークアップ) が、header.php の 1 つ目の group (`ec1e7a1e`) に対応する。

### ローカルでの独立確認 (PHP 不使用)

PHP の `wp_json_encode` の出力と同じ文字列 (空白なし、`|` は非エスケープ) を `md5sum` で計算した。

```
printf '%s' '[{"type":"flex","flexWrap":"nowrap","justifyContent":"space-between"},true,null,false,"1.2rem",{"padding":{"top":"var:preset|spacing|30","bottom":"var:preset|spacing|30"}}]' | md5sum | cut -c1-8   → ec1e7a1e
printf '%s' '[{"type":"flex","flexWrap":"nowrap","justifyContent":"right"},true,"var:preset|spacing|10",false,"1.2rem",{"blockGap":"var:preset|spacing|10"}]' | md5sum | cut -c1-8   → fbffc046
```

どちらも基準の値と一致。これにより「JSON 文字列 (区切りは `,`、キー順は挿入順、文字列は `"..."`、`|` はそのまま) の md5 先頭8桁」という規則を、PHP なしで確認できた。`/` と非 ASCII のエスケープは今回の入力に含まれないため未検証。
- 再計算に使った各 block の入力値 (`$has_block_gap=true`, `$should_skip=false`, `$gap_value`, `$block_spacing`) は、今回の例では以下の通り:
  - `$has_block_gap_support`: true
  - `$should_skip_gap_serialization`: false
  - `$fallback_gap_value`: `"1.2rem"` (wp_get_global_styles 由来)
  - `$gap_value`: 1つ目の例は null、2つ目の例は `"var:preset|spacing|10"`。どちらの値が来る条件かは、各ブロックの attrs (`spacing.blockGap`) から決まるが、その対応は今回は個別に確認していない (未検証)。

## TS で再現するために必要な情報

1. `wp_json_encode` と同じ JSON の文字列化 (キー順は attrs の挿入順、null/true/false の区別、連想配列はオブジェクト)。
2. `wp_sanitize_block_gap_value` の仕様 (layout.php 86 行付近)。
3. `wp_get_global_styles()` の `spacing.blockGap` と `blocks[name].spacing.blockGap` の値 (テーマ依存。twentytwentyfive では "1.2rem")。
4. `__experimentalDefault` (group の block.json) の値。既定 `'0.5em'` は未検証。
5. `$used_layout` の決定: `attrs.layout` があればそれ、なければ `$fallback_layout`。`layout.type` が inherit / contentSize のとき constrained に強制される分岐は、今回のフレックス例では未使用のため未検証。
6. responsive breakpoint エントリの追加条件 (未検証)。
7. `sanitize_title( $block['blockName'] )` の再現 (`core/group` → `core-group`。他ブロックは未検証)。

## 失敗したときの確認ポイント

- 配列要素の欠落や順序違い: `wp_json_encode` の結果が一致しない。
- `null` と欠落の取り違え: `attrs` に `blockGap` がないと `$gap_value` は null。
- global styles の値の取り違え: `1.2rem` と `0.5em` の差。
- layout の キー順 (attrs の記述順)。
- JSON エスケープ (`/`、非 ASCII) の差。

## 未検証

- `__experimentalDefault` の実値 (`0.5em` の既定が使われるケースは今回の例にない)。
- responsive breakpoint エントリの追加条件。
- `layout.type` が inherit/contentSize で constrained に強制されるケース。
- 数値型 (int/float) を含む入力。
- `wp_json_encode` のエスケープ挙動 (`/`、非 ASCII)。
- core/group 以外のブロック名の sanitize_title。
- TS 側での実装。今回はリサーチのみで、コード変更は行っていない。

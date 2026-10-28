# WordPress カバレッジ台帳 (docs/coverage)

基準WP(WordPress 7.1.3, Docker `wordpress:7.1.3-apache`)から機械的に抽出した「WordPress が持つべき項目」の一覧。推測や記憶からは行を足さない。

## CSV 一覧と行数

`wc -l` の値は行数(ヘッダ1行を含む)。データ行 = wc -l − 1。

| ファイル | wc -l | データ行 | 内容 |
|---|---|---|---|
| blocks.csv | 116 | 115 | `wp-includes/blocks/*/block.json` の全ブロック |
| rest-routes.csv | 136 | 135 | `/wp-json/` の全ルート |
| hooks-core.csv | 631 | 630 | `wp-includes/default-filters.php` の add_action / add_filter。foreach 配列変数(`$filter` 等)の 35 行を配列リテラルの実フック名ごとに展開(189 行)。元の 476 行 − 展開元 35 行 + 189 行 = 630 行 |
| template-hierarchy.csv | 34 | 33 | block theme のテンプレート階層と get_*_template 関数 |
| db-tables.csv | 13 | 12 | `wp_` 接頭辞の SQLite テーブル(基準WP の実機とコア定義の比較) |
| theme-features.csv | 15 | 14 | twentytwentyfive の theme.json キーと各種件数 |

## CSV の列

すべて `id,name,category,compat_level,status,notes`。

- `id`: 行ごとの連番(`blocks` は slug、他は `hook-NNN` / `rest-NNN` / `tpl-NNN` / `db-NNN` / `theme-NNN`)。hooks-core の展開行は `hook-NNN-MM`(元 id + 展開番号)
- `name`: hooks-core では実フック名(展開後は `$` 始まりの行なし。例外はテンプレート文字列 hook-476 の `{$post_type}`)
- `compat_level`: 下記の定義。全行同じ値(CSV ごとに固定)
- `status`: 下記の定義
- `notes`: 根拠と属性(`;` 区切り)

## compat_level の定義

- `L1`: データ(DB スキーマ・テーブル・列)
- `L2`: API(REST ルート)
- `L3`: 機能(ブロック・テンプレート階層・theme.json 機能)
- `L4`: プラグイン実行(フックの登録と実行。ADR-028)

| CSV | compat_level |
|---|---|
| blocks.csv | L3 |
| rest-routes.csv | L2 |
| hooks-core.csv | L4 |
| template-hierarchy.csv | L3 |
| db-tables.csv | L1 |
| theme-features.csv | L3 |

## status の定義

- `todo`: 未対応。既定値。
- `done`: wp-next で対応済みと確認できた項目のみ。**現時点で done は blocks.csv の 7 行だけ**(core/heading, core/paragraph, core/list, core/list-item, core/quote, core/separator, core/latest-posts)。db-tables.csv は基準WP側の一致確認のみで、wp-next 側の対応は未検証のため `todo` にしている。
- `wontfix`: 対応しない項目。**理由を notes に必ず書く**(理由なしの wontfix は不可)。

## 取得コマンド

基準WP ホストは `<REF_HOST>`、SSH 鍵は `<SSH_KEY>` と表記する。実値は公開リポジトリに書かない。すべて読み取り専用。Docker は remote 側で `sudo docker` を使う(ubuntu ユーザは docker グループ外)。WP のパスはコンテナ内の `/var/www/html`。

```sh
# blocks: 基準WP の block.json 件数(期待値 115)
ssh -i <SSH_KEY> -o BatchMode=yes ubuntu@<REF_HOST> \
  "sudo docker exec wpref sh -c 'cd /var/www/html && find wp-includes/blocks -name block.json | wc -l'"

# blocks: dynamic 判定は WP_Block_Type_Registry の render_callback を wp eval で取得した結果(未検証: この台帳に実行スクリプトは含めていない。再現には core/* を走査して render_callback の有無を出力する PHP を別途用意する)

# rest-routes: ルート一覧
ssh -i <SSH_KEY> -o BatchMode=yes ubuntu@<REF_HOST> "curl -s localhost:8080/wp-json/" | jq '.routes | keys[]'
# (注: curl はコンテナ内ではなくホスト側で実行する)

# hooks-core: 基準は PHP トークナイザ(token_get_all)で数えた add_action / add_filter の 476 呼び出し。そのうち foreach 配列変数を名前に持つ 35 呼び出し(`$filter` 32 + `$action` 3)を配列リテラルの実フック名ごとに展開し 189 行にした。476 − 35 + 189 = 630 データ行(wc -l は 631)。grep の行数は複数呼び出しの行を正しく数えないため、件数の検算には使わない。
# 参考の行単位の粗い確認のみ:
ssh -i <SSH_KEY> -o BatchMode=yes ubuntu@<REF_HOST> \
  "sudo docker exec wpref sh -c 'grep -cE \"add_(action|filter)\\(\" /var/www/html/wp-includes/default-filters.php'"

# template-hierarchy: get_template_hierarchy の位置
ssh -i <SSH_KEY> -o BatchMode=yes ubuntu@<REF_HOST> \
  "sudo docker exec wpref sh -c 'grep -n \"function get_template_hierarchy\" /var/www/html/wp-includes/block-template-utils.php'"

# theme-features: テーマ構成
ssh -i <SSH_KEY> -o BatchMode=yes ubuntu@<REF_HOST> \
  "sudo docker exec wpref sh -c 'cd /var/www/html/wp-content/themes/twentytwentyfive && ls templates/*.html | wc -l; ls parts/*.html | wc -l; ls patterns/*.php | wc -l'"
```

db-tables は SQLite の DB パスを `wp-content/database/db-path.php` から読む(パスは隠しディレクトリ配下のため、公開側には書かない)。読み取りは PDO で `PRAGMA query_only = ON` を指定して行った。

## blocks の動的判定ルール

- 判定の正本は **WP_Block_Type_Registry** の `render_callback`。`render_callback` が存在すれば `dynamic=yes`、無ければ `dynamic=no`。
- 根拠は `evidence=registry` と、`render_callback=` に入った関数名で示す。
- ファイル内容の正規表現による推測は使わない(`render.php` は基準WP に 1 つも存在せず、block.json に `render` キーも無いため、ファイル判定は信頼できないと確認した)。
- 件数: dynamic=yes 85、dynamic=no 30(合計 115)。

## 既知の注記

- **116 行目ではなく 115 件**: `core/post-comments` は `wp-includes/comments.php:225` の `register_block_type( 'core/post-comments', $metadata )` によるレガシー別名で、`comments/block.json`(name は `core/comments`)を流用する。block.json の件数に含まれないため行は作らず、ここに記録する。
- **hooks-core の展開**: foreach 配列変数を名前に持つ 35 行(`$filter` 32 行ほか。`$action` 3 行を含む)は、`default-filters.php` の該当 foreach の配列リテラルを token_get_all で読んで実フック名ごとの行に置換した。展開できない(動的)行は 0 件。元の行の `line=` は add_* 呼び出し行、展開行の notes に `expanded_from=` と foreach の行を残す。同じ名前が複数の呼び出し行に現れる場合(`wp_title`、`document_title` など)は呼び出し行ごとに残す。
- **hooks-core の hook-476**: `default-filters.php` 826-836 行の `foreach` 内で `"get_entity_view_config_posttype_{$post_type}"` と `"_wp_get_entity_view_config_posttype_{$post_type}"` を登録している。名前と callback はテンプレート文字列のまま(`{$post_type}` は展開されていない)、priority は 5。
- **rest-routes の namespace 空欄**: `/` と `/batch/v1` は API 出力の namespace が空文字のため、category は `(none)`。
- **template-hierarchy の `$is_custom=true`**: `get_template_hierarchy( $slug, true )` は page の連鎖(`page, singular, index`)を返し、派生テンプレート(`-{slug}` / `-{id}`)を生成しない。派生は `$slug` の形式分岐と `$template_prefix` で生成される。行は増やさず、この挙動はここに記録する。
- **db-tables**: 12 テーブルすべてで基準WP の実機列数とコア定義の列数が一致(wp_commentmeta 4, wp_comments 15, wp_links 13, wp_options 4, wp_postmeta 4, wp_posts 23, wp_term_relationships 3, wp_term_taxonomy 6, wp_termmeta 4, wp_terms 4, wp_usermeta 4, wp_users 10)。ただし **wp-next 側の対応は未検証**。
- **theme-features**: templates 8、parts 7、patterns 98 を基準WP 側の ls で再確認済み。styles/*.json は 8 件。
- **未検証**: wp-next 側のルート・フック・テーブル・テーマ機能の対応状況は本台帳では判定していない(すべて `todo`)。

## 集計例

```sh
cd /data/data/com.termux/files/home/wp-next/docs/coverage

# CSV ごとのデータ行数
for f in *.csv; do printf '%s %s\n' "$f" "$(( $(command wc -l < "$f") - 1 ))"; done

# blocks の status 別件数(列5)
command tail -n +2 blocks.csv | command cut -d, -f5 | sort | uniq -c

# blocks の dynamic 別件数(notes 内の dynamic=)
command tail -n +2 blocks.csv | command grep -oE 'dynamic=(yes|no)' | sort | uniq -c

# 全 CSV の status 別件数(python3 csv 版、引用符付きの notes があっても正しく数える)
python3 -I -c 'import csv,glob,collections
for f in sorted(glob.glob("*.csv")):
    c=collections.Counter(r["status"] for r in csv.DictReader(open(f,encoding="utf-8")))
    print(f, dict(c))'
```

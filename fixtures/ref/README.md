# fixtures/ref: 基準WPの参照データ

OCI 1237 上の基準WordPress(コンテナ `wpref`)から読み取りのみで取得した検証用データ。サーバー側は変更していない。

- 取得日: 2026-10-28
- WordPress: 7.1.3 (`wp core version` で確認)
- テーマ: twentytwentyfive 1.5 (style.css のヘッダで確認)
- 投稿データ: 検証用の架空データ

## ファイル

| ファイル | 内容 |
|---|---|
| spike-blocks.html | `/spike-blocks/` の描画HTML |
| home.html | `/` の描画HTML |
| feed.xml | `/feed/` のRSS |
| posts.json | `/wp-json/wp/v2/posts` のREST応答 |
| spike-blocks.post_content.html | 投稿ID 5 の post_content (生のブロックマークアップ) |
| posts-list.json | 投稿一覧 (ID, post_title, post_name, post_status, post_date_gmt) |
| themes/twentytwentyfive/ | テーマのうち templates, parts, patterns, styles, theme.json, style.css, functions.php のみ |

テーマ全量は約7.9MBあり5MBを超えるため、アセット(画像・フォント)を除外した。

## 再取得手順

`<REF_HOST>` は基準サーバーのホスト、`<KEY>` は SSH 秘密鍵のパスに置き換える。

```sh
SSH="ssh -i <KEY> -o BatchMode=yes ubuntu@<REF_HOST>"
cd fixtures/ref

$SSH 'curl -s http://127.0.0.1:8080/spike-blocks/' > spike-blocks.html
$SSH 'curl -s http://127.0.0.1:8080/' > home.html
$SSH 'curl -s http://127.0.0.1:8080/feed/' > feed.xml
$SSH 'curl -s http://127.0.0.1:8080/wp-json/wp/v2/posts' > posts.json

$SSH 'sudo docker exec -u www-data wpref wp --path=/var/www/html post get 5 --field=post_content' > spike-blocks.post_content.html
$SSH 'sudo docker exec -u www-data wpref wp --path=/var/www/html post list --format=json --fields=ID,post_title,post_name,post_status,post_date_gmt' > posts-list.json

# テーマ (アセット除外: 一部のみ取得)
mkdir -p themes/twentytwentyfive
$SSH 'sudo docker exec wpref tar c -C /var/www/html/wp-content/themes/twentytwentyfive templates parts patterns styles theme.json style.css functions.php' | tar x -C themes/twentytwentyfive
```

注意: 全量テーマ(`tar c -C .../themes twentytwentyfive`)は転送が途中で切れ、不完全なアーカイブになった。上記のように必要なパスだけを指定して取得すること。

## ライセンス

- テーマ twentytwentyfive は GNU GPL v2 以降 (style.css ヘッダ: `License: GNU General Public License v2 or later`)。`themes/` 以下はこのライセンスに従う。
- それ以外のデータ(投稿・HTML・feed・REST応答)は検証用のスパイクデータ。取得時にメールアドレスを確認したところ、テーマ内のプレースホルダ(example.com)のみだった。

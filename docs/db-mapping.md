# 基準WP DBスキーマとの対応表 (ADR-017)

> 本ファイルは `tools/coverage/gen-db-mapping.mjs` が生成する。手で編集しない。
> 入力: `fixtures/ref/db/dump.sql` (基準側)、`packages/db/src/schema.sql` (現行側)、`docs/coverage/db-tables.csv` (core_cols 突合)。

## 再生成手順

```sh
cd <repo-root>
node tools/coverage/extract-schema.mjs   # dump.sql / schema.sql の CREATE 文のみをメモリDBに流し、PRAGMA で列・索引を抽出 -> tools/coverage/db-schema.json
node tools/coverage/gen-db-mapping.mjs   # db-schema.json から本ファイルを生成
```

- 抽出は `node:sqlite` の `:memory:` DB で行う。基準側は dump.sql から `CREATE TABLE ... STRICT;` の正規表現で 12 文を切り出す。INSERT 文は読まない。
- 索引は dump.sql に `CREATE INDEX` が無いため、基準側は PRIMARY KEY 由来のみ。現行側は `schema.sql` の `CREATE INDEX` / `UNIQUE` を含む。
- `db-schema.json` の `inputs` に入力ファイルの SHA-256 を記録している。

入力ハッシュ: dump.sql `fd1c5369aa0b702688b0b12375df9bed3b7d5ac24f90ddbad79edffe8b5a6cf9`, schema.sql `78ee6e3ea53fa649c93813e7593a7298302c7ca151305659e206802a668f6db8`

## 1. 基準WPスキーマ (dump.sql)

基準テーブル数: **12**, 列数合計: **94**

### wp_commentmeta

| # | 列名 | 型 | NULL | 既定値 | 主キー |
|---|---|---|---|---|---|
| 0 | `meta_id` | INTEGER | NOT NULL | (なし) | PK |
| 1 | `comment_id` | INTEGER | NOT NULL | `'0'` |  |
| 2 | `meta_key` | TEXT | NULL可 | (なし) |  |
| 3 | `meta_value` | TEXT | NULL可 | (なし) |  |

索引: なし (PRIMARY KEY を除く)。

### wp_comments

| # | 列名 | 型 | NULL | 既定値 | 主キー |
|---|---|---|---|---|---|
| 0 | `comment_ID` | INTEGER | NOT NULL | (なし) | PK |
| 1 | `comment_post_ID` | INTEGER | NOT NULL | `'0'` |  |
| 2 | `comment_author` | TEXT | NOT NULL | (なし) |  |
| 3 | `comment_author_email` | TEXT | NOT NULL | `''` |  |
| 4 | `comment_author_url` | TEXT | NOT NULL | `''` |  |
| 5 | `comment_author_IP` | TEXT | NOT NULL | `''` |  |
| 6 | `comment_date` | TEXT | NOT NULL | `'0000-00-00 00:00:00'` |  |
| 7 | `comment_date_gmt` | TEXT | NOT NULL | `'0000-00-00 00:00:00'` |  |
| 8 | `comment_content` | TEXT | NOT NULL | (なし) |  |
| 9 | `comment_karma` | INTEGER | NOT NULL | `'0'` |  |
| 10 | `comment_approved` | TEXT | NOT NULL | `'1'` |  |
| 11 | `comment_agent` | TEXT | NOT NULL | `''` |  |
| 12 | `comment_type` | TEXT | NOT NULL | `'comment'` |  |
| 13 | `comment_parent` | INTEGER | NOT NULL | `'0'` |  |
| 14 | `user_id` | INTEGER | NOT NULL | `'0'` |  |

索引: なし (PRIMARY KEY を除く)。

### wp_links

| # | 列名 | 型 | NULL | 既定値 | 主キー |
|---|---|---|---|---|---|
| 0 | `link_id` | INTEGER | NOT NULL | (なし) | PK |
| 1 | `link_url` | TEXT | NOT NULL | `''` |  |
| 2 | `link_name` | TEXT | NOT NULL | `''` |  |
| 3 | `link_image` | TEXT | NOT NULL | `''` |  |
| 4 | `link_target` | TEXT | NOT NULL | `''` |  |
| 5 | `link_description` | TEXT | NOT NULL | `''` |  |
| 6 | `link_visible` | TEXT | NOT NULL | `'Y'` |  |
| 7 | `link_owner` | INTEGER | NOT NULL | `'1'` |  |
| 8 | `link_rating` | INTEGER | NOT NULL | `'0'` |  |
| 9 | `link_updated` | TEXT | NOT NULL | `'0000-00-00 00:00:00'` |  |
| 10 | `link_rel` | TEXT | NOT NULL | `''` |  |
| 11 | `link_notes` | TEXT | NOT NULL | (なし) |  |
| 12 | `link_rss` | TEXT | NOT NULL | `''` |  |

索引: なし (PRIMARY KEY を除く)。

### wp_options

| # | 列名 | 型 | NULL | 既定値 | 主キー |
|---|---|---|---|---|---|
| 0 | `option_id` | INTEGER | NOT NULL | (なし) | PK |
| 1 | `option_name` | TEXT | NOT NULL | `''` |  |
| 2 | `option_value` | TEXT | NOT NULL | (なし) |  |
| 3 | `autoload` | TEXT | NOT NULL | `'yes'` |  |

索引: なし (PRIMARY KEY を除く)。

### wp_postmeta

| # | 列名 | 型 | NULL | 既定値 | 主キー |
|---|---|---|---|---|---|
| 0 | `meta_id` | INTEGER | NOT NULL | (なし) | PK |
| 1 | `post_id` | INTEGER | NOT NULL | `'0'` |  |
| 2 | `meta_key` | TEXT | NULL可 | (なし) |  |
| 3 | `meta_value` | TEXT | NULL可 | (なし) |  |

索引: なし (PRIMARY KEY を除く)。

### wp_posts

| # | 列名 | 型 | NULL | 既定値 | 主キー |
|---|---|---|---|---|---|
| 0 | `ID` | INTEGER | NOT NULL | (なし) | PK |
| 1 | `post_author` | INTEGER | NOT NULL | `'0'` |  |
| 2 | `post_date` | TEXT | NOT NULL | `'0000-00-00 00:00:00'` |  |
| 3 | `post_date_gmt` | TEXT | NOT NULL | `'0000-00-00 00:00:00'` |  |
| 4 | `post_content` | TEXT | NOT NULL | (なし) |  |
| 5 | `post_title` | TEXT | NOT NULL | (なし) |  |
| 6 | `post_excerpt` | TEXT | NOT NULL | (なし) |  |
| 7 | `post_status` | TEXT | NOT NULL | `'publish'` |  |
| 8 | `comment_status` | TEXT | NOT NULL | `'open'` |  |
| 9 | `ping_status` | TEXT | NOT NULL | `'open'` |  |
| 10 | `post_password` | TEXT | NOT NULL | `''` |  |
| 11 | `post_name` | TEXT | NOT NULL | `''` |  |
| 12 | `to_ping` | TEXT | NOT NULL | (なし) |  |
| 13 | `pinged` | TEXT | NOT NULL | (なし) |  |
| 14 | `post_modified` | TEXT | NOT NULL | `'0000-00-00 00:00:00'` |  |
| 15 | `post_modified_gmt` | TEXT | NOT NULL | `'0000-00-00 00:00:00'` |  |
| 16 | `post_content_filtered` | TEXT | NOT NULL | (なし) |  |
| 17 | `post_parent` | INTEGER | NOT NULL | `'0'` |  |
| 18 | `guid` | TEXT | NOT NULL | `''` |  |
| 19 | `menu_order` | INTEGER | NOT NULL | `'0'` |  |
| 20 | `post_type` | TEXT | NOT NULL | `'post'` |  |
| 21 | `post_mime_type` | TEXT | NOT NULL | `''` |  |
| 22 | `comment_count` | INTEGER | NOT NULL | `'0'` |  |

索引: なし (PRIMARY KEY を除く)。

### wp_term_relationships

| # | 列名 | 型 | NULL | 既定値 | 主キー |
|---|---|---|---|---|---|
| 0 | `object_id` | INTEGER | NOT NULL | `'0'` | PK |
| 1 | `term_taxonomy_id` | INTEGER | NOT NULL | `'0'` | PK(2) |
| 2 | `term_order` | INTEGER | NOT NULL | `'0'` |  |

索引 (PRAGMA index_list / index_info):

- `sqlite_autoindex_wp_term_relationships_1` (origin=pk, unique=true): (object_id, term_taxonomy_id)

### wp_term_taxonomy

| # | 列名 | 型 | NULL | 既定値 | 主キー |
|---|---|---|---|---|---|
| 0 | `term_taxonomy_id` | INTEGER | NOT NULL | (なし) | PK |
| 1 | `term_id` | INTEGER | NOT NULL | `'0'` |  |
| 2 | `taxonomy` | TEXT | NOT NULL | `''` |  |
| 3 | `description` | TEXT | NOT NULL | (なし) |  |
| 4 | `parent` | INTEGER | NOT NULL | `'0'` |  |
| 5 | `count` | INTEGER | NOT NULL | `'0'` |  |

索引: なし (PRIMARY KEY を除く)。

### wp_termmeta

| # | 列名 | 型 | NULL | 既定値 | 主キー |
|---|---|---|---|---|---|
| 0 | `meta_id` | INTEGER | NOT NULL | (なし) | PK |
| 1 | `term_id` | INTEGER | NOT NULL | `'0'` |  |
| 2 | `meta_key` | TEXT | NULL可 | (なし) |  |
| 3 | `meta_value` | TEXT | NULL可 | (なし) |  |

索引: なし (PRIMARY KEY を除く)。

### wp_terms

| # | 列名 | 型 | NULL | 既定値 | 主キー |
|---|---|---|---|---|---|
| 0 | `term_id` | INTEGER | NOT NULL | (なし) | PK |
| 1 | `name` | TEXT | NOT NULL | `''` |  |
| 2 | `slug` | TEXT | NOT NULL | `''` |  |
| 3 | `term_group` | INTEGER | NOT NULL | `'0'` |  |

索引: なし (PRIMARY KEY を除く)。

### wp_usermeta

| # | 列名 | 型 | NULL | 既定値 | 主キー |
|---|---|---|---|---|---|
| 0 | `umeta_id` | INTEGER | NOT NULL | (なし) | PK |
| 1 | `user_id` | INTEGER | NOT NULL | `'0'` |  |
| 2 | `meta_key` | TEXT | NULL可 | (なし) |  |
| 3 | `meta_value` | TEXT | NULL可 | (なし) |  |

索引: なし (PRIMARY KEY を除く)。

### wp_users

| # | 列名 | 型 | NULL | 既定値 | 主キー |
|---|---|---|---|---|---|
| 0 | `ID` | INTEGER | NOT NULL | (なし) | PK |
| 1 | `user_login` | TEXT | NOT NULL | `''` |  |
| 2 | `user_pass` | TEXT | NOT NULL | `''` |  |
| 3 | `user_nicename` | TEXT | NOT NULL | `''` |  |
| 4 | `user_email` | TEXT | NOT NULL | `''` |  |
| 5 | `user_url` | TEXT | NOT NULL | `''` |  |
| 6 | `user_registered` | TEXT | NOT NULL | `'0000-00-00 00:00:00'` |  |
| 7 | `user_activation_key` | TEXT | NOT NULL | `''` |  |
| 8 | `user_status` | INTEGER | NOT NULL | `'0'` |  |
| 9 | `display_name` | TEXT | NOT NULL | `''` |  |

索引: なし (PRIMARY KEY を除く)。

## 2. 現行 schema.sql との対応

命名規則: 基準 `wp_X` は現行 `X` に対応づける (接頭辞 `wp_` を除去)。対応先が無ければ「なし」。

| 基準テーブル | 現行テーブル | 基準列数 | 現行列数 | 同名列 | 基準のみ(missing) | 現行のみ(extension) |
|---|---|---|---|---|---|---|
| `wp_commentmeta` | `commentmeta` | 4 | 4 | 4 | 0 | 0 |
| `wp_comments` | `comments` | 15 | 7 | 7 | 8 | 0 |
| `wp_links` | **なし** | 13 | - | 0 | 13 | 0 |
| `wp_options` | `options` | 4 | 4 | 4 | 0 | 0 |
| `wp_postmeta` | `postmeta` | 4 | 4 | 4 | 0 | 0 |
| `wp_posts` | `posts` | 23 | 15 | 13 | 10 | 2 |
| `wp_term_relationships` | `term_relationships` | 3 | 3 | 3 | 0 | 0 |
| `wp_term_taxonomy` | `term_taxonomy` | 6 | 6 | 6 | 0 | 0 |
| `wp_termmeta` | `termmeta` | 4 | 4 | 4 | 0 | 0 |
| `wp_terms` | `terms` | 4 | 3 | 3 | 1 | 0 |
| `wp_usermeta` | `usermeta` | 4 | 4 | 4 | 0 | 0 |
| `wp_users` | `users` | 10 | 7 | 7 | 3 | 0 |
| (なし) | `media_parents` | - | 2 | - | - | 拡張テーブル |
| (なし) | `usage_counter` | - | 4 | - | - | 拡張テーブル |

件数集計: 対応テーブル内の missing 列 **35**、extension 列 **2**。現行に対応先が無い基準テーブルの列 **13** (missing テーブル)。基準に対応が無い現行テーブルの列 **6** (拡張テーブル)。

## 3. 列の状態分類

- `same`: 基準と現行に同名の列がある。型・NULL・既定値の差は補足欄に記す(列の意味の一致までは保証しない)。
- `missing`: 基準にあり現行に無い列。
- `extension`: 現行にあり基準に無い列。

### wp_commentmeta -> commentmeta

| 状態 | 列名 | 基準 | 現行 | 補足 |
|---|---|---|---|---|
| same | `meta_id` | INTEGER NOT NULL | INTEGER | NULL NOT NULL -> NULL可 |
| same | `comment_id` | INTEGER NOT NULL | INTEGER NOT NULL | 既定値 '0' -> (なし) |
| same | `meta_key` | TEXT | TEXT |  |
| same | `meta_value` | TEXT | TEXT |  |

### wp_comments -> comments

| 状態 | 列名 | 基準 | 現行 | 補足 |
|---|---|---|---|---|
| same | `comment_ID` | INTEGER NOT NULL | INTEGER | NULL NOT NULL -> NULL可 |
| same | `comment_post_ID` | INTEGER NOT NULL | INTEGER NOT NULL | 既定値 '0' -> 0 |
| same | `comment_author` | TEXT NOT NULL | TEXT NOT NULL | 既定値 (なし) -> '' |
| missing | `comment_author_email` | TEXT NOT NULL | - |  |
| missing | `comment_author_url` | TEXT NOT NULL | - |  |
| missing | `comment_author_IP` | TEXT NOT NULL | - |  |
| missing | `comment_date` | TEXT NOT NULL | - |  |
| same | `comment_date_gmt` | TEXT NOT NULL | TEXT NOT NULL | 既定値 '0000-00-00 00:00:00' -> '' |
| same | `comment_content` | TEXT NOT NULL | TEXT NOT NULL | 既定値 (なし) -> '' |
| missing | `comment_karma` | INTEGER NOT NULL | - |  |
| same | `comment_approved` | TEXT NOT NULL | TEXT NOT NULL |  |
| missing | `comment_agent` | TEXT NOT NULL | - |  |
| missing | `comment_type` | TEXT NOT NULL | - |  |
| missing | `comment_parent` | INTEGER NOT NULL | - |  |
| same | `user_id` | INTEGER NOT NULL | INTEGER NOT NULL | 既定値 '0' -> 0 |

### wp_links -> (対応なし)

現行テーブルが無い。列 13 件はすべて missing 扱い。

### wp_options -> options

| 状態 | 列名 | 基準 | 現行 | 補足 |
|---|---|---|---|---|
| same | `option_id` | INTEGER NOT NULL | INTEGER | NULL NOT NULL -> NULL可 |
| same | `option_name` | TEXT NOT NULL | TEXT NOT NULL | 既定値 '' -> (なし) |
| same | `option_value` | TEXT NOT NULL | TEXT | NULL NOT NULL -> NULL可 |
| same | `autoload` | TEXT NOT NULL | TEXT NOT NULL |  |

### wp_postmeta -> postmeta

| 状態 | 列名 | 基準 | 現行 | 補足 |
|---|---|---|---|---|
| same | `meta_id` | INTEGER NOT NULL | INTEGER | NULL NOT NULL -> NULL可 |
| same | `post_id` | INTEGER NOT NULL | INTEGER NOT NULL | 既定値 '0' -> (なし) |
| same | `meta_key` | TEXT | TEXT |  |
| same | `meta_value` | TEXT | TEXT |  |

### wp_posts -> posts

| 状態 | 列名 | 基準 | 現行 | 補足 |
|---|---|---|---|---|
| same | `ID` | INTEGER NOT NULL | INTEGER | NULL NOT NULL -> NULL可 |
| same | `post_author` | INTEGER NOT NULL | INTEGER NOT NULL | 既定値 '0' -> 0 |
| missing | `post_date` | TEXT NOT NULL | - |  |
| same | `post_date_gmt` | TEXT NOT NULL | TEXT NOT NULL | 既定値 '0000-00-00 00:00:00' -> '' |
| same | `post_content` | TEXT NOT NULL | TEXT NOT NULL | 既定値 (なし) -> '' |
| same | `post_title` | TEXT NOT NULL | TEXT NOT NULL | 既定値 (なし) -> '' |
| same | `post_excerpt` | TEXT NOT NULL | TEXT NOT NULL | 既定値 (なし) -> '' |
| same | `post_status` | TEXT NOT NULL | TEXT NOT NULL | 既定値 'publish' -> 'draft' |
| missing | `comment_status` | TEXT NOT NULL | - |  |
| missing | `ping_status` | TEXT NOT NULL | - |  |
| same | `post_password` | TEXT NOT NULL | TEXT | NULL NOT NULL -> NULL可; 既定値 '' -> (なし) |
| same | `post_name` | TEXT NOT NULL | TEXT NOT NULL |  |
| missing | `to_ping` | TEXT NOT NULL | - |  |
| missing | `pinged` | TEXT NOT NULL | - |  |
| missing | `post_modified` | TEXT NOT NULL | - |  |
| same | `post_modified_gmt` | TEXT NOT NULL | TEXT NOT NULL | 既定値 '0000-00-00 00:00:00' -> '' |
| missing | `post_content_filtered` | TEXT NOT NULL | - |  |
| same | `post_parent` | INTEGER NOT NULL | INTEGER NOT NULL | 既定値 '0' -> 0 |
| missing | `guid` | TEXT NOT NULL | - |  |
| missing | `menu_order` | INTEGER NOT NULL | - |  |
| same | `post_type` | TEXT NOT NULL | TEXT NOT NULL |  |
| same | `post_mime_type` | TEXT NOT NULL | TEXT NOT NULL |  |
| missing | `comment_count` | INTEGER NOT NULL | - |  |
| extension | `auth_version` | - | INTEGER NOT NULL |  |
| extension | `visibility_epoch` | - | INTEGER NOT NULL |  |

### wp_term_relationships -> term_relationships

| 状態 | 列名 | 基準 | 現行 | 補足 |
|---|---|---|---|---|
| same | `object_id` | INTEGER NOT NULL | INTEGER NOT NULL | 既定値 '0' -> (なし) |
| same | `term_taxonomy_id` | INTEGER NOT NULL | INTEGER NOT NULL | 既定値 '0' -> (なし) |
| same | `term_order` | INTEGER NOT NULL | INTEGER NOT NULL | 既定値 '0' -> 0 |

### wp_term_taxonomy -> term_taxonomy

| 状態 | 列名 | 基準 | 現行 | 補足 |
|---|---|---|---|---|
| same | `term_taxonomy_id` | INTEGER NOT NULL | INTEGER | NULL NOT NULL -> NULL可 |
| same | `term_id` | INTEGER NOT NULL | INTEGER NOT NULL | 既定値 '0' -> (なし) |
| same | `taxonomy` | TEXT NOT NULL | TEXT NOT NULL |  |
| same | `description` | TEXT NOT NULL | TEXT NOT NULL | 既定値 (なし) -> '' |
| same | `parent` | INTEGER NOT NULL | INTEGER NOT NULL | 既定値 '0' -> 0 |
| same | `count` | INTEGER NOT NULL | INTEGER NOT NULL | 既定値 '0' -> 0 |

### wp_termmeta -> termmeta

| 状態 | 列名 | 基準 | 現行 | 補足 |
|---|---|---|---|---|
| same | `meta_id` | INTEGER NOT NULL | INTEGER | NULL NOT NULL -> NULL可 |
| same | `term_id` | INTEGER NOT NULL | INTEGER NOT NULL | 既定値 '0' -> (なし) |
| same | `meta_key` | TEXT | TEXT |  |
| same | `meta_value` | TEXT | TEXT |  |

### wp_terms -> terms

| 状態 | 列名 | 基準 | 現行 | 補足 |
|---|---|---|---|---|
| same | `term_id` | INTEGER NOT NULL | INTEGER | NULL NOT NULL -> NULL可 |
| same | `name` | TEXT NOT NULL | TEXT NOT NULL |  |
| same | `slug` | TEXT NOT NULL | TEXT NOT NULL |  |
| missing | `term_group` | INTEGER NOT NULL | - |  |

### wp_usermeta -> usermeta

| 状態 | 列名 | 基準 | 現行 | 補足 |
|---|---|---|---|---|
| same | `umeta_id` | INTEGER NOT NULL | INTEGER | NULL NOT NULL -> NULL可 |
| same | `user_id` | INTEGER NOT NULL | INTEGER NOT NULL | 既定値 '0' -> (なし) |
| same | `meta_key` | TEXT | TEXT |  |
| same | `meta_value` | TEXT | TEXT |  |

### wp_users -> users

| 状態 | 列名 | 基準 | 現行 | 補足 |
|---|---|---|---|---|
| same | `ID` | INTEGER NOT NULL | INTEGER | NULL NOT NULL -> NULL可 |
| same | `user_login` | TEXT NOT NULL | TEXT NOT NULL |  |
| same | `user_pass` | TEXT NOT NULL | TEXT NOT NULL |  |
| same | `user_nicename` | TEXT NOT NULL | TEXT NOT NULL |  |
| same | `user_email` | TEXT NOT NULL | TEXT NOT NULL |  |
| missing | `user_url` | TEXT NOT NULL | - |  |
| same | `user_registered` | TEXT NOT NULL | TEXT NOT NULL | 既定値 '0000-00-00 00:00:00' -> '' |
| missing | `user_activation_key` | TEXT NOT NULL | - |  |
| missing | `user_status` | INTEGER NOT NULL | - |  |
| same | `display_name` | TEXT NOT NULL | TEXT NOT NULL |  |

### (対応なし) -> media_parents

基準に対応テーブルが無い現行テーブル。列はすべて extension 扱い。

| 状態 | 列名 | 現行 |
|---|---|---|
| extension | `attachment_id` | INTEGER NOT NULL |
| extension | `parent_post_id` | INTEGER NOT NULL |

### (対応なし) -> usage_counter

基準に対応テーブルが無い現行テーブル。列はすべて extension 扱い。

| 状態 | 列名 | 現行 |
|---|---|---|
| extension | `key` | TEXT |
| extension | `period` | TEXT NOT NULL |
| extension | `used` | INTEGER NOT NULL |
| extension | `limit_value` | INTEGER NOT NULL |

### 基準のみ (現行テーブル無し)

- `wp_links`: 13 列 (missing テーブル)

## 4. 格納形式の注記

以下は `fixtures/ref/db/dump.sql` を `:memory:` DB に全件流して確認した値と、現行コードの記述を照合したもの。確認できなかった点は「未確認」と書く。

### 4.1 日時

- 基準: `post_date` と `post_date_gmt` はともに `TEXT NOT NULL DEFAULT '0000-00-00 00:00:00'`。dump の実データは `2026-10-27 22:51:42` 形式 (記事 7 件で post_date と post_date_gmt が一致)。`wp_comments.comment_date` 系も同じ形式を想定するが、dump の実データでは未確認。
- 現行: `packages/db/src/schema.sql` の冒頭コメントは「日時は UTC の ISO8601 TEXT」と記す。一方、`packages/db/src/latestPosts.test.ts`(23, 31, 37, 45, 51, 59 行目) の投入値は `2026-10-27 22:51:42` 形式 (T と Z なし)。`ORDER BY post_date_gmt` は文字列比較のため、形式が混在すると順序が崩れる。**不一致あり。どちらが正かは本ファイルでは決めない。**

### 4.2 列挙値

- 基準の `post_status` 実データ: `publish` 5 件, `draft` 1 件, `inherit` 1 件 (`wp_posts` 7 件)。`post_type` 実データ: `post`, `page`, `revision`, `wp_navigation`。
- 現行コードが参照する `post_status`: `publish`, `private`, `draft`, `pending`, `future`, `auto-draft`, `trash` (`packages/db/src/visiblePosts.ts` 28-30 行目)。`inherit` は `packages/core/src/canView.ts` 44 行目で「常に不可 (fail-closed)」として扱われ、`visiblePosts.test.ts` / `visiblePostsData.test.ts` の fixture にも現れる。
- 基準の `wp_comments.comment_approved` は TEXT 型で実データは `1` (1 件)。現行の型・値域は未確認。
- 基準の `wp_options.autoload` 実データ: `on` 101, `auto` 18, `off` 12 (計 131 件)。現行 `options.autoload` の既定値は `'yes'` (schema.sql)。**値域が不一致** (`yes` / `on` / `auto` / `off` のどれを正とするかは未決定)。

### 4.3 PHP シリアライズ値

- 基準の `wp_options.option_value` には PHP シリアライズ値 (`a:N:{...}`) が 33 件ある (例: `rewrite_rules`, `active_plugins`, `sticky_posts`)。
- `wp_usermeta.meta_value` にも PHP 由来の値が入る想定だが、dump での件数は未確認。
- 現行の `options` / `usermeta` の値をどう扱うか (そのまま保存するか、JSON 化するか) は `schema.sql` にも ADR にも記載が見当たらない。**未確認**。

### 4.4 その他の型

- 基準の列は `STRICT` テーブル。`COLLATE NOCASE` の TEXT 列 (例: `post_status`, `post_type`) がある。大文字小文字を区別しない比較になる点は現行側と突合していない (未確認)。

## 5. 独立拡張列の方針 (検討論点)

本節は論点の列挙のみ。決定は含まない。

- 現行 `posts` の拡張列 `auth_version`, `visibility_epoch` を、(a) 同じ `posts` 表に残す、(b) 別表 (例: `post_ext`) に分ける、(c) `postmeta` に格納する、の選択肢がある。
- 別表にする場合: 基準の `posts` 行との結合キーと、一括取得時の JOIN コストが論点。
- `postmeta` にする場合: 型 (数値比較) と索引 (`postmeta_meta_key` のみ) で、認可判定の速度に影響しうる。
- `usage_counter`, `media_parents` のような基準に無い表は、基準互換の範囲外として明示するか、ADR-017 の対象に含めるかが論点。
- 基準互換の検証 (coverage) で extension 列をどう扱うか (除外するか、差分として常に報告するか) も未決定。


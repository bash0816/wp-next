// db-schema.json(extract-schema.mjs の出力)から docs/db-mapping.md を生成する。
// 依存なし。表・列の値は JSON から機械的に埋める。散文(第4・5節の文言)のみ本スクリプトに書く。
//
// 使い方:
//   node tools/coverage/extract-schema.mjs   # 先に db-schema.json を作る
//   node tools/coverage/gen-db-mapping.mjs   # docs/db-mapping.md を書き出す

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const schema = JSON.parse(readFileSync(join(here, 'db-schema.json'), 'utf8'));
const OUT = join(root, 'docs/db-mapping.md');

const ref = schema.reference.tables;
const cur = schema.current.tables;
const curByName = new Map(cur.map((t) => [t.name, t]));

// 命名規則: 基準 wp_X -> 現行 X (接頭辞 wp_ を除去)。対応が無ければ null。
const mapName = (refName) => {
  const bare = refName.replace(/^wp_/, '');
  return curByName.has(bare) ? bare : null;
};
const refNames = new Set(ref.map((t) => t.name));
const curOnly = cur.filter((t) => !refNames.has('wp_' + t.name) && !ref.some((r) => r.name === 'wp_' + t.name));

const esc = (s) => (s === null || s === undefined ? '' : String(s).replace(/\|/g, '\\|').replace(/\n/g, ' '));
const fmtDefault = (d) => (d === null || d === undefined ? '(なし)' : '`' + esc(d) + '`');
const fmtBool = (b) => (b ? 'NOT NULL' : 'NULL可');
const pkLabel = (c) => (c.pk > 0 ? (c.pk > 1 ? `PK(${c.pk})` : 'PK') : '');

// ---- 列の状態分類 ----
const classify = (refTable, curTable) => {
  const refCols = new Map(refTable.columns.map((c) => [c.name, c]));
  const curCols = new Map(curTable ? curTable.columns.map((c) => [c.name, c]) : []);
  const rows = [];
  for (const c of refTable.columns) {
    const k = curCols.get(c.name);
    if (!k) rows.push({ state: 'missing', name: c.name, ref: c, cur: null, diff: '' });
    else {
      const diffs = [];
      if (c.type !== k.type) diffs.push(`型 ${c.type} -> ${k.type}`);
      if (c.notnull !== k.notnull) diffs.push(`NULL ${fmtBool(c.notnull)} -> ${fmtBool(k.notnull)}`);
      if (String(c.default) !== String(k.default)) diffs.push(`既定値 ${c.default ?? '(なし)'} -> ${k.default ?? '(なし)'}`);
      rows.push({ state: 'same', name: c.name, ref: c, cur: k, diff: diffs.join('; ') });
    }
  }
  if (curTable) {
    for (const k of curTable.columns) {
      if (!refCols.has(k.name)) rows.push({ state: 'extension', name: k.name, ref: null, cur: k, diff: '' });
    }
  }
  return rows;
};

// ---- 本体 ----
const out = [];
const p = (s = '') => out.push(s);

p('# 基準WP DBスキーマとの対応表 (ADR-017)');
p();
p('> 本ファイルは `tools/coverage/gen-db-mapping.mjs` が生成する。手で編集しない。');
p('> 入力: `fixtures/ref/db/dump.sql` (基準側)、`packages/db/src/schema.sql` (現行側)、`docs/coverage/db-tables.csv` (core_cols 突合)。');
p();
p('## 再生成手順');
p();
p('```sh');
p('cd <repo-root>');
p('node tools/coverage/extract-schema.mjs   # dump.sql / schema.sql の CREATE 文のみをメモリDBに流し、PRAGMA で列・索引を抽出 -> tools/coverage/db-schema.json');
p('node tools/coverage/gen-db-mapping.mjs   # db-schema.json から本ファイルを生成');
p('```');
p();
p('- 抽出は `node:sqlite` の `:memory:` DB で行う。基準側は dump.sql から `CREATE TABLE ... STRICT;` の正規表現で 12 文を切り出す。INSERT 文は読まない。');
p('- 索引は dump.sql に `CREATE INDEX` が無いため、基準側は PRIMARY KEY 由来のみ。現行側は `schema.sql` の `CREATE INDEX` / `UNIQUE` を含む。');
p('- `db-schema.json` の `inputs` に入力ファイルの SHA-256 を記録している。');
p();
p(`入力ハッシュ: dump.sql \`${schema.inputs.dump.sha256}\`, schema.sql \`${schema.inputs.current.sha256}\``);
p();

// 1. 基準側の列定義
p('## 1. 基準WPスキーマ (dump.sql)');
p();
p(`基準テーブル数: **${schema.checks.reference_table_count}**, 列数合計: **${schema.checks.reference_column_total}**`);
p();
for (const t of ref) {
  p(`### ${t.name}`);
  p();
  p('| # | 列名 | 型 | NULL | 既定値 | 主キー |');
  p('|---|---|---|---|---|---|');
  for (const c of t.columns) {
    p(`| ${c.cid} | \`${c.name}\` | ${c.type} | ${fmtBool(c.notnull)} | ${fmtDefault(c.default)} | ${pkLabel(c)} |`);
  }
  p();
  if (t.indexes.length === 0) p('索引: なし (PRIMARY KEY を除く)。');
  else {
    p('索引 (PRAGMA index_list / index_info):');
    p();
    for (const i of t.indexes) p(`- \`${i.name}\` (origin=${i.origin}, unique=${i.unique}): (${i.columns.join(', ')})`);
  }
  p();
}

// 2. 対応関係
p('## 2. 現行 schema.sql との対応');
p();
p('命名規則: 基準 `wp_X` は現行 `X` に対応づける (接頭辞 `wp_` を除去)。対応先が無ければ「なし」。');
p();
p('| 基準テーブル | 現行テーブル | 基準列数 | 現行列数 | 同名列 | 基準のみ(missing) | 現行のみ(extension) |');
p('|---|---|---|---|---|---|---|');
const mapping = [];
for (const t of ref) {
  const m = mapName(t.name);
  const ct = m ? curByName.get(m) : null;
  const rows = classify(t, ct);
  const same = rows.filter((r) => r.state === 'same').length;
  const miss = rows.filter((r) => r.state === 'missing').length;
  const ext = rows.filter((r) => r.state === 'extension').length;
  mapping.push({ t, m, ct, rows, same, miss, ext });
  p(`| \`${t.name}\` | ${m ? '`' + m + '`' : '**なし**'} | ${t.columns.length} | ${ct ? ct.columns.length : '-'} | ${same} | ${miss} | ${ext} |`);
}
for (const c of curOnly) {
  p(`| (なし) | \`${c.name}\` | - | ${c.columns.length} | - | - | 拡張テーブル |`);
}
p();
const totalMissingMapped = mapping.reduce((s, x) => s + x.miss, 0);
const totalExtMapped = mapping.reduce((s, x) => s + x.ext, 0);
const unmappedRefCols = mapping.filter((x) => !x.ct).reduce((s, x) => s + x.t.columns.length, 0);
const extTableCols = curOnly.reduce((s, c) => s + c.columns.length, 0);
p(`件数集計: 対応テーブル内の missing 列 **${totalMissingMapped}**、extension 列 **${totalExtMapped}**。現行に対応先が無い基準テーブルの列 **${unmappedRefCols}** (missing テーブル)。基準に対応が無い現行テーブルの列 **${extTableCols}** (拡張テーブル)。`);
p();

// 3. 列状態の一覧
p('## 3. 列の状態分類');
p();
p('- `same`: 基準と現行に同名の列がある。型・NULL・既定値の差は補足欄に記す(列の意味の一致までは保証しない)。');
p('- `missing`: 基準にあり現行に無い列。');
p('- `extension`: 現行にあり基準に無い列。');
p();
for (const x of mapping) {
  p(`### ${x.t.name} -> ${x.m ?? '(対応なし)'}`);
  p();
  if (!x.ct) {
    p(`現行テーブルが無い。列 ${x.t.columns.length} 件はすべて missing 扱い。`);
    p();
    continue;
  }
  p('| 状態 | 列名 | 基準 | 現行 | 補足 |');
  p('|---|---|---|---|---|');
  for (const r of x.rows) {
    const refDesc = r.ref ? `${r.ref.type}${r.ref.notnull ? ' NOT NULL' : ''}` : '-';
    const curDesc = r.cur ? `${r.cur.type}${r.cur.notnull ? ' NOT NULL' : ''}` : '-';
    p(`| ${r.state} | \`${r.name}\` | ${refDesc} | ${curDesc} | ${esc(r.diff)} |`);
  }
  p();
}
for (const c of curOnly) {
  p(`### (対応なし) -> ${c.name}`);
  p();
  p('基準に対応テーブルが無い現行テーブル。列はすべて extension 扱い。');
  p();
  p('| 状態 | 列名 | 現行 |');
  p('|---|---|---|');
  for (const k of c.columns) p(`| extension | \`${k.name}\` | ${k.type}${k.notnull ? ' NOT NULL' : ''} |`);
  p();
}
p('### 基準のみ (現行テーブル無し)');
p();
for (const x of mapping.filter((y) => !y.ct)) p(`- \`${x.t.name}\`: ${x.t.columns.length} 列 (missing テーブル)`);
p();

// 4. 格納形式
p('## 4. 格納形式の注記');
p();
p('以下は `fixtures/ref/db/dump.sql` を `:memory:` DB に全件流して確認した値と、現行コードの記述を照合したもの。確認できなかった点は「未確認」と書く。');
p();
p('### 4.1 日時');
p();
p('- 基準: `post_date` と `post_date_gmt` はともに `TEXT NOT NULL DEFAULT \'0000-00-00 00:00:00\'`。dump の実データは `2026-10-27 22:51:42` 形式 (記事 7 件で post_date と post_date_gmt が一致)。`wp_comments.comment_date` 系も同じ形式を想定するが、dump の実データでは未確認。');
p('- 現行: `packages/db/src/schema.sql` の冒頭コメントは「日時は UTC の ISO8601 TEXT」と記す。一方、`packages/db/src/latestPosts.test.ts`(23, 31, 37, 45, 51, 59 行目) の投入値は `2026-10-27 22:51:42` 形式 (T と Z なし)。`ORDER BY post_date_gmt` は文字列比較のため、形式が混在すると順序が崩れる。**不一致あり。どちらが正かは本ファイルでは決めない。**');
p();
p('### 4.2 列挙値');
p();
p('- 基準の `post_status` 実データ: `publish` 5 件, `draft` 1 件, `inherit` 1 件 (`wp_posts` 7 件)。`post_type` 実データ: `post`, `page`, `revision`, `wp_navigation`。');
p('- 現行コードが参照する `post_status`: `publish`, `private`, `draft`, `pending`, `future`, `auto-draft`, `trash` (`packages/db/src/visiblePosts.ts` 28-30 行目)。`inherit` は `packages/core/src/canView.ts` 44 行目で「常に不可 (fail-closed)」として扱われ、`visiblePosts.test.ts` / `visiblePostsData.test.ts` の fixture にも現れる。');
p('- 基準の `wp_comments.comment_approved` は TEXT 型で実データは `1` (1 件)。現行の型・値域は未確認。');
p('- 基準の `wp_options.autoload` 実データ: `on` 101, `auto` 18, `off` 12 (計 131 件)。現行 `options.autoload` の既定値は `\'yes\'` (schema.sql)。**値域が不一致** (`yes` / `on` / `auto` / `off` のどれを正とするかは未決定)。');
p();
p('### 4.3 PHP シリアライズ値');
p();
p('- 基準の `wp_options.option_value` には PHP シリアライズ値 (`a:N:{...}`) が 33 件ある (例: `rewrite_rules`, `active_plugins`, `sticky_posts`)。');
p('- `wp_usermeta.meta_value` にも PHP 由来の値が入る想定だが、dump での件数は未確認。');
p('- 現行の `options` / `usermeta` の値をどう扱うか (そのまま保存するか、JSON 化するか) は `schema.sql` にも ADR にも記載が見当たらない。**未確認**。');
p();
p('### 4.4 その他の型');
p();
p('- 基準の列は `STRICT` テーブル。`COLLATE NOCASE` の TEXT 列 (例: `post_status`, `post_type`) がある。大文字小文字を区別しない比較になる点は現行側と突合していない (未確認)。');
p();

// 5. 独立拡張列の方針
p('## 5. 独立拡張列の方針 (検討論点)');
p();
p('本節は論点の列挙のみ。決定は含まない。');
p();
p('- 現行 `posts` の拡張列 `auth_version`, `visibility_epoch` を、(a) 同じ `posts` 表に残す、(b) 別表 (例: `post_ext`) に分ける、(c) `postmeta` に格納する、の選択肢がある。');
p('- 別表にする場合: 基準の `posts` 行との結合キーと、一括取得時の JOIN コストが論点。');
p('- `postmeta` にする場合: 型 (数値比較) と索引 (`postmeta_meta_key` のみ) で、認可判定の速度に影響しうる。');
p('- `usage_counter`, `media_parents` のような基準に無い表は、基準互換の範囲外として明示するか、ADR-017 の対象に含めるかが論点。');
p('- 基準互換の検証 (coverage) で extension 列をどう扱うか (除外するか、差分として常に報告するか) も未決定。');
p();

writeFileSync(OUT, out.join('\n') + '\n', 'utf8');
console.log(`wrote ${OUT}`);
console.log(`reference tables: ${ref.length}, reference columns: ${schema.checks.reference_column_total}`);
console.log(`mapped missing=${totalMissingMapped} extension=${totalExtMapped}; unmapped ref cols=${unmappedRefCols}; ext-only table cols=${extTableCols}`);

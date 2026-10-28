// 基準WP(fixtures/ref/db/dump.sql)の CREATE TABLE を機械的に抽出し、
// 現行 packages/db/src/schema.sql と合わせて JSON に書き出す。依存なし(node:sqlite)。
//
// 使い方:  node tools/coverage/extract-schema.mjs
// 出力:    tools/coverage/db-schema.json
//
// 手順:
//  1. dump.sql から CREATE TABLE 文(STRICT 付き)だけを正規表現で切り出す。INSERT は読まない。
//  2. メモリDB(:memory:)に CREATE 文だけを流す。
//  3. PRAGMA table_info / index_list / index_info で列・索引を取得する。
//  4. 現行 schema.sql もメモリDBに流して同じ方法で取得する。
//  5. db-tables.csv の core_cols と基準側の列数を突き合わせる。

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const DUMP = join(root, 'fixtures/ref/db/dump.sql');
const CURRENT = join(root, 'packages/db/src/schema.sql');
const TABLES_CSV = join(root, 'docs/coverage/db-tables.csv');
const OUT = join(here, 'db-schema.json');

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// ---- 1. 基準: CREATE TABLE だけを切り出す ----
const dumpBuf = readFileSync(DUMP);
const dumpText = dumpBuf.toString('utf8');
const createRe = /^CREATE TABLE `(\w+)` \([\s\S]*?\) STRICT;$/gm;
const refCreates = [...dumpText.matchAll(createRe)].map((m) => ({ name: m[1], sql: m[0] }));
if (refCreates.length !== 12) {
  throw new Error(`基準の CREATE TABLE が ${refCreates.length} 件(期待 12)`);
}

// ---- 2. メモリDBへ流す ----
const refDb = new DatabaseSync(':memory:');
for (const c of refCreates) refDb.exec(c.sql);

const curDb = new DatabaseSync(':memory:');
const curText = readFileSync(CURRENT, 'utf8');
curDb.exec(curText);

// ---- 3-4. 列・索引の取得 ----
function introspect(db, name) {
  const cols = db
    .prepare(`PRAGMA table_info("${name}")`)
    .all()
    .map((c) => ({
      cid: c.cid,
      name: c.name,
      type: c.type,
      notnull: Boolean(c.notnull),
      default: c.dflt_value, // SQL式の文字列(例: '0')。無ければ null
      pk: c.pk, // 0 = 主キー外、1以上 = 複合主キー内の順序
    }));
  const indexes = db
    .prepare(`PRAGMA index_list("${name}")`)
    .all()
    .map((i) => ({
      name: i.name,
      unique: Boolean(i.unique),
      // c = CREATE INDEX, u = UNIQUE 制約, pk = PRIMARY KEY 由来
      origin: i.origin,
      partial: Boolean(i.partial),
      columns: db
        .prepare(`PRAGMA index_info("${i.name}")`)
        .all()
        .sort((a, b) => a.seqno - b.seqno)
        .map((x) => x.name),
    }));
  const primaryKey = cols
    .filter((c) => c.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((c) => c.name);
  return { columns: cols, primaryKey, indexes };
}

const listTables = (db) =>
  db
    .prepare(`SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
    .all()
    .map((r) => r.name);

const ref = {
  tables: refCreates.map((c) => ({ name: c.name, ...introspect(refDb, c.name) })),
};
const current = {
  tables: listTables(curDb).map((name) => ({ name, ...introspect(curDb, name) })),
};

// ---- 5. core_cols との突合 ----
const csvLines = readFileSync(TABLES_CSV, 'utf8').trim().split('\n').slice(1);
const coreColsByTable = Object.fromEntries(
  csvLines.map((line) => {
    const f = line.split(',');
    const notes = f.slice(5).join(',');
    const m = /core_cols=(\d+)/.exec(notes);
    return [f[1], m ? Number(m[1]) : null];
  }),
);
const colCheck = ref.tables.map((t) => ({
  table: t.name,
  extracted_cols: t.columns.length,
  csv_core_cols: coreColsByTable[t.name] ?? null,
  match: coreColsByTable[t.name] === t.columns.length,
}));

const out = {
  generated_by: 'tools/coverage/extract-schema.mjs',
  inputs: {
    dump: { path: 'fixtures/ref/db/dump.sql', sha256: sha256(dumpBuf) },
    current: { path: 'packages/db/src/schema.sql', sha256: sha256(Buffer.from(curText, 'utf8')) },
    csv: { path: 'docs/coverage/db-tables.csv' },
  },
  reference: ref,
  current,
  checks: {
    reference_table_count: ref.tables.length,
    reference_column_total: ref.tables.reduce((s, t) => s + t.columns.length, 0),
    core_cols_match: colCheck,
    core_cols_all_match: colCheck.every((c) => c.match),
  },
};

writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');

console.log(`wrote ${OUT}`);
console.log(`reference tables: ${out.checks.reference_table_count}`);
console.log(`reference column total: ${out.checks.reference_column_total}`);
console.log(`current tables: ${current.tables.map((t) => t.name).join(', ')}`);
for (const c of colCheck) {
  console.log(`${c.table}\textracted=${c.extracted_cols}\tcsv_core_cols=${c.csv_core_cols}\t${c.match ? 'MATCH' : 'MISMATCH'}`);
}

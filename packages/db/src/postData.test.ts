// SPDX-License-Identifier: GPL-3.0-only
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { openDumpDb, updateRow } from './dumpDb.js';
import { UnsupportedDataError, formatPostDate, readHome } from './postData.js';

// テストは fixtures の HTML を readFileSync + 正規表現で読む(全体を出力しない)。
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const main02 = readFileSync(join(repoRoot, 'fixtures/ref/regions/main-02.html'), 'utf8');

// fixtures/ref/regions/main-02.html の post-<id> の li 内の <time> を取り出す。
function timeOf(postId: number): { datetime: string; text: string } {
  const re = new RegExp(
    `class="wp-block-post post-${postId} [^"]*"[\\s\\S]*?<time datetime="([^"]+)">([^<]+)</time>`,
  );
  const m = re.exec(main02);
  if (!m) throw new Error(`main-02.html に post-${postId} の time が見つからない`);
  return { datetime: m[1]!, text: m[2]! };
}

function setOption(db: DatabaseSync, name: string, value: string): void {
  db.prepare('UPDATE options SET option_value = ? WHERE option_name = ?').run(value, name);
}

function deleteOption(db: DatabaseSync, name: string): void {
  db.prepare('DELETE FROM options WHERE option_name = ?').run(name);
}

function gmtOf(db: DatabaseSync, postId: number): string {
  const row = db
    .prepare('SELECT post_date_gmt AS g FROM posts WHERE ID = ?')
    .get(postId) as { g: string } | undefined;
  if (!row) throw new Error(`post ${postId} が dump にない`);
  return row.g;
}

describe('D3b1-01 formatPostDate: 基準 options での整形', () => {
  it('dump の post 7 の post_date_gmt を main-02.html の time と一致させる', () => {
    const db = openDumpDb();
    const gmt = gmtOf(db, 7);
    const t = timeOf(7);
    // 出典: fixtures/ref/regions/main-02.html の post-7 の <time>。
    expect(t.datetime).toBe('2026-10-27T23:38:31+00:00');
    expect(t.text).toBe('October 27, 2026');
    expect(gmt).toBe('2026-10-27 23:38:31');
    expect(formatPostDate(db, gmt)).toEqual({ dateIso: t.datetime, dateText: t.text });
  });

  it('ISO8601 UTC の入力(Z 付き)も同じ結果になる', () => {
    const db = openDumpDb();
    expect(formatPostDate(db, '2026-10-27T23:38:31Z')).toEqual({
      dateIso: '2026-10-27T23:38:31+00:00',
      dateText: 'October 27, 2026',
    });
  });

  // 全12か月の 5 日と末日(2026 は閉年ではないので 2 月は 28 日)。日の先頭ゼロなしを確認する。
  const months: Array<[string, string, number]> = [
    ['01', 'January', 31],
    ['02', 'February', 28],
    ['03', 'March', 31],
    ['04', 'April', 30],
    ['05', 'May', 31],
    ['06', 'June', 30],
    ['07', 'July', 31],
    ['08', 'August', 31],
    ['09', 'September', 30],
    ['10', 'October', 31],
    ['11', 'November', 30],
    ['12', 'December', 31],
  ];
  const cases = months.flatMap(([mm, name, last]) => [
    [mm, 5, name],
    [mm, last, name],
  ] as const);

  it.each(cases)('2026-%s の %i 日は "%s %i, 2026" と整形される', (mm, day, name) => {
    const db = openDumpDb();
    const dd = String(day).padStart(2, '0');
    const gmt = `2026-${mm}-${dd} 12:34:56`;
    expect(formatPostDate(db, gmt)).toEqual({
      dateIso: `2026-${mm}-${dd}T12:34:56+00:00`,
      dateText: `${name} ${day}, 2026`,
    });
  });
});

describe('D3b1-02 formatPostDate: 基準と違う options / 不正な日付は UnsupportedDataError', () => {
  const optionCases: Array<[string, (db: DatabaseSync) => void]> = [
    ['timezone_string=Asia/Tokyo', (db) => setOption(db, 'timezone_string', 'Asia/Tokyo')],
    ['gmt_offset=9', (db) => setOption(db, 'gmt_offset', '9')],
    ['date_format=Y-m-d', (db) => setOption(db, 'date_format', 'Y-m-d')],
    ['timezone_string 未設定', (db) => deleteOption(db, 'timezone_string')],
    ['gmt_offset 未設定', (db) => deleteOption(db, 'gmt_offset')],
    ['date_format 未設定', (db) => deleteOption(db, 'date_format')],
  ];

  it.each(optionCases)('%s なら UnsupportedDataError', (_label, mutate) => {
    const db = openDumpDb();
    mutate(db);
    expect(() => formatPostDate(db, '2026-10-27 23:38:31')).toThrow(UnsupportedDataError);
  });

  it.each(['', 'abc', '2026-13-40 00:00:00'])(
    '不正な日付文字列 %j は UnsupportedDataError',
    (bad) => {
      const db = openDumpDb();
      expect(() => formatPostDate(db, bad)).toThrow(UnsupportedDataError);
    },
  );
});

// D3b1-02 補強(STEP6 mutation 生存): 日付の境界値と home の末尾スラッシュ。
describe('D3b1-02 補強: 日付の境界と home', () => {
  const db = openDumpDb();
  it.each([
    '2026-00-10 00:00:00',
    '2026-13-10 00:00:00',
    '2026-01-00 00:00:00',
    '2026-01-32 00:00:00',
    '2026-02-29 00:00:00',
    '1900-02-29 00:00:00',
    '2026-04-31 00:00:00',
    '2026-06-31 00:00:00',
    '2026-09-31 00:00:00',
    '2026-11-31 00:00:00',
    '2026-01-10 24:00:00',
    '2026-01-10 00:60:00',
    '2026-01-10 00:00:60',
  ])('D3b1-02: %s は UnsupportedDataError', (gmt) => {
    expect(() => formatPostDate(db, gmt)).toThrow(UnsupportedDataError);
  });
  it.each([
    ['2024-02-29 00:00:00', 'February 29, 2024'],
    ['2000-02-29 12:00:00', 'February 29, 2000'],
    ['2026-02-28 23:59:59', 'February 28, 2026'],
    ['2026-04-30 00:00:00', 'April 30, 2026'],
    ['2026-06-30 00:00:00', 'June 30, 2026'],
    ['2026-09-30 00:00:00', 'September 30, 2026'],
    ['2026-11-30 00:00:00', 'November 30, 2026'],
    ['2026-12-31 23:59:59', 'December 31, 2026'],
  ])('D3b1-02: %s は受理され %s', (gmt, text) => {
    expect(formatPostDate(db, gmt).dateText).toBe(text);
  });
  it('D3b1-02: options.home の末尾スラッシュは除去され、URL が二重スラッシュにならない', () => {
    const d = openDumpDb();
    updateRow(d, 'options', 'option_name', 'home', { option_value: 'http://127.0.0.1:8080///' });
    expect(readHome(d)).toBe('http://127.0.0.1:8080');
  });
});

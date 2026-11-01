// SPDX-License-Identifier: GPL-3.0-only
import type { DatabaseSync } from 'node:sqlite';
import type { ContentPort, PostCtx } from '@wpn/core/ports';

export class UnsupportedDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedDataError';
  }
}

// 対応する WordPress 基準 options。これ以外の値・欠落は UnsupportedDataError にする。
const BASELINE_DATE_FORMAT = 'F j, Y';
const BASELINE_GMT_OFFSET = '0';
const BASELINE_TIMEZONE_STRING = '';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function readOption(db: Pick<DatabaseSync, 'prepare'>, name: string): string | null {
  const row = db.prepare('SELECT option_value AS v FROM options WHERE option_name = ?').get(name) as
    | { v: string | null }
    | undefined;
  if (!row) return null;
  return row.v ?? '';
}

function assertBaselineOptions(db: Pick<DatabaseSync, 'prepare'>): void {
  const checks: Array<[string, string]> = [
    ['timezone_string', BASELINE_TIMEZONE_STRING],
    ['gmt_offset', BASELINE_GMT_OFFSET],
    ['date_format', BASELINE_DATE_FORMAT],
  ];
  for (const [name, expected] of checks) {
    const actual = readOption(db, name);
    if (actual !== expected) {
      throw new UnsupportedDataError(
        `options.${name} が基準値 "${expected}" ではありません: ${String(actual)}`,
      );
    }
  }
}

// 'YYYY-MM-DD HH:MM:SS' または UTC の ISO8601('T' 区切り、末尾 Z 可)を受け付ける。
const GMT_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})Z?$/;

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

/**
 * post_date_gmt(UTC)を基準 options で整形する。
 * dateIso は 'YYYY-MM-DDTHH:MM:SS+00:00'、dateText は 'Month D, YYYY'(日の先頭ゼロなし)。
 */
export function formatPostDate(
  db: Pick<DatabaseSync, 'prepare'>,
  gmt: string,
): { dateIso: string; dateText: string } {
  assertBaselineOptions(db);
  const m = GMT_RE.exec(gmt);
  if (!m) throw new UnsupportedDataError(`post_date_gmt の形式が不正です: ${JSON.stringify(gmt)}`);
  const [y, mo, d, h, mi, s] = m.slice(1).map((v) => Number(v)) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo) || h > 23 || mi > 59 || s > 59) {
    throw new UnsupportedDataError(`post_date_gmt の値が不正です: ${JSON.stringify(gmt)}`);
  }
  const pad = (n: number): string => String(n).padStart(2, '0');
  const dateIso = `${String(y).padStart(4, '0')}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(s)}+00:00`;
  const dateText = `${MONTHS[mo - 1]} ${d}, ${y}`;
  return { dateIso, dateText };
}

/** options.home を末尾スラッシュなしで返す。 */
export function readHome(db: Pick<DatabaseSync, 'prepare'>): string {
  const home = readOption(db, 'home');
  if (home === null || home === '') throw new UnsupportedDataError('options.home がありません');
  return home.replace(/\/+$/, '');
}

export interface PostRowForCtx {
  id: number;
  slug: string;
  title: string;
  post_date_gmt: string;
  post_content: string;
  post_password: string | null;
  post_author: number;
}

const SLUG_RE = /^[a-z0-9-]+$/;
const SUPPORTED_FORMATS = new Set(['aside']);

interface TermRow {
  slug: string;
  taxonomy: string;
  format_slug?: string;
}

function termsOf(db: Pick<DatabaseSync, 'prepare'>, postId: number): TermRow[] {
  return db
    .prepare(
      `SELECT t.slug AS slug, tt.taxonomy AS taxonomy
         FROM term_relationships tr
         JOIN term_taxonomy tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
         JOIN terms t ON t.term_id = tt.term_id
        WHERE tr.object_id = ?
        ORDER BY t.name COLLATE NOCASE, t.slug`,
    )
    .all(postId) as unknown as TermRow[];
}

/**
 * 投稿のクラス名を WordPress の post_class 相当で組み立てる。
 * 形式: post-<id> post type-post status-publish format-<f> [post-password-required] hentry category-* tag-* [post_format-*]
 * category / tag は term 名の昇順(実測は 2 件の異名のみ)。
 * 非対応の term / 不正な slug は UnsupportedDataError。
 */
export function postClassName(db: Pick<DatabaseSync, 'prepare'>, postId: number, isProtected = false): string {
  const terms = termsOf(db, postId);
  const categories: string[] = [];
  const tags: string[] = [];
  let format: string | null = null;
  for (const t of terms) {
    if (t.taxonomy === 'category' || t.taxonomy === 'post_tag') {
      if (!SLUG_RE.test(t.slug)) {
        throw new UnsupportedDataError(`${t.taxonomy} の slug が非対応です: ${JSON.stringify(t.slug)}`);
      }
      (t.taxonomy === 'category' ? categories : tags).push(t.slug);
    } else if (t.taxonomy === 'post_format') {
      const f = t.slug.replace(/^post-format-/, '');
      if (!SUPPORTED_FORMATS.has(f)) {
        throw new UnsupportedDataError(`post_format が非対応です: ${JSON.stringify(t.slug)}`);
      }
      format = f;
    } else if (t.taxonomy === 'link_category') {
      throw new UnsupportedDataError('link_category の関連付けは非対応です');
    }
  }
  const parts = [`post-${postId}`, 'post', 'type-post', 'status-publish', `format-${format ?? 'standard'}`];
  if (isProtected) parts.push('post-password-required');
  parts.push('hentry');
  for (const c of categories) parts.push(`category-${c}`);
  for (const t of tags) parts.push(`tag-${t}`);
  if (format !== null) parts.push(`post_format-post-format-${format}`);
  return parts.join(' ');
}

/** post 行から PostCtx を組み立てる。protected は post_password が空でないこと。 */
export function buildPostCtx(db: Pick<DatabaseSync, 'prepare'>, row: PostRowForCtx): PostCtx {
  const home = readHome(db);
  const date = formatPostDate(db, row.post_date_gmt);
  const isProtected = row.post_password !== null && row.post_password !== '';
  return {
    id: row.id,
    title: row.title,
    url: `${home}/${encodeURIComponent(row.slug)}/`,
    protected: isProtected,
    className: postClassName(db, row.id, isProtected),
    dateIso: date.dateIso,
    dateText: date.dateText,
  };
}

/** sticky_posts や _thumbnail_id を持つ投稿は未対応として UnsupportedDataError にする。 */
export function assertNoStickyOrThumbnail(db: DatabaseSync, postId: number): void {
  const sticky = db
    .prepare("SELECT option_value AS v FROM options WHERE option_name = 'sticky_posts'")
    .get() as { v: string | null } | undefined;
  if (sticky?.v) {
    // PHP 直列化の整数配列 a:N:{i:K;i:V;…}。値 V(投稿 ID)だけを見る(添字 K との取り違えを避ける)。
    if (!/^a:\d+:\{(?:i:\d+;i:\d+;)*\}$/.test(sticky.v)) {
      throw new UnsupportedDataError('sticky_posts の形式が非対応です');
    }
    for (const m of sticky.v.matchAll(/i:\d+;i:(\d+);/g)) {
      if (Number(m[1]) === postId) {
        throw new UnsupportedDataError(`sticky_posts に post ${postId} があります(未対応)`);
      }
    }
  }
  const thumb = db
    .prepare("SELECT 1 AS x FROM postmeta WHERE post_id = ? AND meta_key = '_thumbnail_id'")
    .get(postId);
  if (thumb) {
    throw new UnsupportedDataError(`post ${postId} に _thumbnail_id があります(未対応)`);
  }
}

function unsupported(what: string): never {
  throw new UnsupportedDataError(`${what} は未対応です`);
}

interface ContentTermRow {
  name: string;
  slug: string;
  parent: number;
}

/** 投稿に付いた category / post_tag を name 昇順・同名は slug 昇順で返す。 */
function contentTermsOf(
  db: Pick<DatabaseSync, 'prepare'>,
  postId: number,
  taxonomy: 'category' | 'post_tag',
): Array<{ name: string; slug: string; url: string }> {
  const home = readHome(db);
  const rows = db
    .prepare(
      `SELECT t.name AS name, t.slug AS slug, tt.parent AS parent
         FROM term_relationships tr
         JOIN term_taxonomy tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
         JOIN terms t ON t.term_id = tt.term_id
        WHERE tr.object_id = ? AND tt.taxonomy = ?
        ORDER BY t.name COLLATE NOCASE, t.slug`,
    )
    .all(postId, taxonomy) as unknown as ContentTermRow[];
  const segment = taxonomy === 'category' ? 'category' : 'tag';
  return rows.map((r) => {
    if (!SLUG_RE.test(r.slug)) {
      throw new UnsupportedDataError(`${taxonomy} の slug が非対応です: ${JSON.stringify(r.slug)}`);
    }
    if (r.parent !== 0) {
      throw new UnsupportedDataError(`${taxonomy} ${r.slug} に親があります(未対応)`);
    }
    return { name: r.name, slug: r.slug, url: `${home}/${segment}/${r.slug}/` };
  });
}

/** post_author が 0 または存在しないユーザーなら null。 */
function authorOf(
  db: Pick<DatabaseSync, 'prepare'>,
  authorId: number,
): { name: string; url: string } | null {
  if (authorId === 0) return null;
  const u = db
    .prepare('SELECT user_nicename AS nicename, display_name AS name FROM users WHERE ID = ?')
    .get(authorId) as { nicename: string; name: string } | undefined;
  if (!u) return null;
  if (u.name === '') throw new UnsupportedDataError(`著者 ${authorId} の display_name が空です`);
  if (!SLUG_RE.test(u.nicename)) {
    throw new UnsupportedDataError(`著者 ${authorId} の user_nicename が非対応です: ${JSON.stringify(u.nicename)}`);
  }
  return { name: u.name, url: `${readHome(db)}/author/${u.nicename}/` };
}

/**
 * 投稿 row に束縛された ContentPort。terms / author / hasThumbnail を対応し、
 * adjacent / commentsState は未対応として UnsupportedDataError を投げる。
 */
export function buildContentPort(db: Pick<DatabaseSync, 'prepare'>, row: PostRowForCtx): ContentPort {
  return {
    contentOf: () => row.post_content,
    terms: (taxonomy) => {
      if (taxonomy !== 'category' && taxonomy !== 'post_tag') {
        throw new RangeError('taxonomy は "category" か "post_tag" で指定してください');
      }
      return contentTermsOf(db, row.id, taxonomy);
    },
    adjacent: () => unsupported('adjacent()'),
    commentsState: () => unsupported('commentsState()'),
    hasThumbnail: () => {
      const thumb = db
        .prepare("SELECT 1 AS x FROM postmeta WHERE post_id = ? AND meta_key = '_thumbnail_id'")
        .get(row.id);
      return thumb !== undefined;
    },
    author: () => authorOf(db, row.post_author),
  };
}

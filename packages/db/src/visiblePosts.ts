// SPDX-License-Identifier: GPL-3.0-only
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { Actor } from '@wpn/core/canView';

// canView.ts の判定規則を WHERE 句に写したもの。規則を変えるときは両方を同時に変更する。
// status ごとの分岐:
//   publish        : パスワードなし、または edit_others / 作者 / 解錠(ID と auth_version が一致) なら可視
//   private        : 作者、または read_private_posts
//   draft 系      : 作者、または edit_others_posts
//   それ以外       : 不可視

export interface VisibleWhere {
  /** WHERE 句の条件式本体(外側の括弧は呼び出し側で付ける) */
  readonly sql: string;
  readonly params: SQLInputValue[];
}

export function visibleWhere(actor: Actor): VisibleWhere {
  const canEditOthers = actor.caps.has('edit_others_posts') ? 1 : 0;
  const canReadPrivate = actor.caps.has('read_private_posts') ? 1 : 0;
  const userId = actor.userId;

  const unlocked = [...(actor.unlockedPosts ?? [])];
  const unlockedSql =
    unlocked.length === 0 ? '0' : unlocked.map(() => '(ID = ? AND auth_version = ?)').join(' OR ');
  const unlockedParams = unlocked.flatMap(([id, version]) => [id, version]);

  const sql = `(post_status = 'publish' AND ((post_password IS NULL OR post_password = '') OR ? = 1 OR post_author = ? OR (${unlockedSql})))
       OR (post_status = 'private' AND (post_author = ? OR ? = 1))
       OR (post_status IN ('draft', 'pending', 'future', 'auto-draft', 'trash') AND (post_author = ? OR ? = 1))`;

  const params = [canEditOthers, userId, ...unlockedParams, userId, canReadPrivate, userId, canEditOthers];
  return { sql, params };
}

export function selectVisiblePostIds(db: Pick<DatabaseSync, 'prepare'>, actor: Actor): number[] {
  const where = visibleWhere(actor);
  const sql = `SELECT ID FROM posts WHERE (${where.sql}) ORDER BY ID`;
  const rows = db.prepare(sql).all(...where.params) as Array<{ ID: number }>;
  return rows.map((row) => row.ID);
}

export interface VisiblePostRow {
  readonly id: number;
  readonly slug: string | null;
  readonly title: string | null;
  readonly excerpt: string | null;
  readonly content: string | null;
  readonly type: string | null;
  readonly modifiedGmt: string | null;
}

export interface SelectVisiblePostsOptions {
  /** post_name の完全一致 */
  readonly slug?: string;
  /** post_type の完全一致 */
  readonly type?: string;
  /** post_title / post_content / post_excerpt への部分一致(% _ \ はリテラル扱い) */
  readonly search?: string;
  /** 1〜100 の整数。必須(全件取得は禁止) */
  readonly limit: number;
  /** 0 以上の整数。既定 0 */
  readonly offset?: number;
}

const MAX_LIMIT = 100;

function assertInteger(name: string, value: unknown, min: number, max: number): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} は ${min}〜${max} の整数である必要があります: ${String(value)}`);
  }
}

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function selectVisiblePosts(
  db: Pick<DatabaseSync, 'prepare'>,
  actor: Actor,
  opts: SelectVisiblePostsOptions,
): VisiblePostRow[] {
  assertInteger('limit', opts.limit, 1, MAX_LIMIT);
  const offset = opts.offset ?? 0;
  assertInteger('offset', offset, 0, Number.MAX_SAFE_INTEGER);

  const where = visibleWhere(actor);
  const conditions = [`(${where.sql})`];
  const params: SQLInputValue[] = [...where.params];

  if (opts.slug !== undefined) {
    conditions.push('post_name = ?');
    params.push(opts.slug);
  }
  if (opts.type !== undefined) {
    conditions.push('post_type = ?');
    params.push(opts.type);
  }
  if (opts.search !== undefined) {
    const pattern = `%${escapeLike(opts.search)}%`;
    conditions.push(
      `(post_title LIKE ? ESCAPE '\\' OR post_content LIKE ? ESCAPE '\\' OR post_excerpt LIKE ? ESCAPE '\\')`,
    );
    params.push(pattern, pattern, pattern);
  }

  const sql = `
    SELECT ID AS id, post_name AS slug, post_title AS title, post_excerpt AS excerpt,
           post_content AS content, post_type AS type, post_modified_gmt AS modifiedGmt
    FROM posts
    WHERE ${conditions.join(' AND ')}
    ORDER BY post_date_gmt DESC, ID DESC
    LIMIT ? OFFSET ?`;
  params.push(opts.limit, offset);

  return db.prepare(sql).all(...params) as unknown as VisiblePostRow[];
}

export function selectVisiblePostBySlug(
  db: Pick<DatabaseSync, 'prepare'>,
  actor: Actor,
  slug: string,
): VisiblePostRow | null {
  const [row] = selectVisiblePosts(db, actor, { slug, limit: 1 });
  return row ?? null;
}

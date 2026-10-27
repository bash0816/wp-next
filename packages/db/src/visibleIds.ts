// SPDX-License-Identifier: GPL-3.0-only
import type { DatabaseSync } from 'node:sqlite';
import type { Actor } from '@wpn/core/canView';
import { visibleWhere } from './visiblePosts.js';

// 与えた ID のうち actor に可視な件数を返す(重複 ID は1件として数える)。
// 可視判定は visibleWhere を再利用し、canView と同じ規則に従う。
export function countVisiblePostIds(
  db: Pick<DatabaseSync, 'prepare'>,
  actor: Actor,
  ids: readonly number[],
): number {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return 0;
  const where = visibleWhere(actor);
  const placeholders = unique.map(() => '?').join(', ');
  const sql = `SELECT COUNT(*) AS n FROM posts WHERE ID IN (${placeholders}) AND (${where.sql})`;
  const row = db.prepare(sql).get(...unique, ...where.params) as { n: number };
  return row.n;
}

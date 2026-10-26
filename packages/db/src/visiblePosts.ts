// SPDX-License-Identifier: GPL-3.0-only
import type { DatabaseSync } from 'node:sqlite';
import type { Actor } from '@wpn/core/canView';

// canView.ts の判定規則を WHERE 句に写したもの。規則を変えるときは両方を同時に変更する。
// status ごとの分岐:
//   publish        : パスワードなし、または edit_others / 作者 / 解錠(ID と auth_version が一致) なら可視
//   private        : 作者、または read_private_posts
//   draft 系      : 作者、または edit_others_posts
//   それ以外       : 不可視
export function selectVisiblePostIds(db: Pick<DatabaseSync, 'prepare'>, actor: Actor): number[] {
  const canEditOthers = actor.caps.has('edit_others_posts') ? 1 : 0;
  const canReadPrivate = actor.caps.has('read_private_posts') ? 1 : 0;
  const userId = actor.userId;

  const unlocked = [...(actor.unlockedPosts ?? [])];
  const unlockedSql =
    unlocked.length === 0 ? '0' : unlocked.map(() => '(ID = ? AND auth_version = ?)').join(' OR ');
  const unlockedParams = unlocked.flatMap(([id, version]) => [id, version]);

  const sql = `
    SELECT ID FROM posts
    WHERE (post_status = 'publish' AND ((post_password IS NULL OR post_password = '') OR ? = 1 OR post_author = ? OR (${unlockedSql})))
       OR (post_status = 'private' AND (post_author = ? OR ? = 1))
       OR (post_status IN ('draft', 'pending', 'future', 'auto-draft', 'trash') AND (post_author = ? OR ? = 1))
    ORDER BY ID`;

  const params = [canEditOthers, userId, ...unlockedParams, userId, canReadPrivate, userId, canEditOthers];
  const rows = db.prepare(sql).all(...params) as Array<{ ID: number }>;
  return rows.map((row) => row.ID);
}

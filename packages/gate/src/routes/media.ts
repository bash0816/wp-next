// SPDX-License-Identifier: GPL-3.0-only
import { countVisiblePostIds } from '@wpn/db/src/visibleIds.js';
import { dynamic, notFound } from '../respond.js';
import type { RouteCtx } from '../handler.js';

// 配信を許可する添付 MIME。動的に実行されうる型(svg, html, xml, js 等)は含めない。
const ALLOWED_MIME: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'video/mp4',
  'audio/mpeg',
  'application/pdf',
]);

interface AttachmentRow {
  readonly mime: string;
}

interface KeyRow {
  readonly key: string | null;
}

interface ParentRow {
  readonly pid: number;
}

// GET/HEAD /media/<id>: 添付の全親が可視な場合のみ実体を返す。
// 失敗理由(不存在・不可視・実体欠落・MIME不許可)はすべて同一の notFound にする。
export async function mediaRoute(
  ctx: RouteCtx,
  rawId: string,
  store: { get(key: string): Promise<Uint8Array | null> },
): Promise<Response> {
  if (!/^\d+$/.test(rawId)) return notFound(ctx.method);
  const id = Number(rawId);
  if (!Number.isSafeInteger(id)) return notFound(ctx.method);

  const db = ctx.deps.db;
  const att = db
    .prepare("SELECT post_mime_type AS mime FROM posts WHERE ID = ? AND post_type = 'attachment'")
    .get(id) as AttachmentRow | undefined;
  if (att === undefined || !ALLOWED_MIME.has(att.mime)) return notFound(ctx.method);

  const keyRow = db
    .prepare("SELECT meta_value AS key FROM postmeta WHERE post_id = ? AND meta_key = '_wp_attached_file'")
    .get(id) as KeyRow | undefined;
  if (keyRow === undefined || keyRow.key === null || keyRow.key === '') {
    return notFound(ctx.method);
  }

  const parents = db
    .prepare('SELECT parent_post_id AS pid FROM media_parents WHERE attachment_id = ?')
    .all(id) as unknown as ParentRow[];
  if (parents.length === 0) return notFound(ctx.method);
  const parentIds = parents.map((p) => p.pid);
  if (countVisiblePostIds(db, ctx.actor, parentIds) !== new Set(parentIds).size) {
    return notFound(ctx.method);
  }

  const body = await store.get(keyRow.key);
  if (body === null) return notFound(ctx.method);
  return dynamic(ctx.method, body, att.mime);
}

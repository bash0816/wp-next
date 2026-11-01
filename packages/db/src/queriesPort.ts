// SPDX-License-Identifier: GPL-3.0-only
import type { DatabaseSync } from 'node:sqlite';
import type { LatestPost, LatestPostsSpec, QueriesPort, QueryItem } from '@wpn/core/ports';
import { selectLatestPublishedPosts } from './latestPosts.js';
import { queryPosts } from './queryPosts.js';

// D-3d0: core が使う QueriesPort を、単一の DatabaseSync に束縛して作る。
// latestPosts は ADR-027 に従い id・パスワードを返さない (slug / title / isProtected のみ)。
const LATEST_SPEC_KEYS = ['limit', 'order'] as const;

function parseLatestSpec(spec: unknown): LatestPostsSpec {
  if (typeof spec !== 'object' || spec === null || Array.isArray(spec)) {
    throw new RangeError('latestPosts の spec は {limit, order} のオブジェクトである必要があります');
  }
  const keys = Object.keys(spec);
  if (keys.length !== LATEST_SPEC_KEYS.length || !LATEST_SPEC_KEYS.every((k) => keys.includes(k))) {
    throw new RangeError(
      `latestPosts の spec のキーは limit と order のみである必要があります: ${JSON.stringify(keys)}`,
    );
  }
  const { limit, order } = spec as { limit: unknown; order: unknown };
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError(`limit は 1〜100 の整数である必要があります: ${String(limit)}`);
  }
  if (order !== 'asc' && order !== 'desc') {
    throw new RangeError(`order は 'asc' または 'desc' である必要があります: ${String(order)}`);
  }
  return { limit, order };
}

export function makeQueriesPort(db: DatabaseSync): QueriesPort {
  return {
    queryPosts(spec: unknown): QueryItem[] {
      return queryPosts(db, spec);
    },
    latestPosts(spec: LatestPostsSpec): LatestPost[] {
      const { limit, order } = parseLatestSpec(spec);
      return selectLatestPublishedPosts(db, { limit, order }).map((row) => ({
        slug: row.slug,
        title: row.title,
        isProtected: row.isProtected,
      }));
    },
  };
}

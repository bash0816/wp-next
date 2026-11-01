// SPDX-License-Identifier: GPL-3.0-only
// D-3a1/D-3b: 投稿文脈・コンテンツ・クエリの port 型。実行時依存を持たない(型のみ)。
// render と db の双方が参照するため core に置く(db → render の依存を作らない)。

export type PostCtx = {
  id: number;
  title: string;
  url: string;
  protected: boolean;
  className: string;
  dateIso: string;
  dateText: string;
};

export type ContentPort = {
  contentOf?: () => string;
  terms(taxonomy: 'category' | 'post_tag'): Array<{ name: string; slug: string; url: string }>;
  adjacent(dir: 'previous' | 'next'): { title: string; url: string } | null;
  commentsState(): 'anon-open-empty' | 'unsupported';
  hasThumbnail(): boolean;
  author(): { name: string; url: string } | null;
};

export type QueryItem = { post: PostCtx; content: ContentPort };

export type QueriesPort = {
  queryPosts(spec: unknown): QueryItem[];
  latestPosts(spec: unknown): unknown[];
};

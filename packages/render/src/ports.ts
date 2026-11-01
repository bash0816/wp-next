// SPDX-License-Identifier: GPL-3.0-only
// D-3a1: 投稿文脈・コンテンツ・クエリの port 型。実行時依存を持たない(型のみ)。

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

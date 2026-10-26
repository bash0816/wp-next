// SPDX-License-Identifier: GPL-3.0-only
// schema.sql と対応するテーブル名・カラム名の定数。
// 注意: post_status を直接参照してよいのは lint 許可パス(packages/db/src/schema*, canView.ts)のみ。

export const TABLE_NAMES = [
  'posts',
  'postmeta',
  'terms',
  'term_taxonomy',
  'term_relationships',
  'termmeta',
  'users',
  'usermeta',
  'comments',
  'commentmeta',
  'options',
  'media_parents',
  'usage_counter',
] as const;

export const POSTS = {
  table: 'posts',
  id: 'ID',
  author: 'post_author',
  status: 'post_status',
  password: 'post_password',
  type: 'post_type',
  authVersion: 'auth_version',
  visibilityEpoch: 'visibility_epoch',
} as const;

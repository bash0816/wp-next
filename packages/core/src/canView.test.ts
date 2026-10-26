// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { canView, type Actor, type Post } from './canView.js';

const POST_ID = 10;
const AUTHOR_ID = 1;

const actors = {
  anon: { userId: null, caps: new Set<string>() },
  other: { userId: 2, caps: new Set<string>() },
  author: { userId: AUTHOR_ID, caps: new Set<string>() },
  readPrivate: { userId: 3, caps: new Set(['read_private_posts']) },
  editOthers: { userId: 4, caps: new Set(['edit_others_posts']) },
  unlockedMatch: { userId: 5, caps: new Set<string>(), unlockedPosts: new Map([[POST_ID, 1]]) },
  unlockedMismatch: { userId: 5, caps: new Set<string>(), unlockedPosts: new Map([[POST_ID, 0]]) },
} satisfies Record<string, Actor>;

type ActorName = keyof typeof actors;
const ACTOR_NAMES = Object.keys(actors) as ActorName[];

// 期待値は手書き。実装ロジックから導出しない。
// 列順: anon, other, author, readPrivate, editOthers, unlockedMatch, unlockedMismatch
const table: Array<{
  label: string;
  status: string;
  password: string | null;
  expected: readonly [boolean, boolean, boolean, boolean, boolean, boolean, boolean];
}> = [
  { label: 'publish (no password)', status: 'publish', password: null, expected: [true, true, true, true, true, true, true] },
  { label: 'publish + password', status: 'publish', password: 'secret', expected: [false, false, true, false, true, true, false] },
  { label: 'private', status: 'private', password: null, expected: [false, false, true, true, false, false, false] },
  { label: 'draft', status: 'draft', password: null, expected: [false, false, true, false, true, false, false] },
  { label: 'pending', status: 'pending', password: null, expected: [false, false, true, false, true, false, false] },
  { label: 'future', status: 'future', password: null, expected: [false, false, true, false, true, false, false] },
  { label: 'auto-draft', status: 'auto-draft', password: null, expected: [false, false, true, false, true, false, false] },
  { label: 'trash', status: 'trash', password: null, expected: [false, false, true, false, true, false, false] },
  { label: 'inherit (fail-closed)', status: 'inherit', password: null, expected: [false, false, false, false, false, false, false] },
  { label: 'unknown status (fail-closed)', status: 'bogus-status', password: null, expected: [false, false, false, false, false, false, false] },
];

const cases = table.flatMap((row) =>
  ACTOR_NAMES.map((name, i) => ({
    name: `${row.label} × ${name}`,
    post: { id: POST_ID, authorId: AUTHOR_ID, status: row.status, password: row.password, authVersion: 1 } satisfies Post,
    actor: actors[name],
    expected: row.expected[i],
  })),
);

describe('canView 全組合せ表', () => {
  it.each(cases)('$name', ({ post, actor, expected }) => {
    expect(canView(actor, post)).toBe(expected);
  });
});

describe('auth_version 失効', () => {
  it('解錠時の auth_version と異なる場合は、解錠済みでも閲覧不可になる', () => {
    const post: Post = { id: POST_ID, authorId: AUTHOR_ID, status: 'publish', password: 'secret', authVersion: 2 };
    const actor: Actor = { userId: 5, caps: new Set(), unlockedPosts: new Map([[POST_ID, 1]]) };
    expect(canView(actor, post)).toBe(false);
  });

  it('解錠時の auth_version が現行と一致すれば閲覧可能', () => {
    const post: Post = { id: POST_ID, authorId: AUTHOR_ID, status: 'publish', password: 'secret', authVersion: 2 };
    const actor: Actor = { userId: 5, caps: new Set(), unlockedPosts: new Map([[POST_ID, 2]]) };
    expect(canView(actor, post)).toBe(true);
  });
});

describe('空文字パスワードは未設定扱い', () => {
  it('publish + password="" は未認証でも可視', () => {
    expect(canView({ userId: null, caps: new Set() }, { id: 1, authorId: 1, status: 'publish', password: '', authVersion: 1 })).toBe(true);
  });
  it('private + password="" は未認証には不可視のまま', () => {
    expect(canView({ userId: null, caps: new Set() }, { id: 1, authorId: 1, status: 'private', password: '', authVersion: 1 })).toBe(false);
  });
});

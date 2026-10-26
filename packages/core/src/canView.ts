// SPDX-License-Identifier: GPL-3.0-only
// 閲覧可否の唯一の判定関数(docs/05-design-v2.md §1)。
// 未知・inherit のステータスは fail-closed で false。

export interface Actor {
  readonly userId: number | null;
  readonly caps: ReadonlySet<string>;
  /** postId -> 解錠時点の auth_version */
  readonly unlockedPosts?: ReadonlyMap<number, number>;
}

export interface Post {
  readonly id: number;
  readonly authorId: number;
  readonly status: string;
  readonly password: string | null;
  readonly authVersion: number;
}

function isAuthor(actor: Actor, post: Post): boolean {
  return actor.userId !== null && actor.userId === post.authorId;
}

function isUnlocked(actor: Actor, post: Post): boolean {
  const version = actor.unlockedPosts?.get(post.id);
  return version !== undefined && version === post.authVersion;
}

export function canView(actor: Actor, post: Post): boolean {
  const canEditOthers = actor.caps.has('edit_others_posts');
  switch (post.status) {
    case 'publish':
      if (post.password === null || post.password === '') return true;
      return canEditOthers || isAuthor(actor, post) || isUnlocked(actor, post);
    case 'private':
      return isAuthor(actor, post) || actor.caps.has('read_private_posts');
    case 'draft':
    case 'pending':
    case 'future':
    case 'auto-draft':
    case 'trash':
      return isAuthor(actor, post) || canEditOthers;
    default:
      // 'inherit' および未知のステータスは常に不可
      return false;
  }
}

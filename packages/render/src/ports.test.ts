// SPDX-License-Identifier: GPL-3.0-only
// D-3a1 STEP4-A: ports.ts(PostCtx / ContentPort / QueryItem / QueriesPort)と RenderCtx 拡張の型テスト。
// 型テストの Red/Green 判定は `pnpm typecheck` で行う(vitest は型を検査しない)。
// vitest 側の it は実行時の契約スモークにすぎず、型の正しさの証拠にはならない。
// Red理由(typecheck): ports.ts が未作成のため `./ports.js` の import が TS2307 で失敗する。
// 実装後は RenderCtx に post/content/queries が無い、ContentPort.contentOf が optional、
// PostCtx の password/content が過剰プロパティとして拒否される、の3点が成立すべき。
import type { GlobalConfig } from './layoutInput.js';
import type { RenderCtx } from './blockRegistry.js';
import type { ContentPort, PostCtx, QueriesPort, QueryItem } from './ports.js';
import { describe, expect, it } from 'vitest';

// 型検査専用の値。実行はされない(declare は出力に残らない)。
declare const globalCfg: GlobalConfig;

// D3a1-06 (a) RenderCtx の post / content / queries は optional。
// 無い ctx リテラルが satisfies RenderCtx を満たすこと。
function _renderCtxOptional(): void {
	const bare = { global: globalCfg, renderState: { modalCounter: 0 } } satisfies RenderCtx;
	void bare;
}
void _renderCtxOptional;

// D3a1-06 (b) ContentPort.contentOf は optional。省略したオブジェクトが ContentPort に代入できる。
function _contentOfOptional(): void {
	const noContentOf: ContentPort = {
		terms: () => [],
		adjacent: () => null,
		commentsState: () => 'unsupported',
		hasThumbnail: () => false,
		author: () => null,
	};
	void noContentOf;
}
void _contentOfOptional;

// D3a1-06 (c) PostCtx に password / content を足すと過剰プロパティで型エラー。
// 1リテラルにつき過剰プロパティは1件しか報告されないため、リテラルを分けている。
function _postCtxExcess(): void {
	const withPassword: PostCtx = {
		id: 1,
		title: 't',
		url: 'https://example.invalid/1',
		protected: false,
		className: '',
		dateIso: '2026-01-01T00:00:00Z',
		dateText: 'January 1, 2026',
		// @ts-expect-error password は PostCtx に存在しない(過剰プロパティ)
		password: 'x',
	};
	void withPassword;

	const withContent: PostCtx = {
		id: 2,
		title: 't',
		url: 'https://example.invalid/2',
		protected: false,
		className: '',
		dateIso: '2026-01-01T00:00:00Z',
		dateText: 'January 1, 2026',
		// @ts-expect-error content は PostCtx に存在しない(本文は ContentPort 側)
		content: '<p>x</p>',
	};
	void withContent;
}
void _postCtxExcess;

// D3a1-06 (d) QueryItem = { post: PostCtx; content: ContentPort } の構造と、
// RenderCtx 全体(post/content/queries 付き)が satisfies を満たすこと。
function _queryItemShape(): void {
	const post: PostCtx = {
		id: 3,
		title: 't',
		url: 'https://example.invalid/3',
		protected: false,
		className: '',
		dateIso: '2026-01-01T00:00:00Z',
		dateText: 'January 1, 2026',
	};
	const content: ContentPort = {
		terms: () => [],
		adjacent: () => null,
		commentsState: () => 'anon-open-empty',
		hasThumbnail: () => true,
		author: () => ({ name: 'a', url: 'https://example.invalid/a' }),
	};
	const item: QueryItem = { post, content };
	const queries: QueriesPort = {
		queryPosts: () => [item],
		latestPosts: () => [],
	};
	const full = {
		global: globalCfg,
		renderState: { modalCounter: 0 },
		post,
		content,
		queries,
	} satisfies RenderCtx;
	void full;
}
void _queryItemShape;

describe('D3a1 ports contract', () => {
	it('D3a1-06: QueriesPort のモック実装が QueryItem を返す(実行時スモーク。型の判定は typecheck)', () => {
		// 注意: この it は型契約を証明しない。型の Red/Green は typecheck 出力で判定する。
		const post = {
			id: 3,
			title: 't',
			url: 'https://example.invalid/3',
			protected: false,
			className: '',
			dateIso: '2026-01-01T00:00:00Z',
			dateText: 'January 1, 2026',
		};
		const content: ContentPort = {
			terms: () => [],
			adjacent: () => null,
			commentsState: () => 'anon-open-empty',
			hasThumbnail: () => true,
			author: () => null,
		};
		const queries: QueriesPort = {
			queryPosts: () => [{ post, content }],
			latestPosts: () => [],
		};
		const items = queries.queryPosts({});
		expect(items).toHaveLength(1);
		expect(items[0]?.post.id).toBe(3);
		expect(items[0]?.content.commentsState()).toBe('anon-open-empty');
	});
});

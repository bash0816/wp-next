// SPDX-License-Identifier: GPL-3.0-only
// D-3a1 STEP4-A: ThemeRegistry / PostRegistry の出自(名目型)・凍結・検証・renderTree 互換のテスト。
// 実装は未着手。Red の理由は各テストのコメントに記す。
// 型だけの検査(D3a1-04)は vitest では判定できないため `pnpm typecheck` で判定する。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	PostRegistry,
	ThemeRegistry,
	assertPostRegistry,
	createPostRegistry,
	renderTree,
	type RenderCtx,
} from './blockRegistry.js';
import { createThemeRegistry } from './headerCompose.js';
import { type GlobalConfig, globalConfigFromThemeJson } from './layoutInput.js';
import type { ParsedBlock } from './renderBlocks.js';

const FIXTURES = fileURLToPath(new URL('../../../fixtures/ref/', import.meta.url));
const THEME_DIR = join(FIXTURES, 'themes/twentytwentyfive');

const EXPECTED_THEME_KEYS = [
	'core/group',
	'core/site-title',
	'core/navigation',
	'core/page-list',
	'core/navigation-link',
	'core/site-logo',
	'core/site-tagline',
	'core/spacer',
	'core/columns',
	'core/column',
	'core/paragraph',
	// D3b2: 追加 5 種(query / post 系・heading)
	'core/heading',
	'core/post-title',
	'core/post-date',
	'core/query',
	'core/post-template',
	'core/post-terms',
	'core/post-author-name',
	'core/post-featured-image',
];

// 型テスト(D3a1-04)。実行はされないが `pnpm typecheck` が検査する。
// 期待する型エラー: ThemeRegistry を PostRegistry 引数へ渡す / PostRegistry を ThemeRegistry 変数へ代入する。
// Red理由: ThemeRegistry / PostRegistry が未 export のため TS2305 が出る(機能不足)。
function _nominalTypeChecks(theme: ThemeRegistry, post: PostRegistry): void {
	const takesPost = (_r: PostRegistry): void => {};
	// @ts-expect-error ThemeRegistry は #brand により PostRegistry と別型
	takesPost(theme);
	// @ts-expect-error PostRegistry は ThemeRegistry 型へ代入できない
	const asTheme: ThemeRegistry = post;
	void asTheme;
}
void _nominalTypeChecks;

describe('D3a1 registry origin', () => {
	it('D3a1-01: createThemeRegistry は 19 キーの完全一致、createPostRegistry は空', () => {
		// Red理由: 現行 headerCompose.ts は createDefaultRegistry(5キー)のみ export し、
		// createThemeRegistry は未 export のため TypeError (not a function) になる。
		const themeKeys = [...createThemeRegistry().keys()].sort();
		expect(themeKeys).toEqual([...EXPECTED_THEME_KEYS].sort());

		// 期待: createPostRegistry は D-3d0 の 7 キー(テーマ由来キーを含まない)を持つ。
		// Red理由: 現行 createPostRegistry は空の PostRegistry を返すため size 0 にならず不一致になる。
		const postReg = createPostRegistry();
		expect([...postReg.keys()].sort()).toEqual(
			[
				'core/heading',
				'core/paragraph',
				'core/list',
				'core/list-item',
				'core/quote',
				'core/separator',
				'core/latest-posts',
			].sort(),
		);
		expect(postReg.size).toBe(7);
	});

	it('D3a1-02: ThemeRegistry / PostRegistry は凍結され、set/delete/clear で変更できない', () => {
		// Red理由: 未実装のため createThemeRegistry / createPostRegistry が呼べない。
		const registries: Array<{ name: string; reg: unknown }> = [
			{ name: 'ThemeRegistry', reg: createThemeRegistry() },
			{ name: 'PostRegistry', reg: createPostRegistry() },
		];
		for (const { name, reg } of registries) {
			const r = reg as { set?: unknown; delete?: unknown; clear?: unknown; keys(): Iterable<string>; size: number };
			expect(Object.isFrozen(reg), `${name} は凍結される`).toBe(true);
			expect(typeof r.set, `${name} に set が無い`).not.toBe('function');
			expect(typeof r.delete, `${name} に delete が無い`).not.toBe('function');
			expect(typeof r.clear, `${name} に clear が無い`).not.toBe('function');

			const before = [...r.keys()].sort();
			const sizeBefore = r.size;
			for (const method of ['set', 'delete', 'clear'] as const) {
				const fn = (r as Record<string, unknown>)[method];
				if (typeof fn === 'function') {
					try {
						fn.call(reg, 'core/injected', undefined);
					} catch {
						// 例外になるのは許容する。キー集合が不変であることを下で確認する。
					}
				}
			}
			expect([...r.keys()].sort(), `${name} のキー集合は不変`).toEqual(before);
			expect(r.size, `${name} の size は不変`).toBe(sizeBefore);
		}
	});

	it('D3a1-03: assertPostRegistry と PostRegistry.is は PostRegistry 以外を RangeError / false とする', () => {
		// Red理由: PostRegistry / assertPostRegistry が未 export のため TypeError になる。
		const ok = createPostRegistry();
		expect(() => assertPostRegistry(ok)).not.toThrow();
		expect(PostRegistry.is(ok)).toBe(true);

		const rejected: Array<[string, unknown]> = [
			['ThemeRegistry', createThemeRegistry()],
			['素の Map', new Map()],
			['同形の duck-type', { origin: 'post', get() {}, keys() {} }],
			['Object.create(PostRegistry.prototype)', Object.create(PostRegistry.prototype)],
			['null', null],
			['undefined', undefined],
		];
		for (const [label, value] of rejected) {
			expect(() => assertPostRegistry(value), `${label} は RangeError`).toThrow(RangeError);
			expect(PostRegistry.is(value), `${label} は is() で false`).toBe(false);
		}
	});

	it('D3a1-05: renderTree は ThemeRegistry でも Map でも葉ブロックを描画できる', () => {
		// Red理由: ThemeRegistry 未実装のため createThemeRegistry が TypeError になる。
		// 実装後は ThemeRegistry 入力と Map 入力の両方が同じ期待値(hello を含む <p>)を満たすことを確認する。
		const themeJson = JSON.parse(readFileSync(join(THEME_DIR, 'theme.json'), 'utf8'));
		const blockLayoutDefaults = JSON.parse(
			readFileSync(join(FIXTURES, 'block-supports/layout-defaults.json'), 'utf8'),
		);
		const global: GlobalConfig = globalConfigFromThemeJson(themeJson, blockLayoutDefaults);
		const ctx: RenderCtx = { global, renderState: { modalCounter: 0 } };

		const paragraph: ParsedBlock = {
			blockName: 'core/paragraph',
			attrs: {},
			innerBlocks: [],
			innerHTML: '<p>hello</p>',
			innerContent: ['<p>hello</p>'],
		};

		const themeReg = createThemeRegistry();
		const outTheme = renderTree([paragraph], ctx, themeReg);
		expect(outTheme).toMatch(/<p[^>]*>hello<\/p>/);

		const outMap = renderTree([paragraph], ctx, new Map(themeReg.entries()));
		expect(outMap).toMatch(/<p[^>]*>hello<\/p>/);
	});
});

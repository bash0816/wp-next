// SPDX-License-Identifier: GPL-3.0-only
// Red期待: './blockRegistry.js' が未存在のため、static import の解決に失敗しファイル全体がロード時に落ちる想定。
import { parse } from '@wordpress/block-serialization-default-parser';
import { describe, expect, it, vi } from 'vitest';
import { type BlockRegistry, type BlockRenderer, type RenderCtx, renderTree } from './blockRegistry.js';
import type { GlobalConfig } from './layoutInput.js';
import { type ParsedBlock, UnsupportedBlockError } from './renderBlocks.js';

const parseBlocks = (src: string): ParsedBlock[] => parse(src) as ParsedBlock[];

const makeCtx = (): RenderCtx => ({
	global: {} as GlobalConfig,
	renderState: { modalCounter: 0 },
});

// 子を再帰描画し、自身のブロック名をタグにするテスト用 renderer
const tagRenderer = (tag: string): BlockRenderer => ({
	validateAttrs: () => {},
	render: (block, _ctx, renderChildren) => `<${tag}>${renderChildren(block.innerBlocks)}</${tag}>`,
});

const leafRenderer = (html: string): BlockRenderer => ({
	validateAttrs: () => {},
	render: () => html,
});

const captureError = (fn: () => unknown): unknown => {
	try {
		fn();
	} catch (e) {
		return e;
	}
	return undefined;
};

describe('renderTree: 空白のみの null blockName ブロック', () => {
	it('null blockName かつ空白のみのブロックは無視され、出力は空文字になる', () => {
		// 検出対象: 空白の freeform を未対応ブロックとして例外にする実装。期待Red理由: モジュール未存在。
		const ws: ParsedBlock = {
			blockName: null,
			attrs: {},
			innerBlocks: [],
			innerHTML: '\n  \n',
			innerContent: ['\n  \n'],
		};
		const out = renderTree([ws], makeCtx(), new Map());
		expect(out).toBe('');
	});
});

describe('renderTree: 登録済みブロックのディスパッチ', () => {
	it('ブロック名で登録された renderer の出力をそのまま返す', () => {
		// 検出対象: 名前による dispatch の欠落。期待Red理由: モジュール未存在。
		const registry: BlockRegistry = new Map([['test/leaf', leafRenderer('<leaf/>')]]);
		const out = renderTree(parseBlocks('<!-- wp:test/leaf {"a":1} /-->'), makeCtx(), registry);
		expect(out).toBe('<leaf/>');
	});

	it('renderer には該当ブロック(attrs を含む)と呼び出し元の ctx が同一参照で渡される', () => {
		// 検出対象: attrs の欠落、ctx のコピー(別オブジェクト化)。期待Red理由: モジュール未存在。
		const render = vi.fn(() => '');
		const registry: BlockRegistry = new Map([['test/leaf', { validateAttrs: () => {}, render }]]);
		const ctx = makeCtx();
		renderTree(parseBlocks('<!-- wp:test/leaf {"a":1} /-->'), ctx, registry);
		expect(render).toHaveBeenCalledTimes(1);
		const [block, passedCtx] = render.mock.calls[0] as unknown as [ParsedBlock, RenderCtx];
		expect(block.attrs).toEqual({ a: 1 });
		expect(passedCtx).toBe(ctx);
	});

	it('renderer が ctx.renderState を更新すると、呼び出し元の ctx に反映される', () => {
		// 検出対象: ctx の値コピーによる状態共有の破壊。期待Red理由: モジュール未存在。
		const registry: BlockRegistry = new Map([
			[
				'test/counter',
				{
					validateAttrs: () => {},
					render: (_block, ctx) => {
						ctx.renderState.modalCounter += 1;
						return '';
					},
				},
			],
		]);
		const ctx = makeCtx();
		renderTree(parseBlocks('<!-- wp:test/counter /-->'), ctx, registry);
		expect(ctx.renderState.modalCounter).toBe(1);
	});

	it('複数のトップレベルブロックは記述順に連結される', () => {
		// 検出対象: 順序の逆転、区切りの混入。期待Red理由: モジュール未存在。
		const registry: BlockRegistry = new Map([
			['test/x', leafRenderer('<x/>')],
			['test/y', leafRenderer('<y/>')],
		]);
		const out = renderTree(
			parseBlocks('<!-- wp:test/x /-->\n<!-- wp:test/y /-->'),
			makeCtx(),
			registry,
		);
		expect(out).toBe('<x/><y/>');
	});
});

describe('renderTree: 再帰ディスパッチ', () => {
	it('renderChildren は innerBlocks を受け取り、子の出力を親の中に組み込む', () => {
		// 検出対象: 子の再帰描画の欠落、renderChildren への innerBlocks 未渡し。期待Red理由: モジュール未存在。
		const registry: BlockRegistry = new Map([
			['test/parent', tagRenderer('parent')],
			['test/child', tagRenderer('child')],
		]);
		const out = renderTree(
			parseBlocks('<!-- wp:test/parent -->\n<!-- wp:test/child /-->\n<!-- /wp:test/parent -->'),
			makeCtx(),
			registry,
		);
		expect(out).toBe('<parent><child></child></parent>');
	});

	it('3段の入れ子でも全階層のブロックが再帰的に描画される', () => {
		// 検出対象: 2段目以降で再帰が止まる実装。期待Red理由: モジュール未存在。
		const registry: BlockRegistry = new Map([
			['test/a', tagRenderer('a')],
			['test/b', tagRenderer('b')],
			['test/c', tagRenderer('c')],
		]);
		const src =
			'<!-- wp:test/a -->\n<!-- wp:test/b -->\n<!-- wp:test/c /-->\n<!-- /wp:test/b -->\n<!-- /wp:test/a -->';
		const out = renderTree(parseBlocks(src), makeCtx(), registry);
		expect(out).toBe('<a><b><c></c></b></a>');
	});
});

describe('renderTree: 未登録ブロックの扱い', () => {
	it('トップレベルの未登録ブロックは UnsupportedBlockError を投げ、blockName を保持する', () => {
		// 検出対象: 未登録ブロックの黙殺、エラー型・blockName の欠落。期待Red理由: モジュール未存在。
		const err = captureError(() =>
			renderTree(parseBlocks('<!-- wp:test/unknown /-->'), makeCtx(), new Map()),
		);
		expect(err).toBeInstanceOf(UnsupportedBlockError);
		expect((err as UnsupportedBlockError).blockName).toBe('test/unknown');
	});

	it('登録済み親の子が未登録の場合、子の blockName を持つ UnsupportedBlockError になる', () => {
		// 検出対象: 再帰先での未登録チェック漏れ、親の blockName を誤って報告する実装。期待Red理由: モジュール未存在。
		const registry: BlockRegistry = new Map([['test/parent', tagRenderer('parent')]]);
		const err = captureError(() =>
			renderTree(
				parseBlocks('<!-- wp:test/parent -->\n<!-- wp:test/missing /-->\n<!-- /wp:test/parent -->'),
				makeCtx(),
				registry,
			),
		);
		expect(err).toBeInstanceOf(UnsupportedBlockError);
		expect((err as UnsupportedBlockError).blockName).toBe('test/missing');
	});

	it('2段下の未登録ブロックでも例外になり、途中の出力で握りつぶされない', () => {
		// 検出対象: 深い階層の未登録ブロックを無視する実装。期待Red理由: モジュール未存在。
		const registry: BlockRegistry = new Map([
			['test/a', tagRenderer('a')],
			['test/b', tagRenderer('b')],
		]);
		const src =
			'<!-- wp:test/a -->\n<!-- wp:test/b -->\n<!-- wp:test/deep-missing /-->\n<!-- /wp:test/b -->\n<!-- /wp:test/a -->';
		const err = captureError(() => renderTree(parseBlocks(src), makeCtx(), registry));
		expect(err).toBeInstanceOf(UnsupportedBlockError);
		expect((err as UnsupportedBlockError).blockName).toBe('test/deep-missing');
	});
});

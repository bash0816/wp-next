// SPDX-License-Identifier: GPL-3.0-only
// D-3b2 STEP4: core/query・core/post-template レンダラのテスト。test_id は D3b2-01 〜。
// 期待値はすべて fixtures/ref の HTML と dump.sql から取得する(ハードコードしない)。
// Red期待: queryBlock.ts は未実装(存在しない)ため、import 段階で収集失敗する。
//          queryPosts は '@wpn/db' から export 済み(packages/db/src/index.ts)。
import type { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@wordpress/block-serialization-default-parser';
import { queryPosts, UnsupportedDataError } from '@wpn/db';
import { openDumpDb, updateRow, applyS1, applyS2 } from '@wpn/db/testing';
import { describe, expect, it } from 'vitest';
import { type RenderCtx, renderTree } from './blockRegistry.js';
import { createThemeRegistry } from './headerCompose.js';
import { htmlEquals } from './normalizeDom.js';
import { type GlobalConfig, globalConfigFromThemeJson } from './layoutInput.js';
import { type ParsedBlock } from './renderBlocks.js';
import { expandPatterns, type ThemeFiles } from './templateResolve.js';
import { postTemplateRenderer, queryRenderer } from './queryBlock.js';

const FIXTURES = fileURLToPath(new URL('../../../fixtures/ref/', import.meta.url));
const THEME_DIR = join(FIXTURES, 'themes/twentytwentyfive');

const themeJson = JSON.parse(readFileSync(join(THEME_DIR, 'theme.json'), 'utf8'));
const blockLayoutDefaults = JSON.parse(
	readFileSync(join(FIXTURES, 'block-supports/layout-defaults.json'), 'utf8'),
);
const cfg: GlobalConfig = globalConfigFromThemeJson(themeJson, blockLayoutDefaults);

const realTheme: ThemeFiles = {
	read(relPath: string): string | undefined {
		const p = join(THEME_DIR, relPath);
		return existsSync(p) ? readFileSync(p, 'utf8') : undefined;
	},
};

const MORE_POSTS = '<!-- wp:pattern {"slug":"twentytwentyfive/more-posts"} /-->';

function fixture(relPath: string): string {
	return readFileSync(join(FIXTURES, relPath), 'utf8');
}

function makeCtx(db: DatabaseSync): RenderCtx {
	return {
		global: cfg,
		renderState: { modalCounter: 0 },
		site: { name: 'wpref', url: 'http://127.0.0.1:8080' },
		queries: {
			queryPosts: (spec: unknown) => queryPosts(db, spec as Parameters<typeof queryPosts>[1]),
			latestPosts: () => [],
		},
	} as unknown as RenderCtx;
}

function renderMorePosts(db: DatabaseSync, ctx: RenderCtx = makeCtx(db)): string {
	const markup = expandPatterns(MORE_POSTS, realTheme);
	return renderTree(parse(markup) as unknown as ParsedBlock[], ctx, createThemeRegistry());
}

// 開始タグ位置から対応する </div> までを深さカウントで切り出す。
function extractDiv(html: string, startMarker: string): string | undefined {
	const start = html.indexOf(startMarker);
	if (start === -1) {
		return undefined;
	}
	const re = /<div\b|<\/div>/g;
	re.lastIndex = start;
	let depth = 0;
	for (let m = re.exec(html); m !== null; m = re.exec(html)) {
		depth += m[0] === '</div>' ? -1 : 1;
		if (depth === 0) {
			return html.slice(start, re.lastIndex);
		}
	}
	return undefined;
}

const QUERY_MARKER = '<div class="wp-block-query';

function hashOf(html: string): string | undefined {
	return html.match(/wp-container-core-post-template-is-layout-([0-9a-f]+)/)?.[1];
}

function findBlock(blocks: ParsedBlock[], name: string): ParsedBlock | undefined {
	for (const b of blocks) {
		if (b.blockName === name) {
			return b;
		}
		const inner = findBlock(b.innerBlocks ?? [], name);
		if (inner !== undefined) {
			return inner;
		}
	}
	return undefined;
}

const VALID_SPEC = {
	postType: 'post',
	perPage: 10,
	pages: 0,
	offset: 0,
	order: 'desc',
	orderBy: 'date',
	author: '',
	search: '',
	exclude: [],
	sticky: '',
	inherit: false,
	taxQuery: null,
	parents: [],
};

// core/query でラップし、内側に post-template を置いたマークアップを作る。
function qmarkup(
	attrs: Record<string, unknown>,
	inner = '<!-- wp:post-template --><!-- wp:post-title /--><!-- /wp:post-template -->',
): string {
	return `<!-- wp:core/query ${JSON.stringify(attrs)} -->${inner}<!-- /wp:core/query -->`;
}

function renderMarkup(db: DatabaseSync, markup: string): string {
	return renderTree(parse(markup) as unknown as ParsedBlock[], makeCtx(db), createThemeRegistry());
}

// D3b2-01: more-posts パターン全体を S0 の DB で描画すると main-02 と一致する。
// Red: queryBlock.ts 未存在のため収集失敗。実装後は core/query を経由して main-02 と比較する。
describe('D3b2-01 more-posts パターン全体が S0 で main-02 と一致', () => {
	it('renderTree の結果が regions/main-02.html と htmlEquals で一致', () => {
		const db = openDumpDb();
		try {
			const out = renderMorePosts(db);
			expect(htmlEquals(out, fixture('regions/main-02.html'))).toBe(true);
		} finally {
			db.close();
		}
	});
});

// D3b2-02: 状態を変えた DB での query 部分が set-main2 の該当 div と一致する。
// Red: queryBlock.ts 未実装のため core/query が UnsupportedBlockError になり失敗する。
describe('D3b2-02 query div が set-main2 の状態別フィクスチャと一致', () => {
	it('S1 では main.mixed-status-protected-adjacent.html の query div と一致', () => {
		const db = openDumpDb();
		try {
			applyS1(db);
			const got = extractDiv(renderMorePosts(db), QUERY_MARKER);
			const expected = extractDiv(
				fixture('set-main2/main.mixed-status-protected-adjacent.html'),
				QUERY_MARKER,
			);
			expect(got).toBeDefined();
			expect(expected).toBeDefined();
			expect(htmlEquals(got ?? '', expected ?? '')).toBe(true);
		} finally {
			db.close();
		}
	});

	it('S1 + S2 では main.classes-tiebreak-format-tag.html の query div と一致', () => {
		const db = openDumpDb();
		try {
			applyS1(db);
			applyS2(db);
			const got = extractDiv(renderMorePosts(db), QUERY_MARKER);
			const expected = extractDiv(
				fixture('set-main2/main.classes-tiebreak-format-tag.html'),
				QUERY_MARKER,
			);
			expect(got).toBeDefined();
			expect(expected).toBeDefined();
			expect(htmlEquals(got ?? '', expected ?? '')).toBe(true);
		} finally {
			db.close();
		}
	});
});

// D3b2-03: post-template 内の各 li は、そのカードの ctx.post を使う。外側の ctx.post は変えない。
// Red: queryBlock.ts 未実装のため描画自体が失敗する。
describe('D3b2-03 カードごとの post コンテキスト', () => {
	it('各 li が固有の URL を持ち、外側の ctx.post は同一参照のまま', () => {
		const db = openDumpDb();
		try {
			applyS1(db);
			const sentinel = { id: 0, title: 'SENTINEL-OUTER', className: 'post-outer' };
			const ctx = { ...makeCtx(db), post: sentinel } as unknown as RenderCtx;
			const out = renderMorePosts(db, ctx);
			expect(ctx.post).toBe(sentinel);
			expect(out).not.toContain('SENTINEL-OUTER');
			const liCount = (out.match(/<li class="wp-block-post /g) ?? []).length;
			expect(liCount).toBeGreaterThan(1);
			const hrefs = [...out.matchAll(/<li class="wp-block-post [^"]*"[\s\S]*?href="([^"]+)"/g)].map(
				(m) => m[1],
			);
			expect(hrefs.length).toBe(liCount);
			expect(new Set(hrefs).size).toBe(liCount);
		} finally {
			db.close();
		}
	});
});

// D3b2-04: 不正な attrs・状態は RangeError で失敗する(部分出力なし)。
// Red: queryBlock.ts 未実装のため UnsupportedBlockError となり RangeError にならない。
const badQueryCases: [string, Record<string, unknown>][] = [
	['query spec に未知キー', { query: { ...VALID_SPEC, bogus: 1 } }],
	['perPage 0', { query: { ...VALID_SPEC, perPage: 0 } }],
	['perPage 101', { query: { ...VALID_SPEC, perPage: 101 } }],
	['postType page', { query: { ...VALID_SPEC, postType: 'page' } }],
	['order asc', { query: { ...VALID_SPEC, order: 'asc' } }],
	['exclude [1]', { query: { ...VALID_SPEC, exclude: [1] } }],
	['query 属性なし', {}],
	['align left', { query: VALID_SPEC, align: 'left' }],
	['layout.type flex', { query: VALID_SPEC, layout: { type: 'flex' } }],
	['未知キー className', { query: VALID_SPEC, className: 'x' }],
	['未知キー tagName', { query: VALID_SPEC, tagName: 'section' }],
];

describe('D3b2-04 core/query の不正 attrs は RangeError', () => {
	it.each(badQueryCases)('%s', (_label, attrs) => {
		const db = openDumpDb();
		try {
			expect(() => renderMarkup(db, qmarkup(attrs))).toThrow(RangeError);
		} finally {
			db.close();
		}
	});

	it('ctx.queries が無いと RangeError', () => {
		const db = openDumpDb();
		try {
			const ctx = { ...makeCtx(db), queries: undefined } as unknown as RenderCtx;
			expect(() =>
				renderTree(
					parse(qmarkup({ query: VALID_SPEC })) as unknown as ParsedBlock[],
					ctx,
					createThemeRegistry(),
				),
			).toThrow(RangeError);
		} finally {
			db.close();
		}
	});

	it('0 件の結果(全投稿を非公開化)は RangeError', () => {
		const db = openDumpDb();
		try {
			applyS1(db);
			db.exec("UPDATE posts SET post_status = 'draft'");
			expect(() => renderMarkup(db, qmarkup({ query: VALID_SPEC }))).toThrow(RangeError);
		} finally {
			db.close();
		}
	});
});

const badPostTemplateCases: [string, Record<string, unknown>][] = [
	['align wide', { align: 'wide' }],
	['blockGap 1rem', { style: { spacing: { blockGap: '1rem' } } }],
	['layout flex', { layout: { type: 'flex' } }],
	['未知キー className', { className: 'x' }],
];

describe('D3b2-04 core/post-template の不正 attrs・配置は RangeError', () => {
	it('query の外に置かれると RangeError', () => {
		const db = openDumpDb();
		try {
			expect(() => renderMarkup(db, '<!-- wp:post-template /-->')).toThrow(RangeError);
		} finally {
			db.close();
		}
	});

	it.each(badPostTemplateCases)('%s', (_label, attrs) => {
		const db = openDumpDb();
		try {
			const inner = `<!-- wp:post-template ${JSON.stringify(attrs)} --><!-- wp:post-title /--><!-- /wp:post-template -->`;
			expect(() => renderMarkup(db, qmarkup({ query: VALID_SPEC }, inner))).toThrow(RangeError);
		} finally {
			db.close();
		}
	});
});

// D3b2-05: sticky_posts が想定外の形式なら UnsupportedDataError で全体が失敗する。
// Red: queryBlock.ts 未実装のため、描画が UnsupportedBlockError で先に失敗する。
describe('D3b2-05 sticky_posts の想定外形式', () => {
	it('S2 で sticky_posts を a:1:{i:0;i:29;} にすると UnsupportedDataError', () => {
		const db = openDumpDb();
		try {
			applyS2(db);
			updateRow(db, 'options', 'option_name', 'sticky_posts', {
				option_value: 'a:1:{i:0;i:29;}',
			});
			expect(() => renderMorePosts(db)).toThrow(UnsupportedDataError);
		} finally {
			db.close();
		}
	});
});

// D3b2-06: renderChildren の契約。実 query/post-template と記録用の偽子ブロックを使う。
// Red: queryBlock.ts 未実装のため、登録されていない実装を import して収集失敗する。
describe('D3b2-06 renderChildren の呼び出し契約', () => {
	type Rec = { query?: unknown; post?: unknown; content?: unknown };

	function fakeRegistry(calls: Rec[]): Map<string, unknown> {
		const rec = {
			validateAttrs: () => {},
			render: (_b: ParsedBlock, ctx: RenderCtx) => {
				calls.push({
					query: (ctx as unknown as Rec).query,
					post: (ctx as unknown as Rec).post,
					content: (ctx as unknown as Rec).content,
				});
				return '';
			},
		};
		return new Map<string, unknown>([
			['core/query', queryRenderer],
			['core/post-template', postTemplateRenderer],
			['test/rec', rec],
		]);
	}

	function fakeCtx(db: DatabaseSync): RenderCtx {
		const items = [
			{ post: { id: 1, className: 'post-1' }, content: 'C1' },
			{ post: { id: 2, className: 'post-2' }, content: 'C2' },
		];
		return {
			...makeCtx(db),
			queries: { queryPosts: () => items, latestPosts: () => [] },
		} as unknown as RenderCtx;
	}

	it('query は children を {query} 付きで 1 回だけ渡す', () => {
		const db = openDumpDb();
		try {
			const calls: Rec[] = [];
			const markup = qmarkup({ query: VALID_SPEC }, '<!-- wp:test/rec /-->');
			renderTree(
				parse(markup) as unknown as ParsedBlock[],
				fakeCtx(db),
				fakeRegistry(calls) as unknown as Parameters<typeof renderTree>[2],
			);
			// 子ブロック 1 個 × renderChildren 1 回 = 描画 1 回(query は item 数に関わらず 1 回だけ子を描画する)。
			expect(calls.length).toBe(1);
			expect(Array.isArray((calls[0]?.query as { items?: unknown[] })?.items)).toBe(true);
		} finally {
			db.close();
		}
	});

	it('post-template は item ごとに全 innerBlocks を {post, content} 付きで渡す', () => {
		const db = openDumpDb();
		try {
			const calls: Rec[] = [];
			const inner =
				'<!-- wp:post-template --><!-- wp:test/rec /--><!-- wp:test/rec /--><!-- /wp:post-template -->';
			renderTree(
				parse(qmarkup({ query: VALID_SPEC }, inner)) as unknown as ParsedBlock[],
				fakeCtx(db),
				fakeRegistry(calls) as unknown as Parameters<typeof renderTree>[2],
			);
			// 2 item × 2 innerBlocks
			expect(calls.length).toBe(4);
			expect(calls[0]?.post).toEqual({ id: 1, className: 'post-1' });
			expect(calls[0]?.content).toBe('C1');
			expect(calls[2]?.post).toEqual({ id: 2, className: 'post-2' });
			expect(calls[2]?.content).toBe('C2');
		} finally {
			db.close();
		}
	});
});

// D3b2-07: post-template の container hash。フィクスチャの値と一致し、blockGap の有無で変わる。
// Red: queryBlock.ts 未実装のため描画が失敗する。
describe('D3b2-07 post-template の container hash', () => {
	it('main-02 の hash(b4d04ffe)と一致し、blockGap を省くと hash が変わる', () => {
		const db = openDumpDb();
		try {
			const expected = hashOf(fixture('regions/main-02.html'));
			expect(expected).toBe('b4d04ffe');
			const blocks = parse(expandPatterns(MORE_POSTS, realTheme)) as unknown as ParsedBlock[];
			expect(hashOf(renderTree(blocks, makeCtx(db), createThemeRegistry()))).toBe(expected);

			const variant = structuredClone(blocks);
			const pt = findBlock(variant, 'core/post-template');
			expect(pt).toBeDefined();
			if (pt?.attrs) {
				delete (pt.attrs as Record<string, unknown>).style;
			}
			const variantHash = hashOf(renderTree(variant, makeCtx(db), createThemeRegistry()));
			expect(variantHash).toBeDefined();
			expect(variantHash).not.toBe(expected);
		} finally {
			db.close();
		}
	});
});

// D3b2-04 補強(STEP6 mutation 生存): render 側の検証を db の queryPosts に頼らず単独で検査する(スタブ使用)。
import { queryRenderer as qr, postTemplateRenderer as ptr } from './queryBlock.js';
import type { RenderCtx as RC } from './blockRegistry.js';
import type { ParsedBlock as PB } from './renderBlocks.js';

describe('queryBlock 補強: render 側の検証(スタブの queryPosts)', () => {
  const SPEC = {
    postType: 'post', perPage: 4, pages: 0, offset: 0, order: 'desc', orderBy: 'date',
    author: '', search: '', exclude: [], sticky: '', inherit: false, taxQuery: null, parents: [],
  };
  const item = (className: string) => ({
    post: { id: 1, title: 't', url: 'http://x/', protected: false, className, dateIso: '', dateText: '' },
    content: {},
  });
  const blockOf = (name: string, attrs: Record<string, unknown>): PB =>
    ({ blockName: name, attrs, innerBlocks: [], innerHTML: '', innerContent: [] }) as unknown as PB;
  const mkCtx = (items: unknown[], spy: { n: number }): RC =>
    ({
      global: {},
      renderState: { modalCounter: 0 },
      queries: { queryPosts: () => { spy.n += 1; return items; }, latestPosts: () => [] },
    }) as unknown as RC;

  it.each([
    ['未知キー', { ...SPEC, extra: 1 }],
    ['キー欠落(search)', (() => { const { search: _s, ...r } = SPEC; return r; })()],
    ['キー欠落(exclude)', (() => { const { exclude: _e, ...r } = SPEC; return r; })()],
    ['キー欠落(parents)', (() => { const { parents: _p, ...r } = SPEC; return r; })()],
    ['perPage 0', { ...SPEC, perPage: 0 }],
    ['perPage 101', { ...SPEC, perPage: 101 }],
    ['perPage 1.5', { ...SPEC, perPage: 1.5 }],
    ['perPage 文字列', { ...SPEC, perPage: '4' }],
    ['postType page', { ...SPEC, postType: 'page' }],
    ['pages 1', { ...SPEC, pages: 1 }],
    ['offset 1', { ...SPEC, offset: 1 }],
    ['order asc', { ...SPEC, order: 'asc' }],
    ['orderBy title', { ...SPEC, orderBy: 'title' }],
    ['author 1', { ...SPEC, author: '1' }],
    ['search x', { ...SPEC, search: 'x' }],
    ['exclude [1]', { ...SPEC, exclude: [1] }],
    ['exclude 非配列', { ...SPEC, exclude: null }],
    ['sticky only', { ...SPEC, sticky: 'only' }],
    ['inherit true', { ...SPEC, inherit: true }],
    ['taxQuery {}', { ...SPEC, taxQuery: {} }],
    ['parents [1]', { ...SPEC, parents: [1] }],
    ['parents 非配列', { ...SPEC, parents: null }],
    ['spec が配列', []],
    ['spec が null', null],
    ['spec が文字列', 'x'],
  ])('D3b2-04: render 側が spec(%s)を queryPosts 呼び出し前に RangeError で拒否する', (_n, spec) => {
    const spy = { n: 0 };
    expect(() => qr.render(blockOf('core/query', { query: spec }), mkCtx([item('post-1')], spy), () => '')).toThrow(RangeError);
    expect(spy.n).toBe(0);
    expect(() => qr.validateAttrs({ query: spec })).toThrow(RangeError);
  });
  it('D3b2-04: query 属性が無い場合は queryPosts 呼び出し前に RangeError', () => {
    const spy = { n: 0 };
    expect(() => qr.render(blockOf('core/query', {}), mkCtx([item('post-1')], spy), () => '')).toThrow(RangeError);
    expect(spy.n).toBe(0);
  });
  it('D3b2-04: queryPosts が 0 件を返すと RangeError(出力しない)', () => {
    const spy = { n: 0 };
    expect(() => qr.render(blockOf('core/query', { query: SPEC }), mkCtx([], spy), () => 'X')).toThrow(RangeError);
    expect(spy.n).toBe(1);
  });
  it('D3b2-04: align full は alignfull、wide は alignwide、無しは付かない', () => {
    const spy = { n: 0 };
    const out = (attrs: Record<string, unknown>) => qr.render(blockOf('core/query', attrs), mkCtx([item('post-1')], spy), () => '');
    expect(out({ query: SPEC, align: 'full' })).toBe('<div class="wp-block-query alignfull is-layout-flow wp-block-query-is-layout-flow"></div>');
    expect(out({ query: SPEC, align: 'wide' })).toBe('<div class="wp-block-query alignwide is-layout-flow wp-block-query-is-layout-flow"></div>');
    expect(out({ query: SPEC })).toBe('<div class="wp-block-query is-layout-flow wp-block-query-is-layout-flow"></div>');
  });
  it.each(['post-1" onclick="x', 'a&b', 'a<b', '', 'a\nb'])('D3b2-04: post className %j は RangeError(属性注入の防止)', (cn) => {
    const ctx = { global: cfg, renderState: { modalCounter: 0 }, query: { items: [item(cn)] } } as unknown as RC;
    expect(() => ptr.render(blockOf('core/post-template', {}), ctx, () => '')).toThrow(RangeError);
  });
  it('D3b2-04: query の layout は {type:default} のみ(余分なキーも拒否)', () => {
    const spy = { n: 0 };
    expect(() => qr.render(blockOf('core/query', { query: SPEC, layout: { type: 'default', extra: 1 } }), mkCtx([item('post-1')], spy), () => '')).toThrow(RangeError);
    expect(() => ptr.validateAttrs({ layout: { type: 'default', extra: 1 } })).toThrow(RangeError);
    expect(() => ptr.validateAttrs({ style: { spacing: { blockGap: '0', extra: 1 } } })).toThrow(RangeError);
    expect(() => ptr.validateAttrs({ style: { spacing: { blockGap: '0' }, extra: 1 } })).toThrow(RangeError);
  });
});

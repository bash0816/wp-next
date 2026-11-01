// SPDX-License-Identifier: GPL-3.0-only
// D-3f STEP4-render: core/comments 系(comments / comments-title / comment-template / comments-pagination(-previous/-next) / post-comments-form)のテスト。test_id は D3f-10 〜。
// 期待値は fixtures/ref の HTML から抽出する(ハードコードしない)。commentsState は DB 側が別担当で未実装のため ContentPort のスタブで差し替える。
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@wordpress/block-serialization-default-parser';
import { parseFragment } from 'parse5';
import { makeQueriesPort, openCurrentPost } from '@wpn/db';
import { openDumpDb } from '@wpn/db/testing';
import { describe, expect, it } from 'vitest';
import { createPostRegistry, type RenderCtx, renderTree } from './blockRegistry.js';
import { createThemeRegistry } from './headerCompose.js';
import { htmlEquals } from './normalizeDom.js';
import { type GlobalConfig, globalConfigFromThemeJson } from './layoutInput.js';
import { type ParsedBlock, UnsupportedBlockError } from './renderBlocks.js';
import { expandPatterns, type ThemeFiles } from './templateResolve.js';

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

function fixture(relPath: string): string {
	return readFileSync(join(FIXTURES, relPath), 'utf8');
}

// startMarker で始まる <div> を開始位置から、対応する </div> まで(深さカウント)で切り出す。
function extractDiv(html: string, startMarker: string): string {
	const start = html.indexOf(startMarker);
	if (start < 0) throw new Error(`marker not found: ${startMarker}`);
	const re = /<div\b|<\/div>/g;
	re.lastIndex = start;
	let depth = 0;
	for (let m = re.exec(html); m !== null; m = re.exec(html)) {
		depth += m[0] === '</div>' ? -1 : 1;
		if (depth === 0) return html.slice(start, m.index + m[0].length);
	}
	throw new Error(`unclosed div after marker: ${startMarker}`);
}

function renderPattern(markup: string, ctx: RenderCtx): string {
	return renderTree(parse(markup) as unknown as ParsedBlock[], ctx, createThemeRegistry());
}

describe('D3f-10: twentytwentyfive/comments パターン全体を匿名・open・承認済み 0 件の状態で描画すると main-01 の comments div と一致する', () => {
	const MAIN01 = 'regions/main-01.html';

	it('D3f-10a: comments パターンの描画結果が main-01.html の wp-block-comments div と htmlEquals で一致する', () => {
		const db = openDumpDb();
		try {
			const current = openCurrentPost(db, { slug: 'spike-blocks' });
			if (!current) throw new Error('spike-blocks post not found');
			const ctx = {
				global: cfg,
				renderState: { modalCounter: 0 },
				site: { name: 'wpref', url: 'http://127.0.0.1:8080' },
				post: current.post,
				content: { ...current.content, commentsState: () => 'anon-open-empty' as const },
				queries: makeQueriesPort(db),
			} as unknown as RenderCtx;
			const markup = expandPatterns('<!-- wp:pattern {"slug":"twentytwentyfive/comments"} /-->', realTheme);
			const actual = renderPattern(markup, ctx);
			const expected = extractDiv(fixture(MAIN01), '<div class="wp-block-comments wp-block-comments-query-loop');
			expect(htmlEquals(actual, expected)).toBe(true);
		} finally {
			db.close();
		}
	});
});

type DomNode = {
	nodeName: string;
	tagName?: string;
	attrs?: { name: string; value: string }[];
	childNodes?: DomNode[];
};

function parseDom(html: string): DomNode[] {
	return (parseFragment(html) as unknown as { childNodes: DomNode[] }).childNodes;
}

function elementsOf(nodes: DomNode[] | undefined): DomNode[] {
	const out: DomNode[] = [];
	for (const n of nodes ?? []) {
		if (n.tagName) out.push(n);
		out.push(...elementsOf(n.childNodes));
	}
	return out;
}

function attrOf(n: DomNode, name: string): string | undefined {
	return n.attrs?.find((a) => a.name === name)?.value;
}

function withDb<T>(fn: (db: ReturnType<typeof openDumpDb>) => T): T {
	const db = openDumpDb();
	try {
		return fn(db);
	} finally {
		db.close();
	}
}

const SYNTH_POST = {
	id: 5,
	title: 'spike-blocks',
	url: 'http://127.0.0.1:8080/spike-blocks/',
	protected: false,
	className: '',
	dateIso: '2026-01-01T00:00:00Z',
	dateText: 'Jan 1, 2026',
};

// content / post / site は overrides で個別に差し替え可能(undefined を渡すと欠落を再現できる)。
function baseCtx(overrides: Record<string, unknown> = {}): RenderCtx {
	return {
		global: cfg,
		renderState: { modalCounter: 0 },
		site: { name: 'wpref', url: 'http://127.0.0.1:8080' },
		post: SYNTH_POST,
		content: { commentsState: () => 'anon-open-empty' as const },
		queries: undefined,
		...overrides,
	} as unknown as RenderCtx;
}

describe('D3f-11: post-comments-form の可変部分(hidden comment_post_ID / cancel リンク / form action)は ctx から決まる', () => {
	it('D3f-11a: post 7 (fixture-two-nested) で hidden comment_post_ID=7、cancel リンク /fixture-two-nested/#respond、form action は site.url 由来になる', () => {
		// Red理由: core/post-comments-form が未登録のため renderTree が UnsupportedBlockError を投げる。
		withDb((db) => {
			const current = openCurrentPost(db, { slug: 'fixture-two-nested' });
			if (!current) throw new Error('fixture-two-nested post not found');
			expect(current.post.id).toBe(7);
			expect(new URL(current.post.url).pathname).toBe('/fixture-two-nested/');
			const ctx = baseCtx({
				post: current.post,
				site: { name: 'wpref', url: 'https://example.test' },
				queries: makeQueriesPort(db),
			});
			const els = elementsOf(parseDom(renderPattern('<!-- wp:post-comments-form /-->', ctx)));
			const form = els.find((e) => e.tagName === 'form');
			const hidden = els.find((e) => e.tagName === 'input' && attrOf(e, 'name') === 'comment_post_ID');
			const cancel = els.find((e) => e.tagName === 'a' && attrOf(e, 'id') === 'cancel-comment-reply-link');
			expect(form && attrOf(form, 'action')).toBe('https://example.test/wp-comments-post.php');
			expect(hidden && attrOf(hidden, 'value')).toBe('7');
			expect(cancel && attrOf(cancel, 'href')).toBe('/fixture-two-nested/#respond');
		});
	});
});

describe('D3f-12: commentsState が anon-open-empty 以外、または必要な ctx 欠落で RangeError を投げる', () => {
	const VALID_MARKUP: Record<string, string> = {
		'core/comments': `<!-- wp:comments {"className":"wp-block-comments-query-loop","style":{"spacing":{"margin":{"top":"var:preset|spacing|70","bottom":"var:preset|spacing|70"}}}} /-->`,
		'core/comments-title': '<!-- wp:comments-title {"level":3,"fontSize":"large"} /-->',
		'core/comment-template': '<!-- wp:comment-template /-->',
		'core/comments-pagination': '<!-- wp:comments-pagination {"layout":{"type":"flex","justifyContent":"space-between"}} /-->',
		'core/post-comments-form': '<!-- wp:post-comments-form /-->',
	};

	it.each(Object.entries(VALID_MARKUP))('D3f-12a: %s は commentsState=unsupported で RangeError', (_name, markup) => {
		// Red理由: 対象ブロックが未登録のため UnsupportedBlockError(RangeError ではない)が投げられる。
		const ctx = baseCtx({ content: { commentsState: () => 'unsupported' as const } });
		expect(() => renderPattern(markup, ctx)).toThrow(RangeError);
	});

	it.each(Object.entries(VALID_MARKUP))('D3f-12b: %s は ctx.content 欠落で RangeError', (_name, markup) => {
		// Red理由: 対象ブロックが未登録のため UnsupportedBlockError(RangeError ではない)が投げられる。
		const ctx = baseCtx({ content: undefined });
		expect(() => renderPattern(markup, ctx)).toThrow(RangeError);
	});

	it('D3f-12c: post-comments-form は ctx.post 欠落で RangeError', () => {
		// Red理由: core/post-comments-form が未登録のため UnsupportedBlockError が投げられる。
		const ctx = baseCtx({ post: undefined });
		expect(() => renderPattern('<!-- wp:post-comments-form /-->', ctx)).toThrow(RangeError);
	});

	it('D3f-12d: post-comments-form は ctx.site 欠落で RangeError', () => {
		// Red理由: core/post-comments-form が未登録のため UnsupportedBlockError が投げられる。
		const ctx = baseCtx({ site: undefined });
		expect(() => renderPattern('<!-- wp:post-comments-form /-->', ctx)).toThrow(RangeError);
	});
});

describe('D3f-13: 許可外の属性・値は RangeError を投げる', () => {
	const INVALID: [string, string][] = [
		['comments: className が別値', '<!-- wp:comments {"className":"other"} /-->'],
		['comments: style に余分なキー', '<!-- wp:comments {"className":"wp-block-comments-query-loop","style":{"color":{"text":"#fff"}}} /-->'],
		['comments: margin が px', '<!-- wp:comments {"className":"wp-block-comments-query-loop","style":{"spacing":{"margin":{"top":"16px","bottom":"var:preset|spacing|70"}}}} /-->'],
		['comments: margin の slug が不正', '<!-- wp:comments {"className":"wp-block-comments-query-loop","style":{"spacing":{"margin":{"top":"var:preset|spacing|nope","bottom":"var:preset|spacing|70"}}}} /-->'],
		['comments: margin に未知キー', '<!-- wp:comments {"className":"wp-block-comments-query-loop","style":{"spacing":{"margin":{"top":"var:preset|spacing|70","bottom":"var:preset|spacing|70","left":"var:preset|spacing|70"}}}} /-->'],
		['comments-title: level 2', '<!-- wp:comments-title {"level":2,"fontSize":"large"} /-->'],
		['comments-title: fontSize x-large', '<!-- wp:comments-title {"level":3,"fontSize":"x-large"} /-->'],
		['comments-title: 未知キー', '<!-- wp:comments-title {"level":3,"fontSize":"large","textAlign":"center"} /-->'],
		['comments-pagination: layout.type 不一致', '<!-- wp:comments-pagination {"layout":{"type":"grid","justifyContent":"space-between"}} /-->'],
		['comments-pagination: justifyContent 不一致', '<!-- wp:comments-pagination {"layout":{"type":"flex","justifyContent":"center"}} /-->'],
		['comment-template: 属性あり', '<!-- wp:comment-template {"className":"x"} /-->'],
		['comments-pagination-previous: 属性あり', '<!-- wp:comments-pagination-previous {"label":"x"} /-->'],
		['comments-pagination-next: 属性あり', '<!-- wp:comments-pagination-next {"label":"y"} /-->'],
		['post-comments-form: 属性あり', '<!-- wp:post-comments-form {"className":"x"} /-->'],
	];

	it.each(INVALID)('D3f-13: %s', (_name, markup) => {
		// Red理由: 対象ブロックが未登録のため UnsupportedBlockError(RangeError ではない)が投げられる。
		expect(() => renderPattern(markup, baseCtx())).toThrow(RangeError);
	});
});

describe('D3f-14: post.url / site.url / post.id の値がエスケープ・URL検証を通ること', () => {
	it.each([
		['引用符による属性注入', 'http://127.0.0.1:8080/a" onfocus="alert(1)'],
		['javascript: スキーム', 'javascript:alert(1)'],
		['プロトコル相対 //evil', '//evil.example/x'],
	])('D3f-14a: post.url が %s の場合は RangeError か、危険な属性を追加しない', (_name, url) => {
		// Red理由: core/post-comments-form が未登録のため UnsupportedBlockError が投げられ、RangeError の分岐に到達しない。
		const ctx = baseCtx({ post: { ...SYNTH_POST, url } });
		let out: string;
		try {
			out = renderPattern('<!-- wp:post-comments-form /-->', ctx);
		} catch (e) {
			expect(e).toBeInstanceOf(RangeError);
			return;
		}
		for (const el of elementsOf(parseDom(out))) {
			for (const a of el.attrs ?? []) {
				expect(a.name.startsWith('on')).toBe(false);
				expect(a.value).not.toContain('javascript:');
				expect(a.value).not.toContain('evil.example');
			}
		}
	});

	it('D3f-14b: site.url が javascript: スキームの場合は RangeError', () => {
		// Red理由: core/post-comments-form が未登録のため UnsupportedBlockError が投げられる。
		const ctx = baseCtx({ site: { name: 'wpref', url: 'javascript:alert(1)' } });
		expect(() => renderPattern('<!-- wp:post-comments-form /-->', ctx)).toThrow(RangeError);
	});

	it('D3f-14c: post.id が属性注入を含む文字列の場合は RangeError', () => {
		// Red理由: core/post-comments-form が未登録のため UnsupportedBlockError が投げられる。
		const ctx = baseCtx({ post: { ...SYNTH_POST, id: '5" onfocus="x' } });
		expect(() => renderPattern('<!-- wp:post-comments-form /-->', ctx)).toThrow(RangeError);
	});
});

describe('D3f-15: childrenOptional の子は未登録でも空出力、comments の未登録子は UnsupportedBlockError', () => {
	it.each([
		['comment-template', '<!-- wp:comment-template -->\n<!-- wp:comment-content /-->\n<!-- /wp:comment-template -->'],
		['comments-pagination', '<!-- wp:comments-pagination -->\n<!-- wp:comment-content /-->\n<!-- /wp:comments-pagination -->'],
	])('D3f-15a: %s 内の未登録 core/comment-content は空出力でエラーにならない', (_name, markup) => {
		// Red理由: 親ブロックが未登録のため UnsupportedBlockError が投げられ、空出力の期待に到達しない。
		expect(renderPattern(markup, baseCtx()).trim()).toBe('');
	});

	it('D3f-15b: comments 内の未登録 core/comment-content は UnsupportedBlockError(メッセージに core/comment-content を含む)', () => {
		// Red理由: core/comments 自体が未登録のため、現状はメッセージが core/comments になり core/comment-content の検出に到達しない。
		const markup = '<!-- wp:comments {"className":"wp-block-comments-query-loop"} -->\n<!-- wp:comment-content /-->\n<!-- /wp:comments -->';
		let err: unknown;
		try {
			renderPattern(markup, baseCtx());
		} catch (e) {
			err = e;
		}
		expect(err).toBeInstanceOf(UnsupportedBlockError);
		expect((err as Error).message).toContain('core/comment-content');
	});
});

describe('D3f-16: レジストリ登録', () => {
	const SEVEN = [
		'core/comments',
		'core/comments-title',
		'core/comment-template',
		'core/comments-pagination',
		'core/comments-pagination-previous',
		'core/comments-pagination-next',
		'core/post-comments-form',
	];

	it('D3f-16a: createThemeRegistry は 28 件で 7 件の名前をすべて含む', () => {
		// Red理由: 7 件が未登録のため size が 21 で、名前も含まれない。
		const reg = createThemeRegistry();
		expect(reg.size).toBe(28);
		for (const name of SEVEN) expect(reg.has(name)).toBe(true);
	});

	it('D3f-16b: createPostRegistry は 7 件の名前を含まない(回帰ガード)', () => {
		// 注: 現状でも Green になる想定の回帰ガード。Red 理由ではなく、実装後に post 側へ混入しないことを確認する。
		const reg = createPostRegistry();
		for (const name of SEVEN) expect(reg.has(name)).toBe(false);
	});
});


// D3f-13 補強(STEP6 mutation 生存): 型違いの style/spacing/margin/layout と margin 末尾の余分な文字。
describe('D3f-13 補強', () => {
	const C = '"className":"wp-block-comments-query-loop"';
	const MORE: [string, string][] = [
		['style が null', `<!-- wp:comments {${C},"style":null} /-->`],
		['style が配列', `<!-- wp:comments {${C},"style":[]} /-->`],
		['style が数値', `<!-- wp:comments {${C},"style":1} /-->`],
		['spacing が null', `<!-- wp:comments {${C},"style":{"spacing":null}} /-->`],
		['spacing が配列', `<!-- wp:comments {${C},"style":{"spacing":[]}} /-->`],
		['margin が null', `<!-- wp:comments {${C},"style":{"spacing":{"margin":null}}} /-->`],
		['margin が配列', `<!-- wp:comments {${C},"style":{"spacing":{"margin":[]}}} /-->`],
		['margin 値の末尾に余分な文字', `<!-- wp:comments {${C},"style":{"spacing":{"margin":{"top":"var:preset|spacing|70px","bottom":"var:preset|spacing|70"}}}} /-->`],
		['margin 値が数値', `<!-- wp:comments {${C},"style":{"spacing":{"margin":{"top":70,"bottom":"var:preset|spacing|70"}}}} /-->`],
		['pagination layout が null', '<!-- wp:comments-pagination {"layout":null} /-->'],
		['pagination layout が配列', '<!-- wp:comments-pagination {"layout":[]} /-->'],
		['className が省略', '<!-- wp:comments /-->'],
	];
	it.each(MORE)('D3f-13: %s は RangeError', (_n, markup) => {
		expect(() => renderPattern(markup, baseCtx())).toThrow(RangeError);
	});
});

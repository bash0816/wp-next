// SPDX-License-Identifier: GPL-3.0-only
// D-3d STEP4: core/post-content レンダラ(テーマ由来・本文描画)のテスト。test_id は D3d-01 〜。
// 期待値は fixtures/ref の HTML から取得する(ハードコードしない)。
// 実装は未着手。registry 経由(renderTree + createThemeRegistry)で検証するため、
// postContent.ts を直接 import せず、未登録の core/post-content は UnsupportedBlockError として Red になる。
import type { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@wordpress/block-serialization-default-parser';
import { makeQueriesPort, openCurrentPost } from '@wpn/db';
import { addPost, openDumpDb, updateRow } from '@wpn/db/testing';
import { describe, expect, it, vi } from 'vitest';
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

const POST_CONTENT = '<!-- wp:post-content {"align":"full","layout":{"type":"constrained"}} /-->';
const ENTRY_CONTENT_START = '<div class="entry-content';
const SPIKE_POST_ID = 5;
const PROTECTED_POST_ID = 22;
const QUERY_SPEC = {
	postType: 'post',
	perPage: 100,
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

// S0 (openDumpDb のみ) の post 5 (spike-blocks) を使う ctx を作る。
function makeCtx(db: DatabaseSync, withQueries = true): RenderCtx {
	const current = openCurrentPost(db, { slug: 'spike-blocks' });
	if (!current) throw new Error('spike-blocks post not found');
	return {
		global: cfg,
		renderState: { modalCounter: 0 },
		site: { name: 'wpref', url: 'http://127.0.0.1:8080' },
		post: current.post,
		content: current.content,
		...(withQueries ? { queries: makeQueriesPort(db) } : {}),
	} as unknown as RenderCtx;
}

function renderPostContent(ctx: RenderCtx, markup: string = POST_CONTENT): string {
	const expanded = expandPatterns(markup, realTheme);
	return renderTree(parse(expanded) as unknown as ParsedBlock[], ctx, createThemeRegistry());
}

// post 5 の post_content を差し替える(S0 の DB に対して UPDATE する)。
function setSpikeBody(db: DatabaseSync, body: string): void {
	updateRow(db, 'posts', 'ID', SPIKE_POST_ID, { post_content: body });
}

// post-content 描画結果の開始タグ(class 属性を含む)だけを取り出す。期待値の出所は fixture。
function entryOpenTag(): string {
	const expected = extractDiv(fixture('regions/main-01.html'), ENTRY_CONTENT_START);
	return expected.slice(0, expected.indexOf('>') + 1);
}

describe('D3d-01: core/post-content を S0 の post 5 で描画すると main-01 の entry-content div と一致する', () => {
	// D3d-01 (Red予測): core/post-content が createThemeRegistry に未登録(現状 19 キー)のため、
	//   renderTree が UnsupportedBlockError('core/post-content') を投げる。
	it('D3d-01: 描画結果が main-01.html の entry-content div と htmlEquals で一致する', () => {
		const db = openDumpDb();
		try {
			const actual = renderPostContent(makeCtx(db));
			const expected = extractDiv(fixture('regions/main-01.html'), ENTRY_CONTENT_START);
			expect(htmlEquals(actual, expected)).toBe(true);
		} finally {
			db.close();
		}
	});
});

describe('D3d-02: 本文 post_content に入れ子のブロック・禁止ブロックがあれば UnsupportedBlockError、危険属性は除去される', () => {
	// D3d-02 (Red予測): core/post-content 未登録のため、禁止ブロック判定以前に
	//   外側の post-content 自体が UnsupportedBlockError を投げる。禁止判定の成否は実装後に観測する。
	// blockName を検証して偽グリーンを防ぐ。注意: 入れ子 post-content の場合、外側 post-content の
	// 未登録エラーと blockName が同一('core/post-content')のため、実装前後で区別できない(既知の限界)。
	it.each([
		['入れ子の post-content', '<!-- wp:post-content /-->', 'core/post-content'],
		['core/query', '<!-- wp:query --><div class="wp-block-query"></div><!-- /wp:query -->', 'core/query'],
		['core/comments', '<!-- wp:comments /-->', 'core/comments'],
		[
			'core/group',
			'<!-- wp:group --><div class="wp-block-group"><p>x</p></div><!-- /wp:group -->',
			'core/group',
		],
		[
			'list 内の theme-only ブロック(site-title)',
			'<!-- wp:list --><ul class="wp-block-list"><!-- wp:site-title /--></ul><!-- /wp:list -->',
			'core/site-title',
		],
		[
			'quote 内の theme-only ブロック(site-title)',
			'<!-- wp:quote --><blockquote class="wp-block-quote"><!-- wp:site-title /--></blockquote><!-- /wp:quote -->',
			'core/site-title',
		],
	])('D3d-02: %s を含む本文は UnsupportedBlockError(blockName=%s)', (_label, body, forbidden) => {
		const db = openDumpDb();
		try {
			setSpikeBody(db, body);
			let caught: unknown;
			try {
				renderPostContent(makeCtx(db));
			} catch (e) {
				caught = e;
			}
			expect(caught).toBeInstanceOf(UnsupportedBlockError);
			expect((caught as UnsupportedBlockError).blockName).toBe(forbidden);
		} finally {
			db.close();
		}
	});

	// D3d-02 (f) Red予測: 現状は post-content 未登録で即 UnsupportedBlockError。サニタイズ結果は実装後に観測する。
	it('D3d-02: script / onclick / javascript: を含む本文は除去され、描画は正常完了する', () => {
		const db = openDumpDb();
		try {
			setSpikeBody(
				db,
				'<!-- wp:paragraph --><p>safe<script>alert(1)</script><a href="javascript:alert(1)" onclick="x()">link</a></p><!-- /wp:paragraph -->',
			);
			const html = renderPostContent(makeCtx(db));
			expect(html).toContain('safe');
			expect(html).not.toMatch(/<script/i);
			expect(html).not.toMatch(/onclick=/i);
			expect(html).not.toMatch(/javascript:/i);
		} finally {
			db.close();
		}
	});
});

describe('D3d-03: 保護投稿・必須 ctx 欠落は RangeError', () => {
	// D3d-03 (Red予測): 現状は post-content 未登録のため RangeError ではなく UnsupportedBlockError。
	it('D3d-03: 保護投稿(22)の queryPosts 由来 item(contentOf なし)を描画すると RangeError', () => {
		const db = openDumpDb();
		try {
			// 基準 dump(S0)には post 22 が無い。保護投稿は mainStates の S1 で追加される(M-prot)ため、同等の行を補う。
			addPost(db, {
				id: PROTECTED_POST_ID,
				title: 'M-prot',
				name: 'm-prot',
				date: '2026-10-27 23:27:00',
				status: 'publish',
				password: 'SECRET-PW-TEST',
				content: 'SECRET-BODY-TEST',
			});
			const items = makeQueriesPort(db).queryPosts(QUERY_SPEC) as unknown as Array<{
				post: unknown;
				content: unknown;
			}>;
			const item = items.find((i) => (i.post as { id: number }).id === PROTECTED_POST_ID);
			if (!item) throw new Error('post 22 is not returned by queryPosts (spec assumption)');
			const ctx = {
				global: cfg,
				renderState: { modalCounter: 0 },
				site: { name: 'wpref', url: 'http://127.0.0.1:8080' },
				post: item.post,
				content: item.content,
			} as unknown as RenderCtx;
			expect(() => renderPostContent(ctx)).toThrow(RangeError);
		} finally {
			db.close();
		}
	});

	it.each([
		['ctx.post', 'post'],
		['ctx.content', 'content'],
		['ctx.site', 'site'],
	])('D3d-03: %s が無いと RangeError', (_label, key) => {
		const db = openDumpDb();
		try {
			const ctx = { ...makeCtx(db) } as unknown as Record<string, unknown>;
			delete ctx[key];
			expect(() => renderPostContent(ctx as unknown as RenderCtx)).toThrow(RangeError);
		} finally {
			db.close();
		}
	});
});

describe('D3d-04: attrs の検証違反は RangeError', () => {
	// D3d-04 (Red予測): 全ケース現状は post-content 未登録のため RangeError ではなく UnsupportedBlockError。
	const withAttrs = (attrs: string): string =>
		attrs === ''
			? '<!-- wp:post-content /-->'
			: `<!-- wp:post-content ${attrs} /-->`;
	it.each([
		['attrs 省略', ''],
		['align のみ', '{"align":"full"}'],
		['layout のみ', '{"layout":{"type":"constrained"}}'],
		['align が wide', '{"align":"wide","layout":{"type":"constrained"}}'],
		['layout.type が default', '{"align":"full","layout":{"type":"default"}}'],
		[
			'layout.contentSize を含む',
			'{"align":"full","layout":{"type":"constrained","contentSize":"800px"}}',
		],
		['layout が文字列', '{"align":"full","layout":"constrained"}'],
		['未知キー className', '{"align":"full","layout":{"type":"constrained"},"className":"x"}'],
		['未知キー tagName', '{"align":"full","layout":{"type":"constrained"},"tagName":"section"}'],
	])('D3d-04: %s は RangeError', (_label, attrs) => {
		const db = openDumpDb();
		try {
			expect(() => renderPostContent(makeCtx(db), withAttrs(attrs))).toThrow(RangeError);
		} finally {
			db.close();
		}
	});

	it('D3d-04: innerBlocks が空でない場合は RangeError', () => {
		const db = openDumpDb();
		try {
			const markup =
				'<!-- wp:post-content {"align":"full","layout":{"type":"constrained"}} --><!-- wp:paragraph --><p>x</p><!-- /wp:paragraph --><!-- /wp:post-content -->';
			expect(() => renderPostContent(makeCtx(db), markup)).toThrow(RangeError);
		} finally {
			db.close();
		}
	});
});

describe('D3d-05: 出力は DB の本文に依存する(本文を差し替えると出力も変わる)', () => {
	// D3d-05 (Red予測): 現状は post-content 未登録のため UnsupportedBlockError。
	it('D3d-05: 本文を差し替えると出力に新しい本文が現れる', () => {
		const db = openDumpDb();
		try {
			setSpikeBody(db, '<!-- wp:paragraph --><p>ZZZ-marker</p><!-- /wp:paragraph -->');
			const html = renderPostContent(makeCtx(db));
			expect(html).toContain('ZZZ-marker');
			expect(html).toContain(ENTRY_CONTENT_START);
		} finally {
			db.close();
		}
	});

	// D3d-05 (空本文) Red予測: 現状は post-content 未登録のため UnsupportedBlockError。
	it('D3d-05: 空の本文は entry-content の空 div と htmlEquals で一致する', () => {
		const db = openDumpDb();
		try {
			setSpikeBody(db, '');
			const actual = renderPostContent(makeCtx(db));
			const expected = `${entryOpenTag()}</div>`;
			expect(htmlEquals(actual, expected)).toBe(true);
		} finally {
			db.close();
		}
	});

	// D3d-05 (ctx.queries なし) Red予測: 現状は post-content 未登録のため UnsupportedBlockError。
	it('D3d-05: ctx.queries が無くても latest-posts を含まない本文は描画できる', () => {
		const db = openDumpDb();
		try {
			setSpikeBody(db, '<!-- wp:paragraph --><p>no-queries</p><!-- /wp:paragraph -->');
			const ctx = makeCtx(db, false);
			expect(() => renderPostContent(ctx)).not.toThrow();
			expect(renderPostContent(ctx)).toContain('no-queries');
		} finally {
			db.close();
		}
	});

	it('D3d-05: ctx.queries が無いときに latest-posts を含む本文は RangeError', () => {
		const db = openDumpDb();
		try {
			setSpikeBody(db, '<!-- wp:latest-posts /-->');
			expect(() => renderPostContent(makeCtx(db, false))).toThrow(RangeError);
		} finally {
			db.close();
		}
	});
});

describe('D3d-06: 登録(theme 側には入り、post 側には入らない)', () => {
	// D3d-06 (Red予測): core/post-content が未登録のため、theme キー数 20 と包含の 2 件が失敗する。
	it('D3d-06: createThemeRegistry は 20 キーで core/post-content を含む', () => {
		const keys = [...createThemeRegistry().keys()];
		expect(keys).toHaveLength(20);
		expect(keys).toContain('core/post-content');
	});

	// D3d-06 (PostRegistry) Red予測: 現状 core/post-content は未登録のため 'not' は既に成立する。
	// 実装後に post 側へ誤登録されていないことを観測する回帰テスト。
	it('D3d-06: createPostRegistry は core/post-content を含まない', () => {
		expect(createPostRegistry().has('core/post-content')).toBe(false);
	});
});

describe('D3d-07: renderChildren の契約(ctx.post / ctx.content の参照不変、latest-posts の呼び出し回数)', () => {
	// D3d-07 (Red予測): 現状は post-content 未登録のため UnsupportedBlockError。
	it('D3d-07: 描画の前後で ctx.post / ctx.content の参照が変わらない', () => {
		const db = openDumpDb();
		try {
			const ctx = makeCtx(db);
			const beforePost = ctx.post;
			const beforeContent = ctx.content;
			renderPostContent(ctx);
			expect(ctx.post).toBe(beforePost);
			expect(ctx.content).toBe(beforeContent);
		} finally {
			db.close();
		}
	});

	// D3d-07 (latest-posts spy) Red予測: 現状は post-content 未登録のため latestPosts は 0 回で、
	//   描画自体が UnsupportedBlockError になる。
	it('D3d-07: 本文内の latest-posts は ctx.queries.latestPosts を 1 回だけ呼ぶ', () => {
		const db = openDumpDb();
		try {
			setSpikeBody(db, '<!-- wp:latest-posts /-->');
			const latestPosts = vi.fn(() => []);
			const ctx = {
				...makeCtx(db),
				queries: { queryPosts: vi.fn(() => []), latestPosts },
			} as unknown as RenderCtx;
			renderPostContent(ctx);
			expect(latestPosts).toHaveBeenCalledTimes(1);
		} finally {
			db.close();
		}
	});
});

// D3d-03 補強(STEP6 mutation 生存): ctx.site 欠落は本文に latest-posts が無くても RangeError。
describe('D3d-03 補強', () => {
  it('D3d-03: 段落だけの本文でも ctx.site が無ければ RangeError', () => {
    const db = openDumpDb();
    try {
      setSpikeBody(db, '<!-- wp:paragraph --><p>plain</p><!-- /wp:paragraph -->');
      const ctx = makeCtx(db) as unknown as Record<string, unknown>;
      delete ctx.site;
      expect(() => renderPostContent(ctx as unknown as RenderCtx)).toThrow(RangeError);
    } finally {
      db.close();
    }
  });
});

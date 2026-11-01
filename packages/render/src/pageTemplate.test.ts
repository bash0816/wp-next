// SPDX-License-Identifier: GPL-3.0-only
// T2a: page テンプレート(templates/page.html)による描画のテスト。test_id は T2a-06 〜 T2a-09。
// 期待値は fixtures/ref の HTML と DB 操作から取得する(ハードコードしない)。
// Red期待: openCurrentPost(db, ref, 'page') の第3引数が未対応のため page が null になり、
// 本ファイルの pageCtx() が "page not found" を投げて失敗する。
// 各 test の Red 理由は実装前の観測結果ではなく、実装が無い時点での予測として併記する。
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeQueriesPort, openCurrentPost } from '@wpn/db';
import { openDumpDb, updateRow } from '@wpn/db/testing';
import { describe, expect, it } from 'vitest';
import type { RenderCtx } from './blockRegistry.js';
import { htmlEquals } from './normalizeDom.js';
import { type GlobalConfig, globalConfigFromThemeJson } from './layoutInput.js';
import { renderMain, SKIP_LINK_TARGET_ID } from './mainCompose.js';
import { renderHeader } from './headerCompose.js';
import { renderFooter } from './footerCompose.js';
import { ThemeResolveError, type ThemeFiles } from './templateResolve.js';
import { readFileSync as readJson } from 'node:fs';

const FIXTURES = fileURLToPath(new URL('../../../fixtures/ref/', import.meta.url));
const THEME_DIR = join(FIXTURES, 'themes/twentytwentyfive');
const SKIP_ID_ATTR = `id="${SKIP_LINK_TARGET_ID}"`;

const themeJson = JSON.parse(readFileSync(join(THEME_DIR, 'theme.json'), 'utf8'));
const blockLayoutDefaults = JSON.parse(
	readJson(join(FIXTURES, 'block-supports/layout-defaults.json'), 'utf8'),
);
const cfg: GlobalConfig = globalConfigFromThemeJson(themeJson, blockLayoutDefaults);

const realTheme: ThemeFiles = {
	read(relPath: string): string | undefined {
		const p = join(THEME_DIR, relPath);
		return existsSync(p) ? readFileSync(p, 'utf8') : undefined;
	},
};

function themeWith(overrides: Record<string, string | undefined>): ThemeFiles {
	return {
		read(relPath: string): string | undefined {
			if (Object.prototype.hasOwnProperty.call(overrides, relPath)) return overrides[relPath];
			return realTheme.read(relPath);
		},
	};
}

function fixture(relPath: string): string {
	return readFileSync(join(FIXTURES, relPath), 'utf8');
}

// fixture 内の唯一の <main ...>...</main> 要素全体を切り出す。
function extractMain(html: string): string {
	const m = /<main\b[^>]*>[\s\S]*?<\/main>/.exec(html);
	if (!m) throw new Error('main element not found in fixture');
	return m[0];
}

// ThemeResolveError の code を検証する。投げなければ失敗。
function expectThemeErrorCode(fn: () => unknown, code: string): void {
	let caught: unknown;
	try {
		fn();
	} catch (e) {
		caught = e;
	}
	expect(caught).toBeInstanceOf(ThemeResolveError);
	expect((caught as ThemeResolveError).code).toBe(code);
}

const NAV_PAGE_LIST = '<!-- wp:page-list /-->';

// dump.sql ID 2 (Sample Page) の実値を、開いている DB から取り出す。
function samplePageFromDb(db: DatabaseSync) {
	const row = db.prepare('SELECT * FROM posts WHERE ID = ?').get(2) as
		| Record<string, string | number | null>
		| undefined;
	if (row === undefined) throw new Error('posts の ID 2 (Sample Page) が見つからない');
	return {
		id: Number(row.ID),
		title: String(row.post_title ?? ''),
		slug: String(row.post_name ?? ''),
		parent: Number(row.post_parent),
		menuOrder: Number(row.menu_order),
	};
}

type CurrentPost = NonNullable<ReturnType<typeof openCurrentPost>>;

function ctxFrom(db: DatabaseSync, current: CurrentPost): RenderCtx {
	return {
		global: cfg,
		renderState: { modalCounter: 0 },
		site: { name: 'wpref', url: 'http://127.0.0.1:8080', tagline: '', logoId: null },
		page: { isHome: false, isSingular: true },
		navigation: { post: { id: 4, content: NAV_PAGE_LIST }, pages: [samplePageFromDb(db)] },
		post: current.post,
		content: current.content,
		queries: makeQueriesPort(db),
	} as unknown as RenderCtx;
}

// 第3引数 kind は現実装では未対応のため、型検査を外して呼ぶ。
type OpenFn = (
	db: DatabaseSync,
	ref: { slug: string } | { id: number },
	kind?: string,
) => ReturnType<typeof openCurrentPost>;
const open = openCurrentPost as unknown as OpenFn;

// page(slug) を kind='page' で開いた ctx。取得できなければ失敗させる(黙って素通りさせない)。
function pageCtx(db: DatabaseSync, slug = 'sample-page'): RenderCtx {
	const current = open(db, { slug }, 'page');
	if (!current) throw new Error(`page not found: ${slug}`);
	return ctxFrom(db, current);
}

describe('T2a: templates/page.html による page 描画', () => {
	it('T2a-06: renderMain(theme, ctx, "page") は page-sample の main と一致する', () => {
		const db = openDumpDb();
		try {
			const ctx = pageCtx(db, 'sample-page');
			const main = renderMain(realTheme, ctx, 'page');
			expect(htmlEquals(main, extractMain(fixture('pages/page-sample.html')))).toBe(true);
			expect(main).toContain(SKIP_ID_ATTR);
		} finally {
			db.close();
		}
	});

	it('T2a-07: header/main/footer を同一 ctx で描画すると各 region fixture と一致する', () => {
		const db = openDumpDb();
		try {
			const ctx = pageCtx(db, 'sample-page');
			const header = renderHeader(realTheme, ctx);
			const main = renderMain(realTheme, ctx, 'page');
			const footer = renderFooter(realTheme, ctx);
			expect(htmlEquals(header, fixture('regions/header.html'))).toBe(true);
			expect(htmlEquals(footer, fixture('regions/footer.html'))).toBe(true);
			expect(htmlEquals(main, extractMain(fixture('pages/page-sample.html')))).toBe(true);
		} finally {
			db.close();
		}
	});

	it('T2a-08a: templates/page.html が無いテーマは unknown-template で拒否する', () => {
		const db = openDumpDb();
		try {
			const ctx = pageCtx(db, 'sample-page');
			const theme = themeWith({ 'templates/page.html': undefined });
			expectThemeErrorCode(() => renderMain(theme, ctx, 'page'), 'unknown-template');
		} finally {
			db.close();
		}
	});

	it('T2a-08b: ctx.post が無い場合は RangeError を投げる', () => {
		const db = openDumpDb();
		try {
			const ctx = pageCtx(db, 'sample-page');
			const broken = { ...ctx, post: undefined } as unknown as RenderCtx;
			expect(() => renderMain(realTheme, broken, 'page')).toThrow(RangeError);
		} finally {
			db.close();
		}
	});

	it('T2a-08c (guard): post 種別の ctx(hello-world)を page テンプレで描いても post-title が出る', () => {
		// 回帰ガード: kind 省略で開いた post を 'page' テンプレで描いても例外にならず、タイトルが出ること。
		// 現実装でも page.html を読むだけなので Green になり得る。Red ではなくガードとして扱う。
		const db = openDumpDb();
		try {
			const current = openCurrentPost(db, { slug: 'hello-world' });
			if (!current) throw new Error('post not found: hello-world');
			const ctx = ctxFrom(db, current);
			const main = renderMain(realTheme, ctx, 'page');
			expect(main).toContain('wp-block-post-title');
			expect(main).toContain(current.post.title);
		} finally {
			db.close();
		}
	});

	it('T2a-09: DB 上の page の題名・本文を変えると、描画結果もそれに追従する(固定値への過適合ガード)', () => {
		const db = openDumpDb();
		try {
			updateRow(db, 'posts', 'ID', 2, { post_title: 'Renamed Page T2a09' });
			const ctx1 = pageCtx(db, 'sample-page');
			const main1 = renderMain(realTheme, ctx1, 'page');
			expect(main1).toContain('Renamed Page T2a09');
			expect(main1).not.toContain('>Sample Page<');

			const marker = 'BODY-MARKER-T2a09';
			updateRow(db, 'posts', 'ID', 2, {
				post_content: `<!-- wp:paragraph --><p>${marker}</p><!-- /wp:paragraph -->`,
			});
			const ctx2 = pageCtx(db, 'sample-page');
			const main2 = renderMain(realTheme, ctx2, 'page');
			expect(main2).toContain(marker);
		} finally {
			db.close();
		}
	});
});

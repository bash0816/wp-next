// SPDX-License-Identifier: GPL-3.0-only
// D-1e STEP4: header 合成 (renderHeader / createDefaultRegistry) のテスト。
// 期待値はすべて fixtures/ref の HTML と dump.sql から取得する(ハードコードしない)。
// Red期待: headerCompose.ts が未作成のため、テストファイル全体が
//          "Cannot find module './headerCompose.js'" 相当の読み込みエラーで失敗する。
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { RenderCtx } from './blockRegistry.js';
import { createDefaultRegistry, renderHeader } from './headerCompose.js';
import { htmlEquals, normalizeHtml } from './normalizeDom.js';
import { type GlobalConfig, globalConfigFromThemeJson } from './layoutInput.js';
import { UnsupportedBlockError } from './renderBlocks.js';
import { type ThemeFiles, ThemeResolveError } from './templateResolve.js';

const FIXTURES = fileURLToPath(new URL('../../../fixtures/ref/', import.meta.url));
const THEME_DIR = join(FIXTURES, 'themes/twentytwentyfive');
const DUMP_PATH = join(FIXTURES, 'db/dump.sql');

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

function modalIds(html: string): string[] {
	return [...html.matchAll(/id="(modal-\d+)"/g)].map((m) => m[1] ?? '');
}

function errorOf(fn: () => unknown): unknown {
	try {
		fn();
	} catch (e) {
		return e;
	}
	return undefined;
}

// dump.sql を scratch の in-memory SQLite に流し、指定 ID の wp_posts 行を取り出す。
function readWpPostRow(id: string): Record<string, string | null> {
	const src = new DatabaseSync(':memory:');
	src.exec(readFileSync(DUMP_PATH, 'utf8'));
	const row = src.prepare('SELECT * FROM wp_posts WHERE ID = ?').get(Number(id)) as
		| Record<string, string | number | null>
		| undefined;
	if (row === undefined) throw new Error(`wp_posts の ID ${id} が dump.sql に見つからない`);
	return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v === null ? null : String(v)]));
}

// dump.sql ID 2 (Sample Page) から取り出した実値。
function samplePageFromDump() {
	const row = readWpPostRow('2');
	return {
		id: Number(row.ID),
		title: row.post_title ?? '',
		slug: row.post_name ?? '',
		parent: Number(row.post_parent),
		menuOrder: Number(row.menu_order),
	};
}

const SITE_WPREF = { name: 'wpref', url: 'http://127.0.0.1:8080' };
const NAV_PAGE_LIST = '<!-- wp:page-list /-->';
const NAV_BEE = '<!-- wp:navigation-link {"label":"Bee","url":"http://127.0.0.1:8080/b","kind":"custom"} /-->';

function ctxSingle(): RenderCtx {
	return {
		global: cfg,
		renderState: { modalCounter: 0 },
		site: SITE_WPREF,
		page: { isHome: false, isSingular: true },
		navigation: { post: { id: 4, content: NAV_PAGE_LIST }, pages: [samplePageFromDump()] },
	};
}

function ctxHome(pages: RenderCtx['navigation'] extends infer N ? (N extends { pages: infer P } ? P : never) : never, navContent: string): RenderCtx {
	return {
		global: cfg,
		renderState: { modalCounter: 0 },
		site: SITE_WPREF,
		page: { isHome: true, isSingular: false },
		navigation: { post: { id: 4, content: navContent }, pages },
	};
}

describe('renderHeader: 単一派生 fixture との一致', () => {
	it('regions/header.html と全体 HTML が htmlEquals で一致する', () => {
		// 検出: 合成結果(site-title / nav / page-list / modal)の全体が単一派生 fixture と一致するか。
		// Red理由: headerCompose.ts 未存在のため renderHeader が解決できない。
		const out = renderHeader(realTheme, ctxSingle());
		expect(htmlEquals(out, fixture('regions/header.html'))).toBe(true);
	});

	it('出力は header 要素で始まり、wp-block-template-part クラスを持つ', () => {
		// 検出: 外枠 <header class="wp-block-template-part"> のラップ漏れ。
		// Red理由: renderHeader 未実装。
		const out = renderHeader(realTheme, ctxSingle());
		expect(normalizeHtml(out).startsWith('<header class="wp-block-template-part"')).toBe(true);
	});
});

describe('renderHeader: home 派生 fixture との一致', () => {
	it('pages-protected-and-draft: 保護ページ入り nav が home fixture と一致する', () => {
		// 検出: home 判定 (aria-current) と、保護ページを "Protected:" 接頭辞なしで列挙する挙動の一致。
		// 注記: Prot Page の id 6 は仮値(未検証)。slug 'prot-page' / menuOrder は README 記載想定。
		// Red理由: renderHeader 未実装。
		const protPage = { id: 6, title: 'Prot Page', slug: 'prot-page', parent: 0, menuOrder: 0 };
		const ctx = ctxHome([protPage, samplePageFromDump()], NAV_PAGE_LIST);
		const out = renderHeader(realTheme, ctx);
		expect(
			htmlEquals(out, fixture('set-header2/header.pages-protected-and-draft.html')),
		).toBe(true);
	});

	it('navB-newer-draft-ignored: 最新公開の wp_navigation(Bee)を使い draft を無視する', () => {
		// 検出: navigation.post.content の最新公開版採用。Bee リンクの label/url が出力に反映されるか。
		// 注記: NAV_BEE の内容は想定入力(README 由来の仮定。dump からの直接抽出ではない)。
		// Red理由: renderHeader 未実装。
		const ctx = ctxHome([samplePageFromDump()], NAV_BEE);
		const out = renderHeader(realTheme, ctx);
		expect(htmlEquals(out, fixture('set-header2/header.navB-newer-draft-ignored.html'))).toBe(
			true,
		);
	});
});

describe('htmlEquals 比較器の否定ケース (ベースラインに対する破壊)', () => {
	it('ベースライン自身が単一派生 fixture と一致する(前提確認)', () => {
		// 検出: 以降の否定ケースの前提となるベースラインの正しさ。
		// Red理由: renderHeader 未実装。
		const baseline = renderHeader(realTheme, ctxSingle());
		expect(htmlEquals(baseline, fixture('regions/header.html'))).toBe(true);
	});

	it('site-title の <p> を除去すると htmlEquals は false になる', () => {
		// 検出: 比較器が site-title 欠落を見逃さないこと。
		// Red理由: renderHeader 未実装のため baseline が得られない。
		const baseline = renderHeader(realTheme, ctxSingle());
		const mutated = baseline.replace(/<p class="wp-block-site-title">[\s\S]*?<\/p>/, '');
		expect(mutated).not.toBe(baseline);
		expect(htmlEquals(mutated, baseline)).toBe(false);
	});

	it('group の class を 1 つ除去すると htmlEquals は false になる', () => {
		// 検出: 比較器が class 差分を見逃さないこと。
		// Red理由: renderHeader 未実装のため baseline が得られない。
		const baseline = renderHeader(realTheme, ctxSingle());
		const mutated = baseline.replace(/<div class="wp-block-group ([^"]*)"/, (_m, rest: string) => {
			const remaining = rest.split(' ').slice(1).join(' ');
			return remaining ? `<div class="wp-block-group ${remaining}"` : '<div class="wp-block-group"';
		});
		expect(mutated).not.toBe(baseline);
		expect(htmlEquals(mutated, baseline)).toBe(false);
	});

	it('nav の <li> を 1 つ重複させると htmlEquals は false になる', () => {
		// 検出: 比較器が余分なリスト項目を見逃さないこと。
		// Red理由: renderHeader 未実装のため baseline が得られない。
		const baseline = renderHeader(realTheme, ctxSingle());
		const mutated = baseline.replace(
			/<li class="wp-block-pages-list__item[\s\S]*?<\/li>/,
			(m) => m + m,
		);
		expect(mutated).not.toBe(baseline);
		expect(htmlEquals(mutated, baseline)).toBe(false);
	});
});

describe('過学習ガード: 別の site 名・ページ名・件数・順序でも例外なく描画される', () => {
	const altPages = [
		{ id: 11, title: 'Zeta Note', slug: 'zeta-note', parent: 0, menuOrder: 3 },
		{ id: 12, title: 'Alpha Info', slug: 'alpha-info', parent: 0, menuOrder: 1 },
		{ id: 13, title: 'Mid', slug: 'mid', parent: 0, menuOrder: 2 },
	];

	it('別サイト名・別ページ群で例外なく描画され、site 名がサイトタイトルに現れる', () => {
		// 検出: site 名や固定文字列への過学習(ハードコード)。
		// Red理由: renderHeader 未実装。
		const ctx: RenderCtx = {
			global: cfg,
			renderState: { modalCounter: 0 },
			site: { name: 'Alpha Shop', url: 'https://example.test' },
			page: { isHome: false, isSingular: true },
			navigation: { post: { id: 4, content: NAV_PAGE_LIST }, pages: altPages },
		};
		let out = '';
		expect(() => {
			out = renderHeader(realTheme, ctx);
		}).not.toThrow();
		expect(out).toMatch(/<p class="wp-block-site-title">[\s\S]*?Alpha Shop[\s\S]*?<\/p>/);
	});

	it('ページ名が nav に現れ、menu_order 順に並ぶ', () => {
		// 検出: ページ名の固定化や、menu_order 順ソートの欠落。
		// 期待順序は README の「menu_order → title」規則に従う。
		// Red理由: renderHeader 未実装。
		const ctx: RenderCtx = {
			global: cfg,
			renderState: { modalCounter: 0 },
			site: { name: 'Alpha Shop', url: 'https://example.test' },
			page: { isHome: false, isSingular: true },
			navigation: { post: { id: 4, content: NAV_PAGE_LIST }, pages: altPages },
		};
		const out = renderHeader(realTheme, ctx);
		const iAlpha = out.indexOf('Alpha Info');
		const iMid = out.indexOf('>Mid<');
		const iZeta = out.indexOf('Zeta Note');
		expect(iAlpha).toBeGreaterThan(-1);
		expect(iMid).toBeGreaterThan(-1);
		expect(iZeta).toBeGreaterThan(-1);
		expect(iAlpha).toBeLessThan(iMid);
		expect(iMid).toBeLessThan(iZeta);
	});

	it('ページ名の <script> はエスケープされ、script 要素として出力されない', () => {
		// 検出: ページ名・サイト名の未エスケープ注入(XSS 相当)。
		// Red理由: renderHeader 未実装。
		const ctx: RenderCtx = {
			global: cfg,
			renderState: { modalCounter: 0 },
			site: { name: '<script>alert(1)</script>', url: 'https://example.test' },
			page: { isHome: false, isSingular: true },
			navigation: {
				post: { id: 4, content: NAV_PAGE_LIST },
				pages: [{ id: 21, title: '<script>x</script>', slug: 'xss', parent: 0, menuOrder: 0 }],
			},
		};
		const out = renderHeader(realTheme, ctx);
		expect(out).not.toMatch(/<script/i);
		expect(out).toContain('&lt;script&gt;');
	});
});

describe('モーダル番号採番 (renderState.modalCounter)', () => {
	it('同一 ctx で 2 回呼ぶと modal-1 → modal-2 と採番される', () => {
		// 検出: renderState の共有と連番採番。
		// Red理由: renderHeader 未実装。
		const ctx = ctxSingle();
		const first = renderHeader(realTheme, ctx);
		const second = renderHeader(realTheme, ctx);
		expect(modalIds(first)).toEqual(['modal-1']);
		expect(modalIds(second)).toEqual(['modal-2']);
	});

	it('新しい ctx では modal-1 から再開する', () => {
		// 検出: 採番状態が ctx ごとに独立しているか(グローバル状態の漏れ)。
		// Red理由: renderHeader 未実装。
		renderHeader(realTheme, ctxSingle());
		const fresh = renderHeader(realTheme, ctxSingle());
		expect(modalIds(fresh)).toEqual(['modal-1']);
	});
});

describe('拒否ケース', () => {
	it('parts/header.html に未対応ブロック <!-- wp:unknown/x /--> があると UnsupportedBlockError', () => {
		// 検出: 未登録ブロックを黙って捨てず拒否すること。
		// Red理由: renderHeader 未実装。
		const theme: ThemeFiles = {
			read: (p) => (p === 'parts/header.html' ? '<!-- wp:unknown/x /-->' : undefined),
		};
		const err = errorOf(() => renderHeader(theme, ctxSingle()));
		expect(err).toBeInstanceOf(UnsupportedBlockError);
	});

	it('parts/header.html が無いテーマは ThemeResolveError (code: unknown-part)', () => {
		// 検出: テンプレートパート欠落の拒否と、エラーコードの一致。
		// Red理由: renderHeader 未実装。
		const theme: ThemeFiles = { read: () => undefined };
		const err = errorOf(() => renderHeader(theme, ctxSingle()));
		expect(err).toBeInstanceOf(ThemeResolveError);
		expect((err as ThemeResolveError).code).toBe('unknown-part');
	});
});

describe('createDefaultRegistry: 登録ブロックの契約', () => {
	it('core/group, core/site-title, core/navigation, core/page-list, core/navigation-link を登録する', () => {
		// 検出: 合成に必要な 5 ブロックが既定レジストリに揃っているか。
		// Red理由: headerCompose.ts 未存在のため createDefaultRegistry が解決できない。
		const registry = createDefaultRegistry();
		expect([...registry.keys()].sort()).toEqual(
			[
				'core/group',
				'core/navigation',
				'core/navigation-link',
				'core/page-list',
				'core/site-title',
			].sort(),
		);
	});
});

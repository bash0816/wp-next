// SPDX-License-Identifier: GPL-3.0-only
// D-1d-2 core/navigation・core/page-list・core/navigation-link のテスト。実装 './navigationBlock.js' は未作成のため、
// static import の解決失敗でファイル全体がロード時に Red になる想定。
// 期待値は fixtures の HTML から抜き出す(ハードコード禁止)。比較は normalizeHtml で行い、属性順や parse5 の正規化差を無視する。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type DefaultTreeAdapterMap, parseFragment } from 'parse5';
import { describe, expect, it } from 'vitest';
import { type BlockRegistry, type RenderCtx, renderTree } from './blockRegistry.js';
import { navigationLinkRenderer, navigationRenderer, pageListRenderer } from './navigationBlock.js';
import { htmlEquals } from './normalizeDom.js';
import { type GlobalConfig, globalConfigFromThemeJson } from './layoutInput.js';
import { type ParsedBlock, UnsupportedBlockError } from './renderBlocks.js';

const FIXTURES = fileURLToPath(new URL('../../../fixtures/ref/', import.meta.url));
const THEME_DIR = join(FIXTURES, 'themes/twentytwentyfive');
const themeJson = JSON.parse(readFileSync(join(THEME_DIR, 'theme.json'), 'utf8'));
const blockLayoutDefaults = JSON.parse(
	readFileSync(join(FIXTURES, 'block-supports/layout-defaults.json'), 'utf8'),
);
const cfg: GlobalConfig = globalConfigFromThemeJson(themeJson, blockLayoutDefaults);

type PageRow = { id: number; title: string; slug: string; parent: number; menuOrder: number };
// D-1d-2 で RenderCtx に navigation / site が追加される前提の拡張型(テスト専用)
type NavCtx = RenderCtx & {
	site: { name: string; url: string };
	navigation: { post: { id: number; content: string } | null; pages: PageRow[] };
};

const SITE = { name: 'wpref', url: 'http://127.0.0.1:8080' };
const SAMPLE_PAGE: PageRow = { id: 2, title: 'Sample Page', slug: 'sample-page', parent: 0, menuOrder: 0 };
const PROT_PAGE: PageRow = { id: 3, title: 'Prot Page', slug: 'prot-page', parent: 0, menuOrder: 0 };

// header.php の pattern(fixtures/ref/themes/twentytwentyfive/patterns/header.php:24)と同じ属性
const HEADER_NAV_ATTRS = {
	overlayBackgroundColor: 'base',
	overlayTextColor: 'contrast',
	layout: { type: 'flex', justifyContent: 'right', flexWrap: 'wrap' },
};

const makeCtx = (
	navigation: NavCtx['navigation'],
	renderState = { modalCounter: 0 },
): NavCtx => ({
	global: cfg,
	renderState,
	site: SITE,
	navigation,
});

// fixture の HTML ファイルから <nav>...</nav> を抜き出す(複数行にまたがるため正規表現で取得)
function navFromFixture(relPath: string): string {
	const html = readFileSync(join(FIXTURES, relPath), 'utf8');
	const m = html.match(/<nav[\s\S]*?<\/nav>/);
	if (!m) throw new Error(`nav not found in ${relPath}`);
	return m[0];
}

function renderNav(attrs: Record<string, unknown>, ctx: NavCtx): string {
	navigationRenderer.validateAttrs(attrs);
	const block: ParsedBlock = {
		blockName: 'core/navigation',
		attrs,
		innerBlocks: [],
		innerHTML: '',
		innerContent: [],
	};
	const registry: BlockRegistry = new Map([
		['core/page-list', pageListRenderer],
		['core/navigation-link', navigationLinkRenderer],
	]);
	return navigationRenderer.render(block, ctx, (blocks) => renderTree(blocks, ctx, registry));
}

const captureError = (fn: () => unknown): unknown => {
	try {
		fn();
	} catch (e) {
		return e;
	}
	return undefined;
};

type Node = DefaultTreeAdapterMap['node'];
type El = DefaultTreeAdapterMap['element'];

// 出力を parse5 でパースし、要素を深さ優先で列挙する(実行可能タグや属性の検査用)
function elementsOf(html: string): El[] {
	const out: El[] = [];
	const walk = (nodes: Node[]): void => {
		for (const n of nodes) {
			if (n.nodeName.startsWith('#')) continue;
			const el = n as El;
			out.push(el);
			walk(el.childNodes as Node[]);
		}
	};
	walk(parseFragment(html).childNodes as Node[]);
	return out;
}

const modalIds = (html: string): string[] =>
	[...html.matchAll(/id="(modal-\d+)"/g)].map((m) => m[1] ?? '');

describe('core/navigation の fixture 一致', () => {
	// 検出対象: 単一ページ(Sample Page)のメニューが regions/header.html の nav と一致するか
	// 想定Red理由: navigationBlock.js 未作成のため import 解決に失敗しファイル全体が Red
	it('regions/header.html の nav と一致する(page-list 1件)', () => {
		const ctx = makeCtx({ post: { id: 4, content: '<!-- wp:page-list /-->' }, pages: [SAMPLE_PAGE] });
		const out = renderNav(HEADER_NAV_ATTRS, ctx);
		expect(htmlEquals(out, navFromFixture('regions/header.html'))).toBe(true);
	});

	// 検出対象: 公開ページが複数あるとき menu_order 順に並ぶか(protected/draft 版の nav)
	// 想定Red理由: 同上
	it('set-header2/header.pages-protected-and-draft.html の nav と一致する(page-list 2件)', () => {
		const ctx = makeCtx({
			post: { id: 4, content: '<!-- wp:page-list /-->' },
			pages: [PROT_PAGE, SAMPLE_PAGE],
		});
		const out = renderNav(HEADER_NAV_ATTRS, ctx);
		expect(htmlEquals(out, navFromFixture('set-header2/header.pages-protected-and-draft.html'))).toBe(true);
	});

	// 検出対象: navigation 投稿が navigation-link のみを持つとき、Bee リンクだけが出力されるか
	// 想定Red理由: 同上。navigation-link の attrs 形状は fixture の nav 出力から推定(dump.sql に該当投稿なし → 未検証)
	it('set-header2/header.navB-newer-draft-ignored.html の nav と一致する(navigation-link のみ)', () => {
		const ctx = makeCtx({
			post: {
				id: 4,
				content: '<!-- wp:navigation-link {"label":"Bee","url":"http://127.0.0.1:8080/b","kind":"custom"} /-->',
			},
			pages: [],
		});
		const out = renderNav(HEADER_NAV_ATTRS, ctx);
		expect(htmlEquals(out, navFromFixture('set-header2/header.navB-newer-draft-ignored.html'))).toBe(true);
	});
});

describe('モーダルIDの採番(renderState.modalCounter)', () => {
	// 検出対象: 同一 ctx で連続描画すると modal-1 → modal-2 と増えるか
	// 想定Red理由: 同上
	it('同一 ctx で 2 回描画すると modal-1, modal-2 になる', () => {
		const ctx = makeCtx({ post: { id: 4, content: '<!-- wp:page-list /-->' }, pages: [SAMPLE_PAGE] });
		const first = renderNav(HEADER_NAV_ATTRS, ctx);
		const second = renderNav(HEADER_NAV_ATTRS, ctx);
		expect(modalIds(first)).toEqual(['modal-1']);
		expect(modalIds(second)).toEqual(['modal-2']);
	});

	// 検出対象: 新しい ctx(カウンタ 0)で描画すると再び modal-1 に戻るか
	// 想定Red理由: 同上
	it('新しい ctx では採番が modal-1 から再開する', () => {
		const navigation = { post: { id: 4, content: '<!-- wp:page-list /-->' }, pages: [SAMPLE_PAGE] };
		renderNav(HEADER_NAV_ATTRS, makeCtx(navigation));
		const fresh = renderNav(HEADER_NAV_ATTRS, makeCtx(navigation));
		expect(modalIds(fresh)).toEqual(['modal-1']);
	});

	// 検出対象: modal-N-content が同じ N を共有するか
	// 想定Red理由: 同上
	it('modal-N と modal-N-content の番号が一致する', () => {
		const ctx = makeCtx({ post: { id: 4, content: '<!-- wp:page-list /-->' }, pages: [SAMPLE_PAGE] });
		const out = renderNav(HEADER_NAV_ATTRS, ctx);
		expect(out).toContain('id="modal-1"');
		expect(out).toContain('id="modal-1-content"');
	});
});

describe('エスケープ・インジェクション防御', () => {
	// 検出対象: ページタイトルに含まれる HTML が実行可能要素・イベント属性として出力されないか
	// 想定Red理由: 同上
	it('page title の <script> / <img onerror> / & / " が要素・属性として注入されない', () => {
		const evil: PageRow = {
			id: 9,
			title: '<script>alert(1)</script><img src=x onmouseover="alert(2)"> & "q"',
			slug: 'evil',
			parent: 0,
			menuOrder: 0,
		};
		const out = renderNav(HEADER_NAV_ATTRS, makeCtx({ post: { id: 4, content: '<!-- wp:page-list /-->' }, pages: [evil] }));
		const els = elementsOf(out);
		expect(els.some((e) => e.tagName === 'script')).toBe(false);
		expect(els.some((e) => e.tagName === 'img')).toBe(false);
		expect(els.some((e) => e.attrs.some((a) => a.name === 'onmouseover'))).toBe(false);
		// 表示テキストとしては残り、& と " はエスケープされる
		expect(out).toContain('&amp;');
	});

	// 検出対象: data-wp-context の JSON が属性値として壊れず、期待オブジェクトに一致するか
	// 想定Red理由: 同上
	it('data-wp-context が有効な JSON として deep-equal で読める', () => {
		const out = renderNav(HEADER_NAV_ATTRS, makeCtx({ post: { id: 4, content: '<!-- wp:page-list /-->' }, pages: [SAMPLE_PAGE] }));
		const nav = elementsOf(out).find((e) => e.tagName === 'nav');
		const raw = nav?.attrs.find((a) => a.name === 'data-wp-context')?.value;
		expect(raw).toBeDefined();
		expect(JSON.parse(raw as string)).toEqual({
			overlayOpenedBy: { click: false, hover: false, focus: false },
			type: 'overlay',
			roleAttribute: '',
			ariaLabel: 'Menu',
		});
	});
});

describe('異常系', () => {
	// 検出対象: 不正な ref 属性を RangeError で拒否するか
	// 想定Red理由: 同上
	it('attrs.ref が不正な値なら RangeError', () => {
		const err = captureError(() => navigationRenderer.validateAttrs({ ...HEADER_NAV_ATTRS, ref: 'abc' }));
		expect(err).toBeInstanceOf(RangeError);
	});

	// 検出対象: ctx.navigation が無いとき RangeError になるか
	// 想定Red理由: 同上
	it('ctx.navigation が無いと RangeError', () => {
		const ctx = { global: cfg, renderState: { modalCounter: 0 }, site: SITE } as unknown as NavCtx;
		const err = captureError(() => renderNav(HEADER_NAV_ATTRS, ctx));
		expect(err).toBeInstanceOf(RangeError);
	});

	// 検出対象: navigation 投稿が null のとき RangeError になるか
	// 想定Red理由: 同上
	it('navigation.post が null なら RangeError', () => {
		const err = captureError(() => renderNav(HEADER_NAV_ATTRS, makeCtx({ post: null, pages: [SAMPLE_PAGE] })));
		expect(err).toBeInstanceOf(RangeError);
	});

	// 検出対象: 未登録ブロックを含む navigation 投稿で UnsupportedBlockError が伝播するか(fail-closed)
	// 想定Red理由: 同上
	it('post.content に未登録ブロックがあれば UnsupportedBlockError が伝播する', () => {
		const ctx = makeCtx({ post: { id: 4, content: '<!-- wp:unknown/block /-->' }, pages: [] });
		const err = captureError(() => renderNav(HEADER_NAV_ATTRS, ctx));
		expect(err).toBeInstanceOf(UnsupportedBlockError);
	});

	// 検出対象: navigation-link の url に javascript: を使うと RangeError で拒否されるか
	// 想定Red理由: 同上
	it('navigation-link の url が javascript: なら RangeError', () => {
		const ctx = makeCtx({
			post: { id: 4, content: '<!-- wp:navigation-link {"label":"X","url":"javascript:alert(1)","kind":"custom"} /-->' },
			pages: [],
		});
		const err = captureError(() => renderNav(HEADER_NAV_ATTRS, ctx));
		expect(err).toBeInstanceOf(RangeError);
	});

	// 検出対象: navigation-link の url に data: を使うと RangeError で拒否されるか
	// 想定Red理由: 同上
	it('navigation-link の url が data: なら RangeError', () => {
		const ctx = makeCtx({
			post: { id: 4, content: '<!-- wp:navigation-link {"label":"X","url":"data:text/html,<script>1</script>","kind":"custom"} /-->' },
			pages: [],
		});
		const err = captureError(() => renderNav(HEADER_NAV_ATTRS, ctx));
		expect(err).toBeInstanceOf(RangeError);
	});

	// 検出対象: 親を持つページ(parent≠0)を page-list に渡すと RangeError で拒否されるか
	// 想定Red理由: 同上。階層メニューは D-1d-2 のスコープ外という前提
	it('parent≠0 のページが含まれると RangeError', () => {
		const child: PageRow = { id: 5, title: 'Child', slug: 'child', parent: 2, menuOrder: 0 };
		const err = captureError(() =>
			renderNav(HEADER_NAV_ATTRS, makeCtx({ post: { id: 4, content: '<!-- wp:page-list /-->' }, pages: [child] })),
		);
		expect(err).toBeInstanceOf(RangeError);
	});
});

describe('個別レンダラの公開', () => {
	// 検出対象: page-list / navigation-link レンダラが登録用に公開されているか(空の描画で例外なく動くか)
	// 想定Red理由: 同上
	it('pageListRenderer と navigationLinkRenderer が validateAttrs/render を持つ', () => {
		expect(typeof pageListRenderer.validateAttrs).toBe('function');
		expect(typeof pageListRenderer.render).toBe('function');
		expect(typeof navigationLinkRenderer.validateAttrs).toBe('function');
		expect(typeof navigationLinkRenderer.render).toBe('function');
	});
});

describe('navigation-link の URL 検証(追加)', () => {
	const linkWith = (url: string): string => {
		const attrs = { label: 'x', url, kind: 'custom' };
		navigationLinkRenderer.validateAttrs(attrs);
		const block: ParsedBlock = { blockName: 'core/navigation-link', attrs, innerBlocks: [], innerHTML: '', innerContent: [] };
		return navigationLinkRenderer.render(block, makeCtx({ post: null, pages: [] }), () => '');
	};

	it('プロトコル相対 URL(//host, /\\host)は RangeError', () => {
		// 検出対象: '/' 始まりの許可が外部ホストへのリンクを通してしまう穴。
		expect(captureError(() => linkWith('//evil.example/x'))).toBeInstanceOf(RangeError);
		expect(captureError(() => linkWith('/\\evil.example/x'))).toBeInstanceOf(RangeError);
	});

	it('ftp: など http(s) 以外の絶対 URL は RangeError、パス相対は通る', () => {
		// 検出対象: scheme 許可リストの緩和。
		expect(captureError(() => linkWith('ftp://example.test/'))).toBeInstanceOf(RangeError);
		expect(linkWith('/b')).toContain('href="/b"');
	});
});

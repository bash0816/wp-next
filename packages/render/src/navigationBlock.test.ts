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

// ===== D-2d STEP4: 非 responsive 経路(overlayMenu:"never" + インライン子)のテスト =====
// 実装前の位置づけ: 以下の D2d-NN は navigationBlock.ts の現状(インライン子を読まない / overlayMenu・orientation を無視 /
// aria-label を出さない / label・url 検証が未拡張)に対して Red になる想定。
// 「回帰ガード」と明記したものは現状でも Green になる(仕様の既存挙動を固定する目的)。
// 期待 HTML は fixtures から読む。ParsedBlock は手組みする(パーサへの依存を増やさないため)。

type D2dAttrs = Record<string, unknown>;

const D2D_REGISTRY: BlockRegistry = new Map([
	['core/page-list', pageListRenderer],
	['core/navigation-link', navigationLinkRenderer],
	['core/navigation', navigationRenderer],
]);

const linkBlock = (label: string, url = '#'): ParsedBlock => ({
	blockName: 'core/navigation-link',
	attrs: { label, url },
	innerBlocks: [],
	innerHTML: '',
	innerContent: [],
});

const navBlock = (attrs: D2dAttrs, children: ParsedBlock[]): ParsedBlock => ({
	blockName: 'core/navigation',
	attrs,
	innerBlocks: children,
	innerHTML: '',
	innerContent: [],
});

const renderInline = (blocks: ParsedBlock[], ctx: RenderCtx): string => renderTree(blocks, ctx, D2D_REGISTRY);

// footer.php 44〜62 行目と同じ構造(ラベルは PHP 展開後の素の文字列)
const FOOTER_ATTRS: D2dAttrs = { overlayMenu: 'never', layout: { type: 'flex', orientation: 'vertical' } };
const footerBlocks = (): ParsedBlock[] => [
	navBlock(FOOTER_ATTRS, [linkBlock('Blog'), linkBlock('About'), linkBlock('FAQs'), linkBlock('Authors')]),
	navBlock(FOOTER_ATTRS, [linkBlock('Events'), linkBlock('Shop'), linkBlock('Patterns'), linkBlock('Themes')]),
];

const ctxWithoutNav = (): NavCtx => ({ global: cfg, renderState: { modalCounter: 0 }, site: SITE }) as unknown as NavCtx;

const navsOf = (html: string): El[] => elementsOf(html).filter((e) => e.tagName === 'nav');
const attrOf = (el: El, name: string): string | null => el.attrs.find((a) => a.name === name)?.value ?? null;
const classesOf = (el: El): string[] => (attrOf(el, 'class') ?? '').split(/\s+/).filter((c) => c !== '');

// footer.html の指定行から <nav>...</nav> を抜き出す(行番号は 1 始まり)
function navOnLineFromFixture(relPath: string, lineNo: number): string {
	const line = readFileSync(join(FIXTURES, relPath), 'utf8').split('\n')[lineNo - 1] ?? '';
	const m = line.match(/<nav[\s\S]*?<\/nav>/);
	if (!m) throw new Error(`nav not found in ${relPath}:${lineNo}`);
	return m[0];
}

describe('D-2d: 非 responsive 経路(overlayMenu:"never" + インライン子)', () => {
	// D2d-01 検出対象: header 描画の後に同じ ctx で footer の nav 2つを描画すると、
	//   footer.html の 30・32 行目と正規化 DOM 一致し、wp-container-core-navigation-is-layout-831b2db5 を含むか
	// 想定Red理由: 現実装はインライン子を読まず ctx.navigation を要求する(RangeError)。
	//   成功しても is-vertical と aria-label を出さないため出力差が出る。
	it('D2d-01 footer の nav 2つが footer.html の 30・32 行目と正規化 DOM 一致する', () => {
		const ctx = makeCtx({ post: { id: 4, content: '<!-- wp:page-list /-->' }, pages: [SAMPLE_PAGE] });
		renderNav(HEADER_NAV_ATTRS, ctx); // header が aria-label カウンタを 1 消費する
		const nav1 = renderInline([footerBlocks()[0] as ParsedBlock], ctx);
		const nav2 = renderInline([footerBlocks()[1] as ParsedBlock], ctx);
		expect(htmlEquals(nav1, navOnLineFromFixture('regions/footer.html', 30))).toBe(true);
		expect(htmlEquals(nav2, navOnLineFromFixture('regions/footer.html', 32))).toBe(true);
		expect(classesOf(navsOf(nav1)[0] as El)).toContain('wp-container-core-navigation-is-layout-831b2db5');
	});

	// D2d-02a 検出対象: ref 無し + インライン子の navigation は ctx.navigation を省略しても描画できるか
	// 想定Red理由: 現実装は ctx.navigation 無しで RangeError を投げるため、例外が出て Red。
	it('D2d-02a ref 無し+インライン子なら ctx.navigation 無しでも描画できる', () => {
		const out = renderInline([footerBlocks()[0] as ParsedBlock], ctxWithoutNav());
		expect(navsOf(out)).toHaveLength(1);
		expect(elementsOf(out).filter((e) => e.tagName === 'li')).toHaveLength(4);
	});

	// D2d-02b 回帰ガード(現状でも Green): header の ref 無し+子なしは ctx.navigation 必須(従来どおり RangeError)
	it('D2d-02b header の ref 無し+子なしは ctx.navigation 無しで RangeError(従来挙動)', () => {
		expect(captureError(() => renderNav(HEADER_NAV_ATTRS, ctxWithoutNav()))).toBeInstanceOf(RangeError);
	});

	// D2d-03a 検出対象: overlayMenu:"never" は responsive の入れ物(button, modal-*, data-wp-*, responsive-container)を出さないか
	// 想定Red理由: 現実装は overlayMenu を無視し、常に responsive の入れ物を出力するため Red。
	it('D2d-03a overlayMenu:"never" は button / modal-* / data-wp-* / responsive-container を出さない', () => {
		const out = renderInline([footerBlocks()[0] as ParsedBlock], makeCtx({ post: null, pages: [SAMPLE_PAGE] }));
		const els = elementsOf(out);
		expect(els.some((e) => e.tagName === 'button')).toBe(false);
		expect(els.some((e) => e.attrs.some((a) => a.name.startsWith('data-wp-')))).toBe(false);
		expect(els.some((e) => classesOf(e).includes('wp-block-navigation__responsive-container'))).toBe(false);
		expect(modalIds(out)).toEqual([]);
	});

	// D2d-03b 検出対象: overlayMenu:"never" の描画で modalCounter を消費せず、次の responsive nav が modal-2 になるか
	// 想定Red理由: 現実装は never の nav でも modalCounter を +1 するため、modalCounter が 2 になり Red。
	it('D2d-03b overlayMenu:"never" は modalCounter を消費しない(次の responsive nav は modal-2)', () => {
		const ctx = makeCtx({ post: { id: 4, content: '<!-- wp:page-list /-->' }, pages: [SAMPLE_PAGE] });
		expect(modalIds(renderNav(HEADER_NAV_ATTRS, ctx))).toEqual(['modal-1']);
		renderInline(footerBlocks(), ctx);
		expect(ctx.renderState.modalCounter).toBe(1);
		expect(modalIds(renderNav(HEADER_NAV_ATTRS, ctx))).toEqual(['modal-2']);
	});

	// D2d-04a 検出対象: layout.orientation:"vertical" で nav と ul に is-vertical が付くか
	// 想定Red理由: 現実装は orientation を無視するため is-vertical が出ず Red。
	it('D2d-04a layout.orientation:"vertical" で nav と ul に is-vertical', () => {
		const out = renderInline([footerBlocks()[0] as ParsedBlock], makeCtx({ post: null, pages: [] }));
		const nav = navsOf(out)[0] as El;
		const ul = elementsOf(out).find((e) => e.tagName === 'ul') as El;
		expect(classesOf(nav)).toContain('is-vertical');
		expect(classesOf(ul)).toContain('is-vertical');
	});

	// D2d-04b 検出対象: orientation の不正値(horizontal/vertical 以外)を RangeError で拒否するか
	// 想定Red理由: 現実装は orientation を検証しないため例外が出ず Red。
	it('D2d-04b layout.orientation の不正値は RangeError', () => {
		for (const orientation of ['diagonal', 1]) {
			const err = captureError(() =>
				navigationRenderer.validateAttrs({ overlayMenu: 'never', layout: { type: 'flex', orientation } }),
			);
			expect(err, `orientation=${String(orientation)}`).toBeInstanceOf(RangeError);
		}
	});

	// D2d-04c 回帰ガード(現状でも Green): orientation:"horizontal" は受理される
	it('D2d-04c layout.orientation:"horizontal" は受理される', () => {
		expect(
			captureError(() => navigationRenderer.validateAttrs({ overlayMenu: 'never', layout: { type: 'flex', orientation: 'horizontal' } })),
		).toBeUndefined();
	});

	// D2d-04d 検出対象: overlayMenu の未知値(never 以外で省略以外)を RangeError で拒否するか
	// 想定Red理由: 現実装は overlayMenu を検証しないため例外が出ず Red。
	it('D2d-04d overlayMenu の未知値("always" / "mobile")は RangeError', () => {
		for (const overlayMenu of ['always', 'mobile']) {
			const err = captureError(() => navigationRenderer.validateAttrs({ overlayMenu }));
			expect(err, `overlayMenu=${overlayMenu}`).toBeInstanceOf(RangeError);
		}
	});

	// D2d-05a 検出対象: header(responsive)→ footer 2つの順で、header は属性なし、footer は " 2" / " 3" になるか
	// 想定Red理由: 現実装は aria-label を出さず、かつ header の responsive nav がカウンタを消費しないため Red。
	it('D2d-05a header→footer の順で aria-label カウンタを共有する(header なし / " 2" / " 3")', () => {
		const ctx = makeCtx({ post: { id: 4, content: '<!-- wp:page-list /-->' }, pages: [SAMPLE_PAGE] });
		const headerOut = renderNav(HEADER_NAV_ATTRS, ctx);
		const footerOut = renderInline(footerBlocks(), ctx);
		expect(attrOf(navsOf(headerOut)[0] as El, 'aria-label')).toBeNull();
		expect(navsOf(footerOut).map((n) => attrOf(n, 'aria-label'))).toEqual([' 2', ' 3']);
	});

	// D2d-05b 検出対象: 新しい ctx で footer を単独描画すると 1つ目は属性なし・2つ目は " 2" になり、
	//   新しい ctx では採番がリセットされるか
	// 想定Red理由: 現実装は aria-label を出さないため、2つ目の " 2" が出ず Red。
	it('D2d-05b 新しい ctx では採番がリセットされ、footer 単独は [なし, " 2"]', () => {
		const out1 = renderInline(footerBlocks(), makeCtx({ post: null, pages: [] }));
		expect(navsOf(out1).map((n) => attrOf(n, 'aria-label'))).toEqual([null, ' 2']);
		const out2 = renderInline([footerBlocks()[0] as ParsedBlock], makeCtx({ post: null, pages: [] }));
		expect(navsOf(out2).map((n) => attrOf(n, 'aria-label'))).toEqual([null]);
	});

	// D2d-05c 検出対象: 名前に __proto__ / constructor / toString を使ってもカウンタが壊れず、他の名前に影響しないか
	// 想定Red理由: 現実装は aria-label を出さないため Red。カウンタ実装が素のオブジェクトだと __proto__ で壊れる。
	it('D2d-05c 名前 __proto__ / constructor / toString でもカウンタが壊れず他の名前に影響しない', () => {
		const names = ['__proto__', '__proto__', 'constructor', 'toString'];
		const out = renderInline(
			names.map((n) => navBlock({ ariaLabel: n, overlayMenu: 'never', layout: { type: 'flex', orientation: 'vertical' } }, [linkBlock('A')])),
			makeCtx({ post: null, pages: [] }),
		);
		expect(navsOf(out).map((n) => attrOf(n, 'aria-label'))).toEqual(['__proto__', '__proto__ 2', 'constructor', 'toString']);
	});

	// D2d-06a 検出対象: attrs.ariaLabel が名前として使われ、同名 2 つ目が "<名前> 2" になるか
		// 想定Red理由: 現実装は aria-label を出さないため 2 つ目が出ず Red。
	it('D2d-06a attrs.ariaLabel が優先され、同名 2 つ目は "<名前> 2"', () => {
		const out = renderInline(
			[
				navBlock({ ariaLabel: 'Shop', overlayMenu: 'never', layout: { type: 'flex', orientation: 'vertical' } }, [linkBlock('A')]),
				navBlock({ ariaLabel: 'Shop', overlayMenu: 'never', layout: { type: 'flex', orientation: 'vertical' } }, [linkBlock('A')]),
			],
			makeCtx({ post: null, pages: [] }),
		);
		// 非空の名前は 1 つ目から aria-label が付く(空名のみ 1 つ目は属性なし)。WP ソースとの照合は未実施。
		expect(navsOf(out).map((n) => attrOf(n, 'aria-label'))).toEqual(['Shop', 'Shop 2']);
	});

	// D2d-06b 検出対象: ariaLabel に " / <>& / " onmouseover="x を与えても nav に属性が増えず、値が保持されるか
	// 想定Red理由: 現実装は aria-label を出さないため値が保持されず Red。
	it.each(['"', '<>&', '" onmouseover="x'])('D2d-06b ariaLabel=%s でも属性が増えず値が保持される', (s) => {
		const attrsFor = (name: string): D2dAttrs => ({
			ariaLabel: name,
			overlayMenu: 'never',
			layout: { type: 'flex', orientation: 'vertical' },
		});
		const baseOut = renderInline(
			[navBlock(attrsFor('plain'), [linkBlock('A')]), navBlock(attrsFor('plain'), [linkBlock('A')])],
			makeCtx({ post: null, pages: [] }),
		);
		const out = renderInline(
			[navBlock(attrsFor(s), [linkBlock('A')]), navBlock(attrsFor(s), [linkBlock('A')])],
			makeCtx({ post: null, pages: [] }),
		);
		const baseNav = navsOf(baseOut)[1] as El;
		const nav = navsOf(out)[1] as El;
		expect(nav.attrs.map((a) => a.name).sort()).toEqual(baseNav.attrs.map((a) => a.name).sort());
		expect(nav.attrs.some((a) => a.name === 'onmouseover')).toBe(false);
		expect(attrOf(nav, 'aria-label')).toBe(`${s} 2`);
	});

	// D2d-07a 回帰ガード(現状でも Green): [\p{L}\p{N} ._-] のみのラベルは受理される
	it('D2d-07a 受理: [\\p{L}\\p{N} ._-] のラベルは RangeError にならない', () => {
		for (const label of ['Blog', 'About us', 'Ünïcödé 日本語', 'a.b_c-1', '٣ x']) {
			const err = captureError(() => navigationLinkRenderer.validateAttrs({ label, url: 'https://example.com/' }));
			expect(err, `label=${label}`).toBeUndefined();
		}
	});

	// D2d-07b 検出対象: 許可外の文字(& " < > と &amp; のような実体参照風)を RangeError で拒否するか(fail-closed)
	// 注: url は現状でも受理される絶対URLを使う('#' だと url 拒否で誤って通る)。
	// 想定Red理由: 現実装はラベルの文字種を検証しないため例外が出ず Red。
	it('D2d-07b 許可外文字と実体参照風のラベルは RangeError', () => {
		for (const label of ['A&B', 'A"B', 'A<B', 'A>B', 'A&amp;B', '&#39;']) {
			const err = captureError(() => navigationLinkRenderer.validateAttrs({ label, url: 'https://example.com/' }));
			expect(err, `label=${label}`).toBeInstanceOf(RangeError);
		}
	});

	// D2d-07c 回帰ガード(現状でも Green): 空ラベルの扱い(label 省略・空文字)は既存挙動のまま受理される
	it('D2d-07c 空ラベル(省略・空文字)は既存挙動のまま受理される', () => {
		expect(captureError(() => navigationLinkRenderer.validateAttrs({ url: 'https://example.com/' }))).toBeUndefined();
		expect(captureError(() => navigationLinkRenderer.validateAttrs({ label: '', url: 'https://example.com/' }))).toBeUndefined();
	});

	// D2d-08a 検出対象: インライン子の url で '#' と '#abc_-1' が受理され、href に出るか
	// 想定Red理由: 現実装の assertLinkUrl は new URL('#') が失敗するため '#' を RangeError で拒否し Red。
	it('D2d-08a url の "#" と "#abc_-1" は受理され href に出る', () => {
		const ctx = makeCtx({ post: null, pages: [] });
		expect(captureError(() => navigationLinkRenderer.validateAttrs({ label: 'x', url: '#' }))).toBeUndefined();
		const out = renderInline([linkBlock('X', '#abc_-1')], ctx);
		expect(out).toContain('href="#abc_-1"');
	});

	// D2d-08b 回帰ガード(現状でも Green): javascript: / プロトコル相対 / 空白や " を含む # は RangeError
	it('D2d-08b javascript: / //host / "#a b" / "#\\"x" は RangeError', () => {
		for (const url of ['javascript:alert(1)', '//evil.example', '#a b', '#"x']) {
			const err = captureError(() => navigationLinkRenderer.validateAttrs({ label: 'x', url }));
			expect(err, `url=${url}`).toBeInstanceOf(RangeError);
		}
	});

	// D2d-09 回帰ガード(現状でも Green): ref 指定の navigation は overlayMenu:"never" でも RangeError
	it('D2d-09 ref 指定の navigation は overlayMenu:"never" でも RangeError', () => {
		expect(captureError(() => navigationRenderer.validateAttrs({ overlayMenu: 'never', ref: 7 }))).toBeInstanceOf(RangeError);
		const err = captureError(() =>
			renderInline([navBlock({ overlayMenu: 'never', ref: 7 }, [linkBlock('A')])], makeCtx({ post: null, pages: [] })),
		);
		expect(err).toBeInstanceOf(RangeError);
	});

	// D2d-10 検出対象: インライン子に未登録ブロックがあると UnsupportedBlockError で拒否されるか(renderChildren 経由)
	// 想定Red理由: 現実装はインライン子を読まず ctx.navigation 不在の RangeError を投げるため、UnsupportedBlockError にならず Red。
	it('D2d-10 インライン子の未登録ブロックは UnsupportedBlockError', () => {
		const unknownChild: ParsedBlock = {
			blockName: 'core/unknown-block',
			attrs: {},
			innerBlocks: [],
			innerHTML: '',
			innerContent: [],
		};
		const err = captureError(() => renderInline([navBlock(FOOTER_ATTRS, [unknownChild])], ctxWithoutNav()));
		expect(err).toBeInstanceOf(UnsupportedBlockError);
	});
});

// ===== D-2d STEP6 補強(mutation 生存の解消) =====
describe('D-2d: 補強', () => {
	// D2d-11 responsive 経路(overlayMenu 省略)にインライン子を持ち込むと拒否する(子は投稿本文からのみ解析する)
	it('D2d-11 overlayMenu 省略 + innerBlocks 非空は RangeError', () => {
		const ctx = makeCtx({ post: { id: 4, content: '<!-- wp:page-list /-->' }, pages: [SAMPLE_PAGE] });
		const err = captureError(() => renderInline([navBlock({}, [linkBlock('A')])], ctx));
		expect(err).toBeInstanceOf(RangeError);
		expect(String((err as Error).message)).toContain('innerBlocks');
	});

	// D2d-12 overlayMenu:"never" で未実測の属性を与えると、属性ごとに RangeError(1つずつ検査して片方の検証削除を検出)
	it.each([
		['justifyContent', { layout: { type: 'flex', justifyContent: 'center' } }],
		['flexWrap', { layout: { type: 'flex', flexWrap: 'nowrap' } }],
		['overlayTextColor', { overlayTextColor: 'contrast' }],
		['overlayBackgroundColor', { overlayBackgroundColor: 'base' }],
	])('D2d-12 overlayMenu:"never" + %s は RangeError', (key, extra) => {
		const err = captureError(() =>
			renderInline([navBlock({ overlayMenu: 'never', ...extra }, [linkBlock('A')])], makeCtx({ post: null, pages: [] })),
		);
		expect(err, key).toBeInstanceOf(RangeError);
		expect(String((err as Error).message)).toContain('overlayMenu: never');
	});

	// D2d-13 ariaLabel が文字列以外なら RangeError(数値が "123" として出力されない)
	it.each([123, null, {}, ['x']])('D2d-13 ariaLabel=%j は RangeError', (v) => {
		const err = captureError(() => navigationRenderer.validateAttrs({ overlayMenu: 'never', ariaLabel: v }));
		expect(err).toBeInstanceOf(RangeError);
		expect(String((err as Error).message)).toContain('ariaLabel');
	});
});

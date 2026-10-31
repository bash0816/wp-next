// SPDX-License-Identifier: GPL-3.0-only
// D-2b core/columns / core/column のテスト。
// 実装 './columnsBlock.js' は未作成のため、static import の解決失敗でファイル全体がロード時に Red になる想定(assertion-level Red ではない)。
// 期待値は fixtures/ref/regions/footer.html から columns 要素を抜き出して得る(ハードコード禁止)。比較は htmlEquals。
// 手書きの期待値は WP 7.1.3 wp-includes/blocks/{columns,column}.php の規則に基づく(未照合)。各 it のコメントに明記。
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type DefaultTreeAdapterMap, parseFragment } from 'parse5';
import { describe, expect, it, vi } from 'vitest';
import { type BlockRegistry, type BlockRenderer, type RenderCtx, renderTree } from './blockRegistry.js';
import { columnRenderer, columnsRenderer } from './columnsBlock.js';
import { htmlEquals, normalizeHtml } from './normalizeDom.js';
import { type GlobalConfig, globalConfigFromThemeJson } from './layoutInput.js';
import { type ParsedBlock, UnsupportedBlockError } from './renderBlocks.js';
import { siteTaglineRenderer } from './siteTaglineBlock.js';
import { siteTitleRenderer } from './siteTitleBlock.js';
import { spacerRenderer } from './spacerBlock.js';

const FIXTURES = fileURLToPath(new URL('../../../fixtures/ref/', import.meta.url));
const THEME_DIR = join(FIXTURES, 'themes/twentytwentyfive');
const FOOTER_HTML = join(FIXTURES, 'regions/footer.html');
const themeJson = JSON.parse(readFileSync(join(THEME_DIR, 'theme.json'), 'utf8'));
const blockLayoutDefaults = JSON.parse(
	readFileSync(join(FIXTURES, 'block-supports/layout-defaults.json'), 'utf8'),
);
const cfg: GlobalConfig = globalConfigFromThemeJson(themeJson, blockLayoutDefaults);

const registry: BlockRegistry = new Map<string, BlockRenderer>([
	['core/columns', columnsRenderer],
	['core/column', columnRenderer],
	['core/site-title', siteTitleRenderer],
	['core/site-tagline', siteTaglineRenderer],
	['core/spacer', spacerRenderer],
]);

// site-title / site-tagline 用の文脈(tagline 空は未設定相当で空出力)
const ctxFor = (global: GlobalConfig = cfg): RenderCtx => ({
	global,
	renderState: { modalCounter: 0 },
	site: { name: 'wpref', url: 'http://127.0.0.1:8080', tagline: '' },
	page: { isHome: false, isSingular: true },
});

const blk = (
	blockName: string,
	attrs: Record<string, unknown> | null,
	innerBlocks: ParsedBlock[] = [],
): ParsedBlock => ({ blockName, attrs, innerBlocks, innerHTML: '', innerContent: [] });

// validateAttrs と render の両方を通す(siteTitleBlock.test.ts と同じ読み方)
function run(
	renderer: BlockRenderer,
	block: ParsedBlock,
	ctx: RenderCtx = ctxFor(),
	renderChildren: (blocks: ParsedBlock[]) => string = () => '',
): string {
	renderer.validateAttrs(block.attrs ?? {});
	return renderer.render(block, ctx, renderChildren);
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

// 出力を parse5 でパースし、要素を深さ優先で列挙する
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
const attrValue = (el: El, name: string): string | undefined =>
	el.attrs.find((a) => a.name === name)?.value;
const classesOf = (el: El): string[] =>
	(attrValue(el, 'class') ?? '').split(/\s+/).filter((c) => c !== '');
const byClass = (html: string, cls: string): El[] =>
	elementsOf(html).filter((e) => classesOf(e).includes(cls));
const childElements = (el: El): El[] =>
	(el.childNodes as Node[]).filter((n) => !n.nodeName.startsWith('#')) as El[];
function descendants(el: El): El[] {
	const out: El[] = [];
	const walk = (ns: Node[]): void => {
		for (const n of ns) {
			if (n.nodeName.startsWith('#')) continue;
			out.push(n as El);
			walk((n as El).childNodes as Node[]);
		}
	};
	walk(el.childNodes as Node[]);
	return out;
}
const hashClassOf = (html: string): string | undefined =>
	elementsOf(html)[0]
		? classesOf(elementsOf(html)[0] as El).find((c) => c.startsWith('wp-container-core-columns-is-layout-'))
		: undefined;

// fixture 由来の抜き出し: `<div class="wp-block-columns` で始まる div を対応する閉じタグまで数えて切り出す
function extractColumnsDiv(src: string): string {
	const start = src.indexOf('<div class="wp-block-columns');
	if (start < 0) throw new Error('footer.html に columns の div が無い');
	const re = /<(\/?)div\b[^>]*>/g;
	re.lastIndex = start;
	let depth = 0;
	for (let m = re.exec(src); m !== null; m = re.exec(src)) {
		depth += m[1] ? -1 : 1;
		if (depth === 0) return src.slice(start, m.index + m[0].length);
	}
	throw new Error('columns div が閉じていない');
}

describe('D-2b core/columns / core/column', () => {
	it('D2b-01 基準一致: columns > [column{100%} > site-title+tagline, column{""} > spacer] が footer.html の columns 要素と一致する', () => {
		// 検出対象: columns/column の構造・class・style 導出・子の再帰描画の総合。
		// 期待 Red: columnsBlock.js 未作成のため収集失敗。実装後も不一致なら構造差。
		// 根拠: WP 7.1.3 wp-includes/blocks/{columns,column}.php の規則(未照合)。
		const expected = extractColumnsDiv(readFileSync(FOOTER_HTML, 'utf8'));
		expect(expected.startsWith('<div class="wp-block-columns')).toBe(true);
		const tree = [
			blk('core/columns', {}, [
				blk('core/column', { width: '100%' }, [
					blk('core/site-title', { level: 2 }),
					blk('core/site-tagline', {}),
				]),
				blk('core/column', { width: '' }, [
					blk('core/spacer', { height: 'var:preset|spacing|40', width: '0px' }),
				]),
			]),
		];
		const actual = renderTree(tree, ctxFor(), registry);
		expect(normalizeHtml(actual)).toBe(normalizeHtml(expected));
		expect(htmlEquals(actual, expected)).toBe(true);
	});

	it('D2b-02 column width 正常系: 未指定/"" は style 無し、"100%"・"30%" は flex-basis、class トークンも固定', () => {
		// 検出対象: width→flex-basis の導出と、空値時に style 属性を出さないこと。
		// 根拠: WP 7.1.3 column.php の style 出力規則(未照合)。
		// 期待 Red: 未実装。cols の存在を先に assert するため stub でも空出力の偶然 Green にならない。
		const cases: Array<[Record<string, unknown>, string | undefined]> = [
			[{ width: '' }, undefined],
			[{}, undefined],
			[{ width: '100%' }, 'flex-basis:100%'],
			[{ width: '30%' }, 'flex-basis:30%'],
		];
		for (const [attrs, want] of cases) {
			const out = run(columnRenderer, blk('core/column', attrs));
			const cols = byClass(out, 'wp-block-column');
			expect(cols, JSON.stringify(attrs)).toHaveLength(1);
			const col = cols[0] as El;
			expect(attrValue(col, 'style'), JSON.stringify(attrs)).toBe(want);
			expect([...classesOf(col)].sort()).toEqual([
				'is-layout-flow',
				'wp-block-column',
				'wp-block-column-is-layout-flow',
			]);
		}
	});

	it.each(['abc', '1;x', '30', '-5%', 'a"b%'])(
		'D2b-03 column width 不正 "%s" は RangeError (validate と render の両方を通す)',
		(w) => {
			// 検出対象: width の fail-closed 検証。期待 Red: 未実装なら例外が出ない/収集失敗。
			expect(captureError(() => run(columnRenderer, blk('core/column', { width: w })))).toBeInstanceOf(
				RangeError,
			);
		},
	);

	it('D2b-04 型不正(数値 width)・未知属性は RangeError (column / columns 両方)', () => {
		// 検出対象: 型検証と未知属性の拒否。期待 Red: 未実装なら例外が出ない/収集失敗。
		expect(captureError(() => run(columnRenderer, blk('core/column', { width: 30 })))).toBeInstanceOf(
			RangeError,
		);
		expect(
			captureError(() => run(columnRenderer, blk('core/column', { width: '30%', foo: 1 }))),
		).toBeInstanceOf(RangeError);
		expect(captureError(() => run(columnsRenderer, blk('core/columns', { foo: 1 })))).toBeInstanceOf(
			RangeError,
		);
	});

	it('D2b-05 属性導出の独立検査: innerHTML を固定したまま attrs.width=30% だけ変えると flex-basis:30%', () => {
		// 検出対象: style を attrs.width から導出しているか(保存 HTML 依存でないか)。
		// 期待 Red: 未実装で収集失敗。
		const saved = '<div class="wp-block-column" style="flex-basis:100%"></div>';
		const block: ParsedBlock = {
			...blk('core/column', { width: '30%' }),
			innerHTML: saved,
			innerContent: [saved],
		};
		const cols = byClass(run(columnRenderer, block), 'wp-block-column');
		expect(cols).toHaveLength(1);
		expect(attrValue(cols[0] as El, 'style')).toBe('flex-basis:30%');
	});

	it('D2b-06 保存 HTML の style を複写しない: width="" で innerHTML が flex-basis:100% でも style 無し', () => {
		// 検出対象: innerHTML/innerContent の style をコピーしていないこと。
		// 期待 Red: 未実装で収集失敗。
		const saved = '<div class="wp-block-column" style="flex-basis:100%"></div>';
		const block: ParsedBlock = {
			...blk('core/column', { width: '' }),
			innerHTML: saved,
			innerContent: [saved],
		};
		const cols = byClass(run(columnRenderer, block), 'wp-block-column');
		expect(cols).toHaveLength(1);
		expect(attrValue(cols[0] as El, 'style')).toBeUndefined();
	});

	it('D2b-07 columns コンテナハッシュ: 基準 ctx.global で wp-container-core-columns-is-layout-794e3cfa と class 集合が一致', () => {
		// 検出対象: containerClassName('core/columns', layoutHashInput(...)) の入力と規則。
		// 期待値 794e3cfa と class 集合は footer.html / expected.html 由来。
		// 独立 md5 検算は未実施: toPhpJson 相当の再実装が必要で、入力値(core/columns の blockLayoutDefaults 等)の読み切りが範囲外のため。D2b-08 の変化検査と組で代替。
		const out = run(columnsRenderer, blk('core/columns', {}));
		const roots = elementsOf(out);
		expect(roots).toHaveLength(1);
		const root = roots[0] as El;
		expect(root.tagName).toBe('div');
		expect([...classesOf(root)].sort()).toEqual([
			'is-layout-flex',
			'wp-block-columns',
			'wp-block-columns-is-layout-flex',
			'wp-container-core-columns-is-layout-794e3cfa',
		]);
	});

	it('D2b-08 ctx.global の blockGap を変えるとコンテナハッシュが変わる', () => {
		// 検出対象: ハッシュ入力に gap が含まれているか。
		// 期待 Red: 未実装で収集失敗。gap 変更で同一ハッシュなら layoutHashInput 結線の欠落。
		const base = hashClassOf(run(columnsRenderer, blk('core/columns', {}), ctxFor(cfg)));
		// styles.blocks['core/columns'] の gap が優先されるため、ブロック別 gap を変える(layoutInput の決定順: ブロック別 > グローバル)。
		const changedCfg: GlobalConfig = {
			...cfg,
			blockGapByBlock: { ...cfg.blockGapByBlock, 'core/columns': 'var:preset|spacing|60' },
		};
		const changed = hashClassOf(run(columnsRenderer, blk('core/columns', {}), ctxFor(changedCfg)));
		expect(base).toBe('wp-container-core-columns-is-layout-794e3cfa');
		expect(changed).toMatch(/^wp-container-core-columns-is-layout-[0-9a-f]{8}$/);
		expect(changed).not.toBe(base);
	});

	it('D2b-14 コンテナハッシュの独立検算: md5(PHP形式JSON) の先頭8桁と一致(被検査側 helper 不使用)', () => {
		// 検出対象: ハッシュ入力(layout/blockGap)の誤り。基準 794e3cfa は実測、変更後は規則から手計算。
		// 根拠: WP 7.1.3 wp-includes/block-supports/layout.php の hash 規則(wp_unique_id ではなく md5(wp_json_encode(...)))。基準値 794e3cfa を独立に再現できることを STEP6 で確認済み。
		const md5 = (json: string): string => createHash('md5').update(json).digest('hex').slice(0, 8);
		const cls = (gapCss: string): string =>
			`wp-container-core-columns-is-layout-${md5(`[{"type":"flex","flexWrap":"nowrap"},true,null,false,"${gapCss}",null]`)}`;
		expect(cls('var(--wp--preset--spacing--50)')).toBe('wp-container-core-columns-is-layout-794e3cfa');
		const base = hashClassOf(run(columnsRenderer, blk('core/columns', {}), ctxFor(cfg)));
		expect(base).toBe(cls('var(--wp--preset--spacing--50)'));
		const changedCfg: GlobalConfig = {
			...cfg,
			blockGapByBlock: { ...cfg.blockGapByBlock, 'core/columns': 'var:preset|spacing|60' },
		};
		const changed = hashClassOf(run(columnsRenderer, blk('core/columns', {}), ctxFor(changedCfg)));
		expect(changed).toBe(cls('var(--wp--preset--spacing--60)'));
	});

	it('D2b-09 再帰: columns/column は子を渡された renderChildren に block.innerBlocks のまま委譲する', () => {
		// 検出対象: 子描画が renderChildren 経由で、引数が block.innerBlocks であること。
		// 期待 Red: 未実装で収集失敗。
		const kids = [blk('core/spacer', { height: '10px' })];
		const spyCol = vi.fn((_: ParsedBlock[]) => '<span data-child="1"></span>');
		const colBlock = blk('core/column', { width: '30%' }, kids);
		const outCol = run(columnRenderer, colBlock, ctxFor(), spyCol);
		expect(spyCol).toHaveBeenCalledTimes(1);
		expect(spyCol.mock.calls[0]?.[0]).toBe(kids);
		expect(
			elementsOf(outCol).some((e) => e.tagName === 'span' && attrValue(e, 'data-child') === '1'),
		).toBe(true);

		const colsKids = [colBlock];
		const spyCols = vi.fn((_: ParsedBlock[]) => '<span data-child="2"></span>');
		const outCols = run(columnsRenderer, blk('core/columns', {}, colsKids), ctxFor(), spyCols);
		expect(spyCols).toHaveBeenCalledTimes(1);
		expect(spyCols.mock.calls[0]?.[0]).toBe(colsKids);
		expect(
			elementsOf(outCols).some((e) => e.tagName === 'span' && attrValue(e, 'data-child') === '2'),
		).toBe(true);
	});

	it('D2b-10 renderTree 経由: column 内の spacer が再帰描画され column の子孫になる', () => {
		// 検出対象: 実レジストリでの再帰 dispatch。期待 Red: 未実装で収集失敗。
		const out = renderTree(
			[blk('core/columns', {}, [blk('core/column', { width: '30%' }, [blk('core/spacer', { height: '10px' })])])],
			ctxFor(),
			registry,
		);
		// 同一の解析結果から取り出す(別解析のノードは参照比較できない)。
		const all = elementsOf(out);
		const hasClass = (e: El, c: string): boolean => classesOf(e).includes(c);
		const cols = all.filter((e) => hasClass(e, 'wp-block-column'));
		expect(cols).toHaveLength(1);
		const spacers = all.filter((e) => hasClass(e, 'wp-block-spacer'));
		expect(spacers).toHaveLength(1);
		expect(descendants(cols[0] as El)).toContain(spacers[0]);
		expect(attrValue(spacers[0] as El, 'style')?.split(';')).toContain('height:10px');
	});

	it('D2b-11 未知ブロックが column 内にあると UnsupportedBlockError (blockName 付き)', () => {
		// 検出対象: 再帰経路でも fail-closed が効くこと。期待 Red: 未実装で収集失敗。
		const err = captureError(() =>
			renderTree(
				[blk('core/columns', {}, [blk('core/column', { width: '' }, [blk('core/unknown-x', {})])])],
				ctxFor(),
				registry,
			),
		);
		expect(err).toBeInstanceOf(UnsupportedBlockError);
		expect((err as UnsupportedBlockError).blockName).toBe('core/unknown-x');
	});

	it('D2b-12 未知ブロックが columns 直下にあると UnsupportedBlockError (blockName 付き)', () => {
		// 検出対象: columns 直下の子も同じ経路で拒否されること。期待 Red: 未実装で収集失敗。
		const err = captureError(() =>
			renderTree([blk('core/columns', {}, [blk('core/unknown-y', {})])], ctxFor(), registry),
		);
		expect(err).toBeInstanceOf(UnsupportedBlockError);
		expect((err as UnsupportedBlockError).blockName).toBe('core/unknown-y');
	});

	it('D2b-13 子の無い columns/column と、空 column 2 つの並びが構造を保つ', () => {
		// 検出対象: 空入力でも構造が壊れないこと。期待 Red: 未実装で収集失敗。
		const emptyCols = elementsOf(run(columnsRenderer, blk('core/columns', {})));
		expect(emptyCols).toHaveLength(1);
		expect(childElements(emptyCols[0] as El)).toHaveLength(0);

		const emptyCol = elementsOf(run(columnRenderer, blk('core/column', { width: '30%' })));
		expect(emptyCol).toHaveLength(1);
		expect((emptyCol[0] as El).childNodes).toHaveLength(0);
		expect(attrValue(emptyCol[0] as El, 'style')).toBe('flex-basis:30%');

		const two = renderTree(
			[blk('core/columns', {}, [blk('core/column', { width: '' }), blk('core/column', { width: '100%' })])],
			ctxFor(),
			registry,
		);
		const root = elementsOf(two)[0] as El;
		const kids = childElements(root);
		expect(kids).toHaveLength(2);
		for (const k of kids) {
			expect(classesOf(k)).toContain('wp-block-column');
		}
		expect(attrValue(kids[0] as El, 'style')).toBeUndefined();
		expect(attrValue(kids[1] as El, 'style')).toBe('flex-basis:100%');
	});
});

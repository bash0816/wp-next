// SPDX-License-Identifier: GPL-3.0-only
// D-2e STEP4: footer 合成 (renderFooter) のテスト。test_id は D2e-01 〜 D2e-10。
// 期待値はすべて fixtures/ref の HTML と dump.sql から取得する(ハードコードしない)。
// Red期待: footerCompose.ts はスタブ(throw new Error('not implemented'))のため、
//          renderFooter を呼ぶテストは feature gap による失敗になる。
//          D2e-07 は headerCompose.test.ts 側の別ファイルで扱う。
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { RenderCtx } from './blockRegistry.js';
import { renderFooter } from './footerCompose.js';
import { renderHeader } from './headerCompose.js';
import { htmlEquals } from './normalizeDom.js';
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

// header/footer 共通の単一派生 ctx (D2e-01 の baseline 用)。
function ctxSingle(): RenderCtx {
	return {
		global: cfg,
		renderState: { modalCounter: 0 },
		site: { ...SITE_WPREF, tagline: '', logoId: null },
		page: { isHome: false, isSingular: true },
		navigation: { post: { id: 4, content: NAV_PAGE_LIST }, pages: [samplePageFromDump()] },
	};
}

// home 派生 ctx。site / navigation は呼び出し側で差し替える。
function ctxHome(
	site: NonNullable<RenderCtx['site']>,
	navContent: string,
): RenderCtx {
	return {
		global: cfg,
		renderState: { modalCounter: 0 },
		site,
		page: { isHome: true, isSingular: false },
		navigation: { post: { id: 4, content: navContent }, pages: [samplePageFromDump()] },
	};
}

// 単一 ctx に任意の部分を上書きする。
function ctxOverride(partial: Partial<RenderCtx>): RenderCtx {
	return { ...ctxSingle(), ...partial };
}

describe('renderFooter: 単一派生 fixture との一致', () => {
	it('D2e-01: renderHeader → renderFooter (同一 ctx) の出力が regions/footer.html と htmlEquals で一致する', () => {
		// 検出: 同一 ctx での header 先行描画後の footer 合成結果が単一派生 fixture と一致するか
		//       (site-title / nav / page-list / modal 採番の共有を含む)。
		// Red理由: footerCompose.ts がスタブのため renderFooter が 'not implemented' を throw する。
		const ctx = ctxSingle();
		renderHeader(realTheme, ctx);
		const out = renderFooter(realTheme, ctx);
		expect(htmlEquals(out, fixture('regions/footer.html'))).toBe(true);
	});

	it('D2e-02: 特殊文字 name/tagline (home 派生) で set-footer2 の fixture と htmlEquals で一致する', () => {
		// 検出: 名前・タグラインの HTML エスケープと home 派生の aria-current 付与、
		//       site-tagline の出力が特殊文字入力でも fixture と一致するか。
		// Red理由: footerCompose.ts がスタブのため renderFooter が 'not implemented' を throw する。
		const ctx = ctxHome(
			{ name: 'Foo & <Bar> "Q"', url: SITE_WPREF.url, tagline: 'Tag line & <b>more</b>', logoId: null },
			NAV_PAGE_LIST,
		);
		renderHeader(realTheme, ctx);
		const out = renderFooter(realTheme, ctx);
		expect(htmlEquals(out, fixture('set-footer2/footer.name-tagline-special.html'))).toBe(true);
	});

	it('D2e-03: header を先行させない単独 footer 描画は regions/footer.html と一致しない (aria-label 番号が異なる)', () => {
		// 検出: footer 単独描画時の nav aria-label 採番が、header 先行時の baseline と区別されるか
		//       (採番が ctx 間で共有されていないことの裏返し確認)。
		// Red理由: footerCompose.ts がスタブのため renderFooter が 'not implemented' を throw する。
		//          実装後に採番が header 先行と同じになると本テストは Red のまま残る (期待通り)。
		const out = renderFooter(realTheme, ctxSingle());
		expect(htmlEquals(out, fixture('regions/footer.html'))).toBe(false);
	});
});

describe('モーダル番号採番 (renderState.modalCounter) の共有', () => {
	it('D2e-04: header1 → footer → header2 (同一 ctx) で modal-1 / なし / modal-2 と採番される', () => {
		// 検出: footer が modal を生成しないこと、および header と footer が renderState を
		//       同一カウンタとして共有すること。
		// Red理由: footerCompose.ts がスタブのため renderFooter が 'not implemented' を throw する。
		const ctx = ctxSingle();
		const header1 = renderHeader(realTheme, ctx);
		const footer = renderFooter(realTheme, ctx);
		const header2 = renderHeader(realTheme, ctx);
		expect(modalIds(header1)).toEqual(['modal-1']);
		expect(modalIds(footer)).toEqual([]);
		expect(modalIds(header2)).toEqual(['modal-2']);
	});
});

describe('拒否ケース', () => {
	it('D2e-05: parts/footer.html が read できないテーマは ThemeResolveError (code: unknown-part)', () => {
		// 検出: footer テンプレートパート欠落の拒否と、エラーコードの一致。
		// Red理由: footerCompose.ts がスタブのため renderFooter が 'not implemented' を throw する
		//          (ThemeResolveError ではないため instanceof で失敗する)。
		const theme: ThemeFiles = { read: () => undefined };
		const err = errorOf(() => renderFooter(theme, ctxSingle()));
		expect(err).toBeInstanceOf(ThemeResolveError);
		expect((err as ThemeResolveError).code).toBe('unknown-part');
	});

	it('D2e-06: 未対応ブロックを含む footer は UnsupportedBlockError (直下 / columns 内 / group 内)', () => {
		// 検出: 未登録ブロックを黙って捨てず、ネストの深さによらず拒否すること。
		// Red理由: footerCompose.ts がスタブのため renderFooter が 'not implemented' を throw する
		//          (UnsupportedBlockError ではないため instanceof で失敗する)。
		const cases: Record<string, string> = {
			direct: '<!-- wp:unknown/x /-->',
			inColumns:
				'<!-- wp:columns --><!-- wp:column --><!-- wp:unknown/x /--><!-- /wp:column --><!-- /wp:columns -->',
			inGroup: '<!-- wp:group --><!-- wp:unknown/x /--><!-- /wp:group -->',
		};
		for (const [name, markup] of Object.entries(cases)) {
			const theme: ThemeFiles = {
				read: (p) => (p === 'parts/footer.html' ? markup : undefined),
			};
			const err = errorOf(() => renderFooter(theme, ctxSingle()));
			expect(err, `case: ${name}`).toBeInstanceOf(UnsupportedBlockError);
		}
	});
});

describe('baseline に対する比較器の感度 (negative comparator)', () => {
	// baseline は D2e-01 と同じ合成結果。実装前は baseline 自体を作れないため、
	// 以下の変異の正規表現は実 baseline の形に対して未確認 (UNVERIFIED)。
	function baselineFooter(): string {
		const ctx = ctxSingle();
		renderHeader(realTheme, ctx);
		return renderFooter(realTheme, ctx);
	}

	it('D2e-08a: wp-block-column のクラス文字列を壊すと baseline と不一致になる', () => {
		// 検出: htmlEquals が column 要素のクラス差分を検出できるか。
		// Red理由: baseline を作る renderFooter がスタブのため throw する。
		// 正規表現の形は実 baseline 未確認 (UNVERIFIED)。
		const baseline = baselineFooter();
		const mutated = baseline.replace('<div class="wp-block-column', '<div class="wp-block-colum');
		expect(mutated).not.toBe(baseline);
		expect(htmlEquals(mutated, baseline)).toBe(false);
	});

	it('D2e-08b: navigation の aria-label を除去すると baseline と不一致になる', () => {
		// 検出: nav の aria-label 欠落を htmlEquals が検出できるか。
		// Red理由: baseline を作る renderFooter がスタブのため throw する。
		// 正規表現の形 (<nav 直後の aria-label) は実 baseline 未確認 (UNVERIFIED)。
		const baseline = baselineFooter();
		const mutated = baseline.replace(/(<nav\b[^>]*?) aria-label="[^"]*"/, '$1');
		expect(mutated).not.toBe(baseline);
		expect(htmlEquals(mutated, baseline)).toBe(false);
	});

	it('D2e-08c: wp-block-spacer の空 div を重複させると baseline と不一致になる', () => {
		// 検出: 余分なスペーサー要素を htmlEquals が検出できるか。
		// Red理由: baseline を作る renderFooter がスタブのため throw する。
		// 正規表現の形は実 baseline 未確認 (UNVERIFIED)。マッチしない場合は mutated === baseline で失敗する。
		const baseline = baselineFooter();
		const spacerRe = /<div[^>]*class="wp-block-spacer"[^>]*><\/div>/;
		const mutated = baseline.replace(spacerRe, (s) => s + s);
		expect(mutated).not.toBe(baseline);
		expect(htmlEquals(mutated, baseline)).toBe(false);
	});
});

describe('fail-closed (tagline / logoId 未指定)', () => {
	it('D2e-09a: site.tagline が undefined なら RangeError', () => {
		// 検出: core/site-tagline が tagline 未指定時に黙って空出力せず fail-closed すること (§8.2)。
		// Red理由: footerCompose.ts がスタブのため renderFooter が Error('not implemented') を throw する
		//          (RangeError ではないため instanceof で失敗する)。
		const ctx = ctxOverride({ site: { name: 'wpref', url: SITE_WPREF.url, logoId: null } });
		const err = errorOf(() => renderFooter(realTheme, ctx));
		expect(err).toBeInstanceOf(RangeError);
	});

	it('D2e-09b: site.logoId が undefined なら RangeError', () => {
		// 検出: core/site-logo が logoId 未指定時に fail-closed すること (§8.2)。
		// Red理由: footerCompose.ts がスタブのため renderFooter が Error('not implemented') を throw する
		//          (RangeError ではないため instanceof で失敗する)。
		const ctx = ctxOverride({ site: { name: 'wpref', url: SITE_WPREF.url, tagline: '' } });
		const err = errorOf(() => renderFooter(realTheme, ctx));
		expect(err).toBeInstanceOf(RangeError);
	});
});

describe('過適合ガード (固定値に依存しない)', () => {
	it('D2e-10a: name "Alpha Shop" / tagline "Hello" で例外なく描画され、site-title と site-tagline に入る', () => {
		// 検出: fixture の固定文字列 (wpref 等) に合わせた実装になっていないか。
		// Red理由: footerCompose.ts がスタブのため renderFooter が 'not implemented' を throw する。
		// 注: 正規表現の形 (クラス名の後に文字列が続く) は実出力未確認 (UNVERIFIED)。
		const ctx = ctxHome(
			{ name: 'Alpha Shop', url: SITE_WPREF.url, tagline: 'Hello', logoId: null },
			NAV_PAGE_LIST,
		);
		const out = renderFooter(realTheme, ctx);
		expect(out).toMatch(/wp-block-site-title[\s\S]*?Alpha Shop/);
		expect(out).toMatch(/wp-block-site-tagline[\s\S]*?Hello/);
	});

	it('D2e-10b: name に <script> を含めても出力に <script が現れず &lt;script&gt; にエスケープされる', () => {
		// 検出: site.name の HTML エスケープ漏れ (XSS)。
		// Red理由: footerCompose.ts がスタブのため renderFooter が 'not implemented' を throw する。
		const ctx = ctxHome(
			{ name: '<script>alert(1)</script>', url: SITE_WPREF.url, tagline: 'Hello', logoId: null },
			NAV_PAGE_LIST,
		);
		const out = renderFooter(realTheme, ctx);
		expect(out).not.toMatch(/<script/i);
		expect(out).toContain('&lt;script&gt;');
	});

	it('D2e-10c: tagline に <script> を含めても出力に <script が現れず &lt;script&gt; にエスケープされる', () => {
		// 検出: site.tagline の HTML エスケープ漏れ (XSS)。
		// Red理由: footerCompose.ts がスタブのため renderFooter が 'not implemented' を throw する。
		const ctx = ctxHome(
			{ name: 'Alpha Shop', url: SITE_WPREF.url, tagline: '<script>alert(1)</script>', logoId: null },
			NAV_PAGE_LIST,
		);
		const out = renderFooter(realTheme, ctx);
		expect(out).not.toMatch(/<script/i);
		expect(out).toContain('&lt;script&gt;');
	});
});

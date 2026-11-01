// SPDX-License-Identifier: GPL-3.0-only
// D-3a1 STEP4-B: renderChildren 契約のテスト(実装は含まない)。
// 偽レンダラを renderTree に渡し、実際の描画挙動を観測する。
//
// 期待される Red/Green の内訳(実装前):
// - Red: 違反系(D3a1-08 / 09 の一部側 / 12 の孫握りつぶし)は例外が出ず「throw しなかった」で失敗する想定。
//        override 系(D3a1-10 の許可キーの文脈反映・未許可キーの RangeError)は、現行 renderTree が
//        第2引数 override を無視するため失敗する想定。
// - Green(回帰ガード): 正常系(D3a1-07)、renderState 共有(D3a1-11)、override 無し、
//        childrenOptional の 0 回呼び出し、innerBlocks 空の任意ブロック渡し、ネストの正常系など。
//        現状でも通るのは仕様どおりで、実装後にこの挙動が壊れないことを守るためのもの。
import { describe, expect, it } from 'vitest';
import { type BlockRegistry, type BlockRenderer, type RenderCtx, renderTree } from './blockRegistry.js';
import type { ParsedBlock } from './renderBlocks.js';

// 仕様で追加される型を、テスト内にローカル定義する(実装の import に依存しないため)。
type PostCtx = {
  id: number;
  title: string;
  url: string;
  protected: boolean;
  className: string;
  dateIso: string;
  dateText: string;
};
type ContentPort = object;
type Override = { post?: PostCtx; content?: ContentPort; query?: { items: unknown[] } };
type Ctx = RenderCtx & { post?: PostCtx; content?: ContentPort };
type ChildrenFn = (blocks: ParsedBlock[], override?: Override) => string;

const blk = (
  blockName: string,
  opts: { label?: string; inner?: ParsedBlock[] } = {},
): ParsedBlock => ({
  blockName,
  attrs: opts.label === undefined ? {} : { label: opts.label },
  innerBlocks: opts.inner ?? [],
  innerHTML: '',
  innerContent: [],
});

const makeCtx = (extra: Partial<Ctx> = {}): Ctx => ({
  global: {} as never,
  renderState: { modalCounter: 0 },
  ...extra,
});

const post = (id: number): PostCtx => ({
  id,
  title: `title-${id}`,
  url: `https://example.test/${id}`,
  protected: false,
  className: '',
  dateIso: '2026-01-01T00:00:00Z',
  dateText: 'Jan 1, 2026',
});

// renderer 生成ヘルパ。renderChildren の拡張シグネチャ(override 付き)を型に載せるため 1 箇所だけキャストする。
const mk = (
  render: (block: ParsedBlock, ctx: Ctx, rc: ChildrenFn) => string,
  extra: { childrenOptional?: boolean } = {},
): BlockRenderer => ({ validateAttrs: () => {}, render, ...extra }) as unknown as BlockRenderer;

const reg = (entries: Record<string, BlockRenderer>): BlockRegistry => new Map(Object.entries(entries));

// 子を <wrap>…</wrap> で包み、innerBlocks を全部渡す基本の親
const wrap = mk((block, _ctx, rc) => `<wrap>${rc(block.innerBlocks)}</wrap>`);
// 葉: label を出力する
const leaf = mk((block) => `<leaf:${String(block.attrs?.label)}>`);

const captureError = (fn: () => unknown): unknown => {
  try {
    fn();
    return undefined;
  } catch (e) {
    return e;
  }
};

describe('D3a1 renderChildren 契約', () => {
  // ---- D3a1-07 正常系(回帰ガード: 現状でも Green になり得る) ----
  describe('D3a1-07 正常系', () => {
    const inner = [blk('leaf', { label: 'a' }), blk('leaf', { label: 'b' })];
    const registry = () => reg({ wrap, leaf });

    it('D3a1-07 全 innerBlocks を渡すと子の出力が連結される', () => {
      const out = renderTree([blk('wrap', { inner })], makeCtx(), registry());
      expect(out).toBe('<wrap><leaf:a><leaf:b></wrap>');
    });

    it('D3a1-07 新しい配列でも同じ要素参照なら成功する', () => {
      const copyWrap = mk((block, _ctx, rc) => `<wrap>${rc([...block.innerBlocks])}</wrap>`);
      const out = renderTree([blk('wrap', { inner })], makeCtx(), reg({ wrap: copyWrap, leaf }));
      expect(out).toBe('<wrap><leaf:a><leaf:b></wrap>');
    });

    it('D3a1-07 2 回呼んで各回が全要素なら成功し、両方の出力が連結される', () => {
      const twice = mk((block, _ctx, rc) => `<t>${rc(block.innerBlocks)}${rc(block.innerBlocks)}</t>`);
      const out = renderTree([blk('t', { inner })], makeCtx(), reg({ t: twice, leaf }));
      expect(out).toBe('<t><leaf:a><leaf:b><leaf:a><leaf:b></t>');
    });
  });

  // ---- D3a1-08 違反系: すべて RangeError かつ メッセージに innerBlocks を含む ----
  // Red 理由: 現行 renderTree は契約を検査しないため、例外が出ず it が「throw しなかった」で失敗する。
  describe('D3a1-08 違反', () => {
    type Run = (rc: ChildrenFn, inner: ParsedBlock[]) => void;
    const violations: Array<[string, Run]> = [
      ['呼ばない', () => {}],
      ['空配列 []', (rc) => { rc([]); }],
      ['先頭のみ', (rc, inner) => { rc([inner[0] as ParsedBlock]); }],
      ['末尾のみ', (rc, inner) => { rc([inner[inner.length - 1] as ParsedBlock]); }],
      ['順序入れ替え', (rc, inner) => { rc([...inner].reverse()); }],
      ['structuredClone した要素', (rc, inner) => { rc(inner.map((b) => structuredClone(b))); }],
      ['別ブロック', (rc) => { rc([blk('leaf', { label: 'other' })]); }],
      ['全要素+余分な1つ', (rc, inner) => { rc([...inner, blk('leaf', { label: 'extra' })]); }],
      ['2回呼び、2回目だけ一部', (rc, inner) => { rc(inner); rc([inner[0] as ParsedBlock]); }],
    ];

    it.each(violations)('D3a1-08 違反: %s は RangeError(innerBlocks を含む)', (_label, run) => {
      const parent = mk((block, _ctx, rc) => {
        run(rc, block.innerBlocks);
        return '';
      });
      const inner = [blk('leaf', { label: 'a' }), blk('leaf', { label: 'b' })];
      const err = captureError(() =>
        renderTree([blk('wrap', { inner })], makeCtx(), reg({ wrap: parent, leaf })),
      );
      expect(err).toBeInstanceOf(RangeError);
      expect((err as Error).message).toContain('innerBlocks');
    });
  });

  // ---- D3a1-09 childrenOptional と innerBlocks 空ブロック ----
  describe('D3a1-09 childrenOptional / innerBlocks 空', () => {
    const inner = [blk('leaf', { label: 'a' }), blk('leaf', { label: 'b' })];

    // 回帰ガード(Green 想定): 0 回呼び出しは childrenOptional なら成功する。
    // 現行実装は契約を検査しないので、この挙動は現状でも成立する。
    it('D3a1-09 childrenOptional: true の renderer は 0 回呼び出しでも成功する', () => {
      const opt = mk(() => '<opt/>', { childrenOptional: true });
      const out = renderTree([blk('opt', { inner })], makeCtx(), reg({ opt, leaf }));
      expect(out).toBe('<opt/>');
    });

    // 回帰ガード(Green 想定): 全要素を渡せば成功する。
    it('D3a1-09 childrenOptional: true でも呼ぶなら全要素で成功する', () => {
      const opt = mk((block, _ctx, rc) => `<opt>${rc(block.innerBlocks)}</opt>`, { childrenOptional: true });
      const out = renderTree([blk('opt', { inner })], makeCtx(), reg({ opt, leaf }));
      expect(out).toBe('<opt><leaf:a><leaf:b></opt>');
    });

    // Red 理由: 現行 renderTree は部分配列を検査せず、例外が出ない。
    it('D3a1-09 childrenOptional: true でも呼ぶ場合に一部のみ渡すと RangeError', () => {
      const opt = mk((block, _ctx, rc) => `<opt>${rc([block.innerBlocks[0] as ParsedBlock])}</opt>`, {
        childrenOptional: true,
      });
      const err = captureError(() => renderTree([blk('opt', { inner })], makeCtx(), reg({ opt, leaf })));
      expect(err).toBeInstanceOf(RangeError);
      expect((err as Error).message).toContain('innerBlocks');
    });

    // 回帰ガード(Green 想定): innerBlocks が空のブロックでは任意のブロックを renderChildren に渡してよい
    // (navigation が投稿本文を解析して渡す既存仕様)。
    it('D3a1-09 innerBlocks が空のブロックでは任意のブロックを渡しても成功する', () => {
      const parentEmpty = mk((_block, _ctx, rc) => `<wrap>${rc([blk('leaf', { label: 'free' })])}</wrap>`);
      const out = renderTree([blk('wrap')], makeCtx(), reg({ wrap: parentEmpty, leaf }));
      expect(out).toBe('<wrap><leaf:free></wrap>');
    });

    // 回帰ガード(Green 想定): innerBlocks 空で renderChildren を呼ばない renderer は成功する。
    it('D3a1-09 innerBlocks が空のブロックで renderChildren を呼ばなくても成功する', () => {
      const none = mk(() => '<empty/>');
      const out = renderTree([blk('empty')], makeCtx(), reg({ empty: none }));
      expect(out).toBe('<empty/>');
    });
  });

  // ---- D3a1-10 override (post / content) ----
  describe('D3a1-10 override', () => {
    const P1 = post(1);
    const P2 = post(2);
    const C = {} as unknown as ContentPort;

    // Red 理由: 現行 renderTree は override を無視し、子に外側の ctx をそのまま渡すため、
    // 子の ctx.post が P2 にならず失敗する。
    it('D3a1-10 許可キー post/content は子の描画中だけ有効になる', () => {
      const seen: Ctx[] = [];
      const probe = mk((_block, ctx) => {
        seen.push(ctx);
        return '<probe/>';
      });
      const parent = mk((block, _ctx, rc) => rc(block.innerBlocks, { post: P2, content: C }));
      const ctx = makeCtx({ post: P1 });
      renderTree([blk('parent', { inner: [blk('probe')] })], ctx, reg({ parent, probe }));

      expect(seen).toHaveLength(1);
      expect(seen[0]?.post).toBe(P2);
      expect(seen[0]?.content).toBe(C);
      // 戻った後の外側 ctx は不変(同一性で確認)
      expect(ctx.post).toBe(P1);
      expect(ctx.content).toBeUndefined();
    });

    // Red 理由: 現行 renderTree は未許可キーを検査せず、例外が出ない。
    it.each(['site', 'renderState', 'global', 'navigation'])(
      'D3a1-10 未許可キー %s の override は RangeError',
      (key) => {
        const parent = mk((block, _ctx, rc) => rc(block.innerBlocks, { [key]: {} } as never));
        const err = captureError(() =>
          renderTree([blk('parent', { inner: [blk('probe')] })], makeCtx(), reg({ parent, probe: leaf })),
        );
        expect(err).toBeInstanceOf(RangeError);
      },
    );

    // Red 理由: 現行実装は override を無視するため、2 回目の呼び出し前後で漏れは見えず、
    // 1 回目の呼び出しで子が P2 を見ない(期待 [2,2,1,1] に対し現状 [1,1,1,1])。
    // 2 回目(index 2,3)が 1 のままかどうかが「漏れなし」の検査。
    it('D3a1-10 2 回呼んでも 1 回目の override が 2 回目の子の ctx に残らない', () => {
      const seen: Array<number | undefined> = [];
      const probe = mk((_block, ctx) => {
        seen.push(ctx.post?.id);
        return '';
      });
      const parent = mk((block, _ctx, rc) => {
        rc(block.innerBlocks, { post: P2 });
        rc(block.innerBlocks);
        return '';
      });
      renderTree(
        [blk('parent', { inner: [blk('probe'), blk('probe')] })],
        makeCtx({ post: P1 }),
        reg({ parent, probe }),
      );
      expect(seen).toEqual([2, 2, 1, 1]);
    });

    // 回帰ガード(Green 想定): override 無しの子は外側の ctx.post を見る。
    it('D3a1-10 override 無しの子は外側の ctx.post を見る', () => {
      const seen: Array<number | undefined> = [];
      const probe = mk((_block, ctx) => {
        seen.push(ctx.post?.id);
        return '';
      });
      const parent = mk((block, _ctx, rc) => rc(block.innerBlocks));
      renderTree([blk('parent', { inner: [blk('probe')] })], makeCtx({ post: P1 }), reg({ parent, probe }));
      expect(seen).toEqual([1]);
    });
  });

  // ---- D3a1-11 renderState は参照共有(回帰ガード: 現状でも Green になり得る) ----
  describe('D3a1-11 renderState 共有', () => {
    it('D3a1-11 子の modalCounter / navNameCounts の更新は外側の ctx から見える', () => {
      const rs = { modalCounter: 0 } as RenderCtx['renderState'];
      const P = post(9);
      const childStates: Array<RenderCtx['renderState']> = [];
      const bump = mk((_block, ctx) => {
        childStates.push(ctx.renderState);
        ctx.renderState.modalCounter += 1;
        ctx.renderState.navNameCounts ??= new Map<string, number>();
        ctx.renderState.navNameCounts.set('x', (ctx.renderState.navNameCounts.get('x') ?? 0) + 1);
        return '';
      });
      // override に post を付けても renderState は同じ参照を共有する
      const parent = mk((block, _ctx, rc) => rc(block.innerBlocks, { post: P }));
      const outer = makeCtx({ renderState: rs });
      renderTree([blk('parent', { inner: [blk('bump'), blk('bump')] })], outer, reg({ parent, bump }));

      expect(childStates).toHaveLength(2);
      expect(childStates[0]).toBe(rs);
      expect(childStates[1]).toBe(rs);
      expect(rs.modalCounter).toBe(2);
      expect(rs.navNameCounts?.get('x')).toBe(2);
    });
  });

  // ---- D3a1-12 ネスト ----
  describe('D3a1-12 ネスト', () => {
    // 回帰ガード(Green 想定): 全階層が全要素を渡せば成功する。
    it('D3a1-12 親→子→孫の全階層が全要素を渡せば成功する', () => {
      const grand = blk('leaf', { label: 'g' });
      const middle = blk('wrap', { inner: [grand] });
      const out = renderTree([blk('wrap', { inner: [middle] })], makeCtx(), reg({ wrap, leaf }));
      expect(out).toBe('<wrap><wrap><leaf:g></wrap></wrap>');
    });

    // Red 理由: 現行 renderTree は中間レンダラの renderChildren([]) を検査せず、孫が握りつぶされても例外が出ない。
    it('D3a1-12 孫を握りつぶす中間レンダラは RangeError(innerBlocks を含む)', () => {
      const dropper = mk((_block, _ctx, rc) => {
        rc([]);
        return '';
      });
      const grand = blk('leaf', { label: 'g' });
      const middle = blk('dropper', { inner: [grand] });
      const err = captureError(() =>
        renderTree([blk('wrap', { inner: [middle] })], makeCtx(), reg({ wrap, dropper, leaf })),
      );
      expect(err).toBeInstanceOf(RangeError);
      expect((err as Error).message).toContain('innerBlocks');
    });
  });
});

// D3a1-09 補強(STEP6 mutation 生存): childrenOptional は厳密に true のときだけ有効。
describe('D3a1-09 補強: childrenOptional の厳密性', () => {
  const inner = [blk('leaf', { label: 'a' })];
  it.each([false, undefined])('D3a1-09 childrenOptional=%s で 0 回呼びは RangeError', (v) => {
    const none = mk(() => '', v === undefined ? {} : { childrenOptional: v });
    const err = captureError(() => renderTree([blk('none', { inner })], makeCtx(), reg({ none, leaf })));
    expect(err).toBeInstanceOf(RangeError);
    expect(String((err as Error).message)).toContain('innerBlocks');
  });
});

// D3b2-C1: renderChildren の override 許可キーに query を加える(post / content に加えて)。
// 許可外のキー(site / renderState / global / navigation)は引き続き RangeError。
describe('D3b2-C1 renderChildren override の query 許可', () => {
  it('D3b2-C1 override { query } は成功し、子の ctx.query がその値そのものになる', () => {
    const override = { query: { items: [] } } as unknown as Override;
    let seen: unknown = 'unset';
    const probe = mk((_block, ctx) => {
      seen = (ctx as { query?: unknown }).query;
      return '<probe>';
    });
    // Red理由: 現行 assertOverrideKeys は query を許可しないため RangeError になり、この expect が失敗する。
    const kids = [blk('probe', {})];
    const wrapQ = mk((_block, _ctx, rc) => rc(kids, override));
    const out = renderTree([blk('wrapq', { inner: kids })], makeCtx(), reg({ wrapq: wrapQ, probe }));
    expect(out).toBe('<probe>');
    expect(seen).toBe(override.query);
  });

  it.each([
    ['site', { site: { name: 'x', url: 'y' } }],
    ['renderState', { renderState: { modalCounter: 0 } }],
    ['global', { global: {} }],
    ['navigation', { navigation: { post: null, pages: [] } }],
  ])('D3b2-C1 override に %s を含むと RangeError のまま', (_key, extra) => {
    // Red理由: 現行は許可外キーで RangeError を投げるため本テストは通る(回帰ガード)。
    // 変更後も許可外キーが弾かれることを保証する。
    const override = extra as unknown as Override;
    const kids = [blk('probe', {})];
    const probe = mk(() => '<probe>');
    const wrapX = mk((_block, _ctx, rc) => rc(kids, override));
    const err = captureError(() =>
      renderTree([blk('wrapx', { inner: kids })], makeCtx(), reg({ wrapx: wrapX, probe })),
    );
    expect(err).toBeInstanceOf(RangeError);
  });
});

// STEP8 指摘(Major): 子の検査は renderTree 開始時のスナップショットに基づく(レンダラが innerBlocks を破壊しても迂回できない)。
describe('STEP8-3: innerBlocks を書き換えるレンダラは検出される', () => {
  const inner = [blk('leaf', { label: 'a' }), blk('leaf', { label: 'b' })];
  it('pop() してから残りを renderChildren に渡すと RangeError', () => {
    const popper = mk((block, _ctx, rc) => {
      block.innerBlocks.pop();
      return rc(block.innerBlocks);
    });
    const err = captureError(() => renderTree([blk('p', { inner: [...inner] })], makeCtx(), reg({ p: popper, leaf })));
    expect(err).toBeInstanceOf(RangeError);
  });
  it('splice で全て空にして空配列を渡すと RangeError', () => {
    const clearer = mk((block, _ctx, rc) => {
      block.innerBlocks.splice(0);
      return rc(block.innerBlocks);
    });
    const err = captureError(() => renderTree([blk('p', { inner: [...inner] })], makeCtx(), reg({ p: clearer, leaf })));
    expect(err).toBeInstanceOf(RangeError);
  });
  it('要素の入れ替え(代入)後に全体を渡しても RangeError', () => {
    const swapper = mk((block, _ctx, rc) => {
      block.innerBlocks[1] = blk('leaf', { label: 'evil' });
      return rc(block.innerBlocks);
    });
    const err = captureError(() => renderTree([blk('p', { inner: [...inner] })], makeCtx(), reg({ p: swapper, leaf })));
    expect(err).toBeInstanceOf(RangeError);
  });
});

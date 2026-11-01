// SPDX-License-Identifier: GPL-3.0-only
import { containerClassName } from './layoutClass.js';
import { layoutHashInput } from './layoutInput.js';
import { type BlockRenderer, type RenderCtx } from './blockRegistry.js';
import { type ParsedBlock } from './renderBlocks.js';

const BLOCK_NAME = 'core/group';
const LAYOUT_TYPES = ['default', 'flow', 'constrained', 'flex'] as const;
const JUSTIFY_VALUES = ['left', 'right', 'center', 'space-between'] as const;
const SPACING_SIDES = ['top', 'right', 'bottom', 'left'] as const;
const LENGTH_RE = /^-?\d+(\.\d+)?(px|em|rem|%|vh|vw)$/;
const PRESET_RE = /^var:preset\|spacing\|([a-z0-9-]+)$/;
const TAG_NAMES = ['div', 'main', 'nav', 'header', 'footer', 'section'] as const;
const VERTICAL_ALIGN_VALUES = ['top', 'center', 'bottom'] as const;
const BORDER_SIDES = ['top', 'bottom'] as const;
const BORDER_COLOR_RE = /^var:preset\|color\|([a-z0-9-]+)$/;
const BORDER_WIDTH_RE = /^\d+px$/;

type Obj = Record<string, unknown>;

const isObject = (v: unknown): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const rangeError = (msg: string): RangeError => new RangeError(`core/group: ${msg}`);

const optionalEnum = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  name: string,
): T | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw rangeError(`${name} が不正です`);
  }
  return value as T;
};

// 余白値を CSS 値へ変換する。preset 参照・長さ・0 以外は fail-closed で拒否する。
const spacingToCss = (value: unknown, name: string): string => {
  if (typeof value !== 'string') {
    throw rangeError(`${name} が文字列ではありません`);
  }
  const preset = PRESET_RE.exec(value);
  if (preset !== null) {
    return `var(--wp--preset--spacing--${preset[1]})`;
  }
  if (value === '0' || LENGTH_RE.test(value)) {
    return value;
  }
  throw rangeError(`${name} の値が不正です`);
};

// border の top / bottom 1辺分を宣言へ変換する。空配列・未指定は宣言を出さない。
const borderSideDecls = (side: (typeof BORDER_SIDES)[number], value: unknown): string[] => {
  if (value === undefined || (Array.isArray(value) && value.length === 0)) {
    return [];
  }
  if (!isObject(value)) {
    throw rangeError(`style.border.${side} はオブジェクトである必要があります`);
  }
  for (const key of Object.keys(value)) {
    if (key !== 'color' && key !== 'width') {
      throw rangeError(`style.border.${side}.${key} は未対応です`);
    }
  }
  const decls: string[] = [];
  const color = value.color;
  if (color !== undefined) {
    const preset = typeof color === 'string' ? BORDER_COLOR_RE.exec(color) : null;
    if (preset === null) {
      throw rangeError(`style.border.${side}.color の値が不正です`);
    }
    decls.push(`border-${side}-color:var(--wp--preset--color--${preset[1]})`);
  }
  const width = value.width;
  if (width !== undefined) {
    if (typeof width !== 'string' || !BORDER_WIDTH_RE.test(width)) {
      throw rangeError(`style.border.${side}.width の値が不正です`);
    }
    decls.push(`border-${side}-width:${width}`);
  }
  return decls;
};

type GroupAttrs = {
  tagName: (typeof TAG_NAMES)[number];
  ariaLabel: string | undefined;
  align: 'full' | 'wide' | undefined;
  layoutType: 'flow' | 'constrained' | 'flex';
  layout: Obj;
  justifyContent: (typeof JUSTIFY_VALUES)[number] | undefined;
  flexWrap: 'wrap' | 'nowrap' | undefined;
  vertical: boolean;
  styleDecls: string[];
};

// attrs を検証し、描画に必要な値へ正規化する。validateAttrs と render の両方から呼ぶ。
const parseGroupAttrs = (rawAttrs: Obj): GroupAttrs => {
  const align = optionalEnum(rawAttrs.align, ['full', 'wide'] as const, 'align');

  let layout: Obj = {};
  if (rawAttrs.layout !== undefined) {
    if (!isObject(rawAttrs.layout)) {
      throw rangeError('layout はオブジェクトである必要があります');
    }
    layout = rawAttrs.layout;
  }
  const typeRaw = optionalEnum(layout.type, LAYOUT_TYPES, 'layout.type') ?? 'default';
  const layoutType = typeRaw === 'default' ? 'flow' : typeRaw;

  const justifyContent = optionalEnum(layout.justifyContent, JUSTIFY_VALUES, 'layout.justifyContent');
  const flexWrap = optionalEnum(layout.flexWrap, ['wrap', 'nowrap'] as const, 'layout.flexWrap');
  const orientation = optionalEnum(layout.orientation, ['vertical', 'horizontal'] as const, 'layout.orientation');

  optionalEnum(layout.verticalAlignment, VERTICAL_ALIGN_VALUES, 'layout.verticalAlignment');

  const tagName = optionalEnum(rawAttrs.tagName, TAG_NAMES, 'tagName') ?? 'div';
  let ariaLabel: string | undefined;
  if (rawAttrs.ariaLabel !== undefined) {
    if (tagName !== 'nav') {
      throw rangeError('ariaLabel は tagName が nav のときだけ指定できます');
    }
    if (typeof rawAttrs.ariaLabel !== 'string') {
      throw rangeError('ariaLabel は文字列である必要があります');
    }
    ariaLabel = rawAttrs.ariaLabel;
  }

  const styleDecls: string[] = [];
  if (rawAttrs.style !== undefined) {
    if (!isObject(rawAttrs.style)) {
      throw rangeError('style はオブジェクトである必要があります');
    }
    const border = rawAttrs.style.border;
    if (border !== undefined) {
      if (!isObject(border)) {
        throw rangeError('style.border はオブジェクトである必要があります');
      }
      for (const key of Object.keys(border)) {
        if (key !== 'top' && key !== 'bottom' && key !== 'left' && key !== 'right') {
          throw rangeError(`style.border.${key} は未対応です`);
        }
      }
      for (const side of ['left', 'right'] as const) {
        const v = border[side];
        if (v !== undefined && !(Array.isArray(v) && v.length === 0)) {
          throw rangeError(`style.border.${side} は未対応です`);
        }
      }
      for (const side of BORDER_SIDES) {
        styleDecls.push(...borderSideDecls(side, border[side]));
      }
    }
    const spacing = rawAttrs.style.spacing;
    if (spacing !== undefined) {
      if (!isObject(spacing)) {
        throw rangeError('style.spacing はオブジェクトである必要があります');
      }
      for (const prop of ['padding', 'margin'] as const) {
        const box = spacing[prop];
        if (box === undefined) {
          continue;
        }
        if (!isObject(box)) {
          throw rangeError(`style.spacing.${prop} はオブジェクトである必要があります`);
        }
        for (const side of SPACING_SIDES) {
          if (box[side] !== undefined) {
            styleDecls.push(`${prop}-${side}:${spacingToCss(box[side], `style.spacing.${prop}.${side}`)}`);
          }
        }
      }
    }
  }

  return {
    tagName,
    ariaLabel,
    align,
    layoutType,
    layout,
    justifyContent,
    flexWrap,
    vertical: orientation === 'vertical',
    styleDecls,
  };
};

const escapeAttr = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const buildClasses = (parsed: GroupAttrs, attrs: Obj, ctx: RenderCtx): string[] => {
  const classes: string[] = ['wp-block-group'];
  if (parsed.align !== undefined) {
    classes.push(parsed.align === 'full' ? 'alignfull' : 'alignwide');
  }
  if (parsed.layoutType === 'constrained') {
    classes.push('has-global-padding');
  }
  if (parsed.layoutType === 'flex') {
    if (parsed.justifyContent !== undefined) {
      classes.push(`is-content-justification-${parsed.justifyContent}`);
    }
    if (parsed.flexWrap === 'nowrap') {
      classes.push('is-nowrap');
    }
    if (parsed.vertical) {
      classes.push('is-vertical');
    }
  }
  classes.push(`is-layout-${parsed.layoutType}`);

  // コンテナ class は WP が layout style を出力したときだけ付く。
  // flex は常に layout style を持ち、constrained は contentSize/wideSize 指定時のみ持つ。
  const hasContainerStyle =
    parsed.layoutType === 'flex' ||
    (parsed.layoutType === 'constrained' &&
      (parsed.layout.contentSize !== undefined || parsed.layout.wideSize !== undefined));
  if (hasContainerStyle) {
    const hash = containerClassName(BLOCK_NAME, layoutHashInput({ name: BLOCK_NAME, attrs }, ctx.global));
    if (hash !== '') {
      classes.push(hash);
    }
  }
  classes.push(`wp-block-group-is-layout-${parsed.layoutType}`);
  return classes;
};

export const groupRenderer: BlockRenderer = {
  validateAttrs: (attrs) => {
    parseGroupAttrs(attrs);
  },
  render: (block: ParsedBlock, ctx: RenderCtx, renderChildren) => {
    const attrs: Obj = block.attrs ?? {};
    const parsed = parseGroupAttrs(attrs);
    const tag = parsed.tagName;
    const classAttr = escapeAttr(buildClasses(parsed, attrs, ctx).join(' '));
    const ariaAttr = parsed.ariaLabel !== undefined ? ` aria-label="${escapeAttr(parsed.ariaLabel)}"` : '';
    const styleAttr = parsed.styleDecls.length > 0 ? ` style="${escapeAttr(parsed.styleDecls.join(';'))}"` : '';
    return `<${tag} class="${classAttr}"${ariaAttr}${styleAttr}>${renderChildren(block.innerBlocks)}</${tag}>`;
  },
};

// SPDX-License-Identifier: GPL-3.0-only
// D3a2: テーマ(PHP 展開後)由来の core/heading レンダラ。
// 入力は保存 HTML の外殻 <hN> を剥がした内側を sanitizeHtml に通し、level・align・fontSize・style.typography から外殻と class/style を導出する。
import { parseFragment } from 'parse5';
import { type BlockRenderer, type RenderCtx } from './blockRegistry.js';
import { type ParsedBlock } from './renderBlocks.js';
import { sanitizeHtml } from './sanitizeHtml.js';

const BLOCK_NAME = 'core/heading';

type Obj = Record<string, unknown>;

const rangeError = (msg: string): RangeError => new RangeError(`${BLOCK_NAME}: ${msg}`);

const isPlainObject = (v: unknown): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// fontSize の slug は小文字英数字とハイフン区切りのみ(class への連結前の検証)。
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ALLOWED_ATTRS = ['level', 'align', 'fontSize', 'style'] as const;
const ALLOWED_ALIGNS = ['wide', 'full'] as const;

// style.typography の許容キー。出力順は CSS プロパティの固定順(font-style;font-weight;letter-spacing;text-transform)。
const TYPOGRAPHY_ORDER = ['fontStyle', 'fontWeight', 'letterSpacing', 'textTransform'] as const;
type TypographyKey = (typeof TYPOGRAPHY_ORDER)[number];

const CSS_PROP: Record<TypographyKey, string> = {
  fontStyle: 'font-style',
  fontWeight: 'font-weight',
  letterSpacing: 'letter-spacing',
  textTransform: 'text-transform',
};

const TYPOGRAPHY_VALIDATORS: Record<TypographyKey, (v: string) => boolean> = {
  fontStyle: (v) => v === 'normal' || v === 'italic',
  fontWeight: (v) => /^(?:normal|bold|[1-9]00)$/.test(v),
  letterSpacing: (v) => /^\d+(?:\.\d+)?(?:px|em|rem)$/.test(v),
  textTransform: (v) => ['uppercase', 'lowercase', 'capitalize', 'none'].includes(v),
};

type ParsedHeadingAttrs = {
  level: number;
  align: string | undefined;
  fontSize: string | undefined;
  typography: Array<[string, string]>;
};

// attrs を検証し描画に使う値を返す。validateAttrs と render の両方から呼ぶ。
const parseHeadingAttrs = (attrs: Obj): ParsedHeadingAttrs => {
  for (const key of Object.keys(attrs)) {
    if (!(ALLOWED_ATTRS as readonly string[]).includes(key)) {
      throw rangeError(`未対応の属性です: ${key}`);
    }
  }

  let level = 2;
  if (attrs.level !== undefined) {
    if (typeof attrs.level !== 'number' || !Number.isInteger(attrs.level) || attrs.level < 1 || attrs.level > 6) {
      throw rangeError('level は 1 から 6 の整数である必要があります');
    }
    level = attrs.level;
  }

  let align: string | undefined;
  if (attrs.align !== undefined) {
    if (typeof attrs.align !== 'string' || !(ALLOWED_ALIGNS as readonly string[]).includes(attrs.align)) {
      throw rangeError('align は wide または full である必要があります');
    }
    align = attrs.align;
  }

  let fontSize: string | undefined;
  if (attrs.fontSize !== undefined) {
    if (typeof attrs.fontSize !== 'string' || !SLUG_RE.test(attrs.fontSize)) {
      throw rangeError('fontSize は英小文字・数字とハイフンによる slug 文字列である必要があります');
    }
    fontSize = attrs.fontSize;
  }

  const typography: Array<[string, string]> = [];
  if (attrs.style !== undefined) {
    if (!isPlainObject(attrs.style)) {
      throw rangeError('style はオブジェクトである必要があります');
    }
    for (const key of Object.keys(attrs.style)) {
      if (key !== 'typography') {
        throw rangeError(`未対応の style キーです: ${key}`);
      }
    }
    const typo = attrs.style.typography;
    if (typo !== undefined) {
      if (!isPlainObject(typo)) {
        throw rangeError('style.typography はオブジェクトである必要があります');
      }
      for (const key of Object.keys(typo)) {
        if (!(TYPOGRAPHY_ORDER as readonly string[]).includes(key)) {
          throw rangeError(`未対応の typography キーです: ${key}`);
        }
      }
      for (const key of TYPOGRAPHY_ORDER) {
        const value = typo[key];
        if (value === undefined) continue;
        if (typeof value !== 'string' || !TYPOGRAPHY_VALIDATORS[key](value)) {
          throw rangeError(`style.typography.${key} の値が不正です`);
        }
        typography.push([CSS_PROP[key], value]);
      }
    }
  }

  return { level, align, fontSize, typography };
};

// 保存 HTML から外殻 <hN ...>…</hN> の内側を取り出す。
// 最外が level と一致する単一の見出し要素であることを parse5 で確認してから、生の文字列から開始・終了タグを剥がす。
const stripOuterHeading = (innerHTML: string, level: number): string => {
  const tag = `h${level}`;
  const match = new RegExp(`^\\s*<${tag}(?:\\s[^>]*)?>([\\s\\S]*)<\\/${tag}>\\s*$`).exec(innerHTML);
  if (match === null) {
    throw rangeError(`最外が ${tag} 要素ではありません`);
  }
  const top = parseFragment(innerHTML).childNodes.filter(
    (n) => !(n.nodeName === '#text' && (n as { value: string }).value.trim() === ''),
  );
  if (top.length !== 1 || top[0]?.nodeName !== tag) {
    throw rangeError(`最外が単一の ${tag} 要素ではありません`);
  }
  return match[1] ?? '';
};

export const headingRenderer: BlockRenderer = {
  validateAttrs: (attrs) => {
    parseHeadingAttrs(attrs);
  },
  render: (block: ParsedBlock, _ctx: RenderCtx) => {
    const { level, align, fontSize, typography } = parseHeadingAttrs(block.attrs ?? {});
    if (block.innerBlocks.length > 0) {
      throw rangeError('子ブロックは対応していません');
    }
    const inner = stripOuterHeading(block.innerHTML, level);
    const sanitized = sanitizeHtml(inner);
    const classes = [
      'wp-block-heading',
      align !== undefined ? `align${align}` : null,
      fontSize !== undefined ? `has-${fontSize}-font-size` : null,
    ]
      .filter((c): c is string => c !== null)
      .join(' ');
    const style =
      typography.length > 0
        ? ` style="${typography.map(([prop, value]) => `${prop}:${value}`).join(';')}"`
        : '';
    return `<h${level} class="${classes}"${style}>${sanitized}</h${level}>`;
  },
};

// SPDX-License-Identifier: GPL-3.0-only
// D-3b2: core/query と core/post-template のレンダラ。
// core/query は ctx.queries.queryPosts の結果を renderChildren の override(query)で子へ渡し、
// core/post-template は ctx.query.items を 1 件ずつ子へ渡す。
import { containerClassName } from './layoutClass.js';
import { layoutHashInput } from './layoutInput.js';
import { type BlockRenderer, type RenderCtx } from './blockRegistry.js';
import { type ParsedBlock } from './renderBlocks.js';

const QUERY_NAME = 'core/query';
const POST_TEMPLATE_NAME = 'core/post-template';

// 対応する query 属性の完全な形。これ以外のキー・値は RangeError(fail-closed)。
const QUERY_SPEC_KEYS = [
  'postType',
  'perPage',
  'pages',
  'offset',
  'order',
  'orderBy',
  'author',
  'search',
  'exclude',
  'sticky',
  'inherit',
  'taxQuery',
  'parents',
] as const;

const CLASS_NAME_RE = /^[A-Za-z0-9_ -]+$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertOnlyKeys(obj: Record<string, unknown>, allowed: readonly string[], where: string): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      throw new RangeError(`${where}: attribute not allowed: ${key}`);
    }
  }
}

function assertDefaultLayout(layout: unknown, where: string): void {
  if (!isPlainObject(layout) || Object.keys(layout).length !== 1 || layout.type !== 'default') {
    throw new RangeError(`${where}: layout must be {type:'default'}`);
  }
}

function assertQuerySpec(spec: unknown): void {
  if (!isPlainObject(spec)) {
    throw new RangeError('core/query: attrs.query must be an object');
  }
  assertOnlyKeys(spec, QUERY_SPEC_KEYS, 'core/query query');
  for (const key of QUERY_SPEC_KEYS) {
    if (!(key in spec)) {
      throw new RangeError(`core/query query: missing key ${key}`);
    }
  }
  const { perPage } = spec;
  if (typeof perPage !== 'number' || !Number.isInteger(perPage) || perPage < 1 || perPage > 100) {
    throw new RangeError('core/query query: perPage must be an integer 1-100');
  }
  const fixed: Record<string, unknown> = {
    postType: 'post',
    pages: 0,
    offset: 0,
    order: 'desc',
    orderBy: 'date',
    author: '',
    search: '',
    sticky: '',
    inherit: false,
    taxQuery: null,
  };
  for (const [key, expected] of Object.entries(fixed)) {
    if (spec[key] !== expected) {
      throw new RangeError(`core/query query: ${key} must be ${JSON.stringify(expected)}`);
    }
  }
  if (!Array.isArray(spec.exclude) || spec.exclude.length !== 0) {
    throw new RangeError('core/query query: exclude must be []');
  }
  if (!Array.isArray(spec.parents) || spec.parents.length !== 0) {
    throw new RangeError('core/query query: parents must be []');
  }
}

function validateQueryAttrs(attrs: Record<string, unknown>): void {
  assertOnlyKeys(attrs, ['query', 'align', 'layout'], QUERY_NAME);
  if (!('query' in attrs)) {
    throw new RangeError('core/query: attrs.query is required');
  }
  assertQuerySpec(attrs.query);
  if ('align' in attrs && attrs.align !== 'wide' && attrs.align !== 'full') {
    throw new RangeError(`core/query: align must be 'wide' or 'full'`);
  }
  if ('layout' in attrs) {
    assertDefaultLayout(attrs.layout, QUERY_NAME);
  }
}

function validatePostTemplateAttrs(attrs: Record<string, unknown>): void {
  assertOnlyKeys(attrs, ['align', 'style', 'layout'], POST_TEMPLATE_NAME);
  if ('align' in attrs && attrs.align !== 'full') {
    throw new RangeError(`core/post-template: align must be 'full'`);
  }
  if ('style' in attrs) {
    const style = attrs.style;
    const spacing = isPlainObject(style) ? style.spacing : undefined;
    if (
      !isPlainObject(style) ||
      Object.keys(style).length !== 1 ||
      !isPlainObject(spacing) ||
      Object.keys(spacing).length !== 1 ||
      spacing.blockGap !== '0'
    ) {
      throw new RangeError(`core/post-template: style must be {spacing:{blockGap:'0'}}`);
    }
  }
  if ('layout' in attrs) {
    assertDefaultLayout(attrs.layout, POST_TEMPLATE_NAME);
  }
}

export const queryRenderer: BlockRenderer = {
  validateAttrs: (attrs) => {
    validateQueryAttrs(attrs);
  },
  render: (block: ParsedBlock, ctx: RenderCtx, renderChildren) => {
    const attrs = block.attrs ?? {};
    validateQueryAttrs(attrs);
    if (ctx.queries === undefined) {
      throw new RangeError('core/query: ctx.queries is required');
    }
    const items = ctx.queries.queryPosts(attrs.query);
    if (items.length === 0) {
      throw new RangeError('core/query: query returned no items');
    }
    const classes = ['wp-block-query'];
    if (attrs.align === 'wide') {
      classes.push('alignwide');
    } else if (attrs.align === 'full') {
      classes.push('alignfull');
    }
    classes.push('is-layout-flow', 'wp-block-query-is-layout-flow');
    const inner = renderChildren(block.innerBlocks, { query: { items } });
    return `<div class="${classes.join(' ')}">${inner}</div>`;
  },
};

export const postTemplateRenderer: BlockRenderer = {
  validateAttrs: (attrs) => {
    validatePostTemplateAttrs(attrs);
  },
  render: (block: ParsedBlock, ctx: RenderCtx, renderChildren) => {
    const attrs = block.attrs ?? {};
    validatePostTemplateAttrs(attrs);
    if (ctx.query === undefined) {
      throw new RangeError('core/post-template: ctx.query is required');
    }
    const hash = containerClassName(
      POST_TEMPLATE_NAME,
      layoutHashInput({ name: POST_TEMPLATE_NAME, attrs }, ctx.global),
    );
    const classes: string[] = [];
    if (attrs.align === 'full') {
      classes.push('alignfull');
    }
    classes.push('wp-block-post-template', 'is-layout-flow');
    if (hash !== '') {
      classes.push(hash);
    }
    classes.push('wp-block-post-template-is-layout-flow');
    const parts = ctx.query.items.map((item) => {
      const className = item.post.className;
      if (!CLASS_NAME_RE.test(className)) {
        throw new RangeError('core/post-template: post className contains disallowed characters');
      }
      const inner = renderChildren(block.innerBlocks, { post: item.post, content: item.content });
      return `<li class="wp-block-post ${escapeAttr(className)}">${inner}</li>`;
    });
    return `<ul class="${classes.join(' ')}">${parts.join('')}</ul>`;
  },
};

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

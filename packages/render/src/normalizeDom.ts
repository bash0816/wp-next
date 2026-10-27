import { type DefaultTreeAdapterMap, parse, parseFragment, serialize } from 'parse5';

type TreeNode = DefaultTreeAdapterMap['node'];
type ElementNode = DefaultTreeAdapterMap['element'];
type TextNode = DefaultTreeAdapterMap['textNode'];
type DocType = DefaultTreeAdapterMap['documentType'];

const SITEURL = 'http://127.0.0.1:8080';
const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);
const RAW_TEXT_ELEMENTS = new Set(['script', 'style']);

/** HTML の空白文字のみ(nbsp などは内容として扱い、除去しない) */
function isHtmlWhitespaceOnly(value: string): boolean {
  return /^[ \t\n\r\f]*$/.test(value);
}

/** 契約④⑤: siteurl / _wpnonce / data-wp-nonce / ver= を固定プレースホルダへ置換する */
function replacePlaceholders(value: string): string {
  return value
    .split(SITEURL)
    .join('{{SITEURL}}')
    .replace(/(_wpnonce=)[^&#\s"'<>]*/g, '$1{{NONCE}}')
    .replace(/([?&]ver=)[^&#\s"'<>]*/g, '$1{{VER}}');
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;');
}

function compareCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function serializeAttribute(name: string, value: string): string {
  const normalized = name === 'data-wp-nonce' ? '{{NONCE}}' : replacePlaceholders(value);
  return ` ${name}="${escapeAttr(normalized)}"`;
}

function serializeChildren(children: TreeNode[], parentTag: string | null): string {
  let out = '';
  for (const child of children) {
    out += serializeNode(child, parentTag);
  }
  return out;
}

function serializeNode(node: TreeNode, parentTag: string | null): string {
  switch (node.nodeName) {
    case '#text': {
      const value = (node as TextNode).value;
      if (isHtmlWhitespaceOnly(value)) {
        return '';
      }
      const replaced = replacePlaceholders(value);
      return parentTag !== null && RAW_TEXT_ELEMENTS.has(parentTag) ? replaced : escapeText(replaced);
    }
    case '#comment':
      return '';
    case '#documentType':
      return `<!DOCTYPE ${(node as DocType).name}>`;
    case '#document':
    case '#document-fragment':
      return serializeChildren((node as { childNodes: TreeNode[] }).childNodes, null);
    default: {
      const el = node as ElementNode;
      const tag = el.tagName;
      const attrs = [...el.attrs]
        .sort((a, b) => compareCodePoint(a.name, b.name))
        .map((a) => serializeAttribute(a.name, a.value))
        .join('');
      const open = `<${tag}${attrs}>`;
      if (VOID_ELEMENTS.has(tag)) {
        return open;
      }
      const content = (el as { content?: { childNodes: TreeNode[] } }).content;
      const children = content ? content.childNodes : el.childNodes;
      return `${open}${serializeChildren(children, tag)}</${tag}>`;
    }
  }
}

function isDocumentInput(html: string): boolean {
  return /^\s*(<!doctype|<html)/i.test(html);
}

/** 無視すべき差を取り除いた決定的な文字列を返す */
export function normalizeHtml(html: string): string {
  const tree = isDocumentInput(html) ? parse(html) : parseFragment(html);
  return serializeNode(tree, null);
}

export function htmlEquals(a: string, b: string): boolean {
  return normalizeHtml(a) === normalizeHtml(b);
}

function classTokens(el: ElementNode): string[] {
  const attr = el.attrs.find((a) => a.name === 'class');
  return attr ? attr.value.split(/\s+/).filter((t) => t.length > 0) : [];
}

function findFirstEntryContent(nodes: TreeNode[]): ElementNode | null {
  for (const node of nodes) {
    if (node.nodeName === 'div' && classTokens(node as ElementNode).includes('entry-content')) {
      return node as ElementNode;
    }
    const el = node as ElementNode;
    const content = (el as { content?: { childNodes: TreeNode[] } }).content;
    const children = content ? content.childNodes : (el.childNodes as TreeNode[] | undefined);
    if (children) {
      const found = findFirstEntryContent(children);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

/** 最初の class に entry-content を含む div の innerHTML(parse5 serialize)を返す */
export function extractEntryContent(pageHtml: string): string {
  const doc = parse(pageHtml);
  const el = findFirstEntryContent(doc.childNodes);
  if (!el) {
    throw new Error('entry-content not found');
  }
  return serialize(el);
}

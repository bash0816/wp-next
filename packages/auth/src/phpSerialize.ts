/**
 * PHP serialize() / unserialize() の部分集合実装。
 *
 * 対応: N; b:0|1; i:n; d:x; s:<バイト長>:"..."; a:n:{key;value...}
 * 非対応(PhpUnserializeError): O: C: r: R: 未知タグ
 */

export type PhpValue = null | boolean | number | string | PhpValue[] | { [k: string]: PhpValue };

export class PhpUnserializeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhpUnserializeError';
  }
}

const MAX_DEPTH = 32;
const MAX_TOKEN_BYTES = 64;
const CANONICAL_INT = /^(0|-?[1-9]\d*)$/;
const FLOAT_TOKEN = /^-?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;
const INT_TOKEN = /^-?\d+$/;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

function serializeString(s: string): string {
  return `s:${encoder.encode(s).length}:"${s}";`;
}

function serializeKey(k: string): string {
  if (CANONICAL_INT.test(k) && Number.isSafeInteger(Number(k))) {
    return `i:${k};`;
  }
  return serializeString(k);
}

export function phpSerialize(value: PhpValue): string {
  if (value === null) return 'N;';
  if (typeof value === 'boolean') return value ? 'b:1;' : 'b:0;';
  if (typeof value === 'number') {
    if (Number.isSafeInteger(value)) return `i:${value};`;
    if (Number.isNaN(value)) return 'd:NAN;';
    if (value === Infinity) return 'd:INF;';
    if (value === -Infinity) return 'd:-INF;';
    return `d:${String(value)};`;
  }
  if (typeof value === 'string') return serializeString(value);
  if (Array.isArray(value)) {
    let out = `a:${value.length}:{`;
    for (let i = 0; i < value.length; i++) {
      out += `i:${i};${phpSerialize(value[i] as PhpValue)}`;
    }
    return `${out}}`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    let out = `a:${keys.length}:{`;
    for (const k of keys) {
      out += `${serializeKey(k)}${phpSerialize(value[k] as PhpValue)}`;
    }
    return `${out}}`;
  }
  throw new TypeError(`unsupported value type: ${typeof value}`);
}

type Entry = [string | number, PhpValue];

function buildContainer(entries: Entry[]): PhpValue {
  let sequential = true;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e || e[0] !== i) {
      sequential = false;
      break;
    }
  }
  if (sequential) {
    return entries.map((e) => e[1]);
  }
  // Object.create(null): __proto__ キーもプロトタイプに触れず own property になる
  const obj: { [k: string]: PhpValue } = Object.create(null);
  for (const [k, v] of entries) {
    obj[String(k)] = v;
  }
  return obj;
}

class Reader {
  readonly buf: Uint8Array;
  pos = 0;

  constructor(buf: Uint8Array) {
    this.buf = buf;
  }

  fail(msg: string): PhpUnserializeError {
    return new PhpUnserializeError(`${msg} at byte ${this.pos}`);
  }

  peekByte(): number {
    if (this.pos >= this.buf.length) throw this.fail('unexpected end of input');
    return this.buf[this.pos] as number;
  }

  expect(ch: string): void {
    if (this.peekByte() !== ch.charCodeAt(0)) throw this.fail(`expected '${ch}'`);
    this.pos++;
  }

  remaining(): number {
    return this.buf.length - this.pos;
  }

  // ch までのトークンを読み、ch を消費して返す
  readUntil(ch: string, maxLen: number = MAX_TOKEN_BYTES): string {
    const idx = this.buf.indexOf(ch.charCodeAt(0), this.pos);
    if (idx < 0) throw this.fail(`missing '${ch}'`);
    if (idx - this.pos > maxLen) throw this.fail('token too long');
    const token = String.fromCharCode(...this.buf.subarray(this.pos, idx));
    this.pos = idx + 1;
    return token;
  }

  readInt(stop: string): number {
    const token = this.readUntil(stop, 32);
    if (!INT_TOKEN.test(token)) throw this.fail('invalid integer');
    const n = Number(token);
    if (!Number.isSafeInteger(n)) throw this.fail('integer out of safe range');
    return n;
  }

  // "<len>:\"<bytes>\";" の len 以降を読む
  readStringBody(): string {
    const len = this.readInt(':');
    if (len < 0) throw this.fail('negative string length');
    this.expect('"');
    if (len > this.remaining()) throw this.fail('string length exceeds input');
    const raw = this.buf.subarray(this.pos, this.pos + len);
    this.pos += len;
    this.expect('"');
    this.expect(';');
    try {
      return decoder.decode(raw);
    } catch {
      throw this.fail('invalid UTF-8 in string');
    }
  }

  readKey(): string | number {
    const tag = this.peekByte();
    this.pos++;
    this.expect(':');
    if (tag === 0x69 /* i */) return this.readInt(';');
    if (tag === 0x73 /* s */) {
      const str = this.readStringBody();
      return CANONICAL_INT.test(str) && Number.isSafeInteger(Number(str)) ? Number(str) : str;
    }
    throw this.fail('invalid array key type');
  }

  readArray(depth: number): PhpValue {
    if (depth > MAX_DEPTH) throw this.fail(`nesting deeper than ${MAX_DEPTH}`);
    const count = this.readInt(':');
    if (count < 0) throw this.fail('negative element count');
    this.expect('{');
    // 要素の最小長は key "i:0;"(4) + value "N;"(2) = 6 バイト
    if (count * 6 > this.remaining()) throw this.fail('declared element count exceeds input length');
    const entries: Entry[] = [];
    for (let i = 0; i < count; i++) {
      const key = this.readKey();
      const value = this.readValue(depth);
      entries.push([key, value]);
    }
    this.expect('}');
    return buildContainer(entries);
  }

  // depth: この値を含む最も内側のコンテナの深さ(トップレベルは 0)
  readValue(depth: number): PhpValue {
    const tag = this.peekByte();
    this.pos++;
    switch (tag) {
      case 0x4e /* N */:
        this.expect(';');
        return null;
      case 0x62 /* b */: {
        this.expect(':');
        const t = this.readUntil(';', 1);
        if (t === '1') return true;
        if (t === '0') return false;
        throw this.fail('invalid boolean');
      }
      case 0x69 /* i */:
        this.expect(':');
        return this.readInt(';');
      case 0x64 /* d */: {
        this.expect(':');
        const t = this.readUntil(';');
        if (t === 'INF') return Infinity;
        if (t === '-INF') return -Infinity;
        if (t === 'NAN') return NaN;
        if (!FLOAT_TOKEN.test(t)) throw this.fail('invalid float');
        return Number(t);
      }
      case 0x73 /* s */:
        this.expect(':');
        return this.readStringBody();
      case 0x61 /* a */:
        this.expect(':');
        return this.readArray(depth + 1);
      default:
        throw this.fail(`unsupported type '${String.fromCharCode(tag)}'`);
    }
  }
}

export function phpUnserialize(input: string): PhpValue {
  try {
    const reader = new Reader(encoder.encode(input));
    const value = reader.readValue(0);
    if (reader.pos !== reader.buf.length) throw reader.fail('trailing data');
    return value;
  } catch (e) {
    if (e instanceof PhpUnserializeError) throw e;
    const detail = e instanceof Error ? e.message : String(e);
    throw new PhpUnserializeError(`invalid input: ${detail}`);
  }
}

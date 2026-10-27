import { describe, it, expect } from 'vitest';
import {
  phpSerialize,
  phpUnserialize,
  PhpUnserializeError,
  type PhpValue,
} from './phpSerialize.js';

// WordPress の usermeta `session_tokens` と同形の値を作るための固定 64 桁 hex
const TOKEN_HEX = 'a1b2c3d4e5f60718'.repeat(4);
const SESSION_TOKENS_SERIALIZED =
  `a:1:{s:64:"${TOKEN_HEX}";a:4:{s:10:"expiration";i:1735689600;s:2:"ip";s:9:"127.0.0.1";s:2:"ua";s:5:"Agent";s:5:"login";i:1735603200;}}`;
const SESSION_TOKENS_VALUE: PhpValue = {
  [TOKEN_HEX]: {
    expiration: 1735689600,
    ip: '127.0.0.1',
    ua: 'Agent',
    login: 1735603200,
  },
};

/** 指定の入れ子深さの配列を素の文字列として組み立てる(最内は null)。 */
function nestedArrayString(depth: number): string {
  return 'a:1:{i:0;'.repeat(depth) + 'N;' + '}'.repeat(depth);
}

describe('phpSerialize / phpUnserialize: スカラー値', () => {
  it('null は N; で表現され、N; から null に戻る', () => {
    expect(phpSerialize(null)).toBe('N;');
    expect(phpUnserialize('N;')).toBe(null);
  });

  it('bool は b:1; / b:0; で表現される', () => {
    expect(phpSerialize(true)).toBe('b:1;');
    expect(phpSerialize(false)).toBe('b:0;');
    expect(phpUnserialize('b:1;')).toBe(true);
    expect(phpUnserialize('b:0;')).toBe(false);
  });

  it('整数は i:N; で表現され、負数も扱える', () => {
    expect(phpSerialize(123)).toBe('i:123;');
    expect(phpSerialize(-5)).toBe('i:-5;');
    expect(phpUnserialize('i:123;')).toBe(123);
    expect(phpUnserialize('i:-5;')).toBe(-5);
  });

  it('非整数の数値は d:N; で表現され、d:0.5; から 0.5 に戻る', () => {
    expect(phpSerialize(0.5)).toBe('d:0.5;');
    expect(phpUnserialize('d:0.5;')).toBe(0.5);
  });

  it('文字列の長さは UTF-8 バイト数で宣言される(日本語 "あ" は 3 バイト)', () => {
    expect(phpSerialize('あ')).toBe('s:3:"あ";');
    expect(phpUnserialize('s:3:"あ";')).toBe('あ');
  });

  it('ASCII 文字列は s:<長さ>:"..."; で表現される', () => {
    expect(phpSerialize('abc')).toBe('s:3:"abc";');
    expect(phpUnserialize('s:3:"abc";')).toBe('abc');
  });
});

describe('配列の表現', () => {
  it('キーが 0..n-1 の連番なら PHP の添字配列として serialize される', () => {
    const s = 'a:2:{i:0;s:1:"x";i:1;s:1:"y";}';
    expect(phpSerialize(['x', 'y'])).toBe(s);
    expect(phpUnserialize(s)).toEqual(['x', 'y']);
  });

  it('文字列キーのオブジェクトは連想配列として往復する', () => {
    const s = 'a:1:{s:3:"abc";i:1;}';
    expect(phpSerialize({ abc: 1 })).toBe(s);
    expect(phpUnserialize(s)).toEqual({ abc: 1 });
  });

  it('空配列は a:0:{} で表現される', () => {
    expect(phpSerialize([])).toBe('a:0:{}');
    expect(phpUnserialize('a:0:{}')).toEqual([]);
  });

  it('キー順は serialize/unserialize を通じて維持される', () => {
    const v = { b: 1, a: 2, c: 3 };
    const s = phpSerialize(v);
    expect(s).toBe('a:3:{s:1:"b";i:1;s:1:"a";i:2;s:1:"c";i:3;}');
    expect(Object.keys(phpUnserialize(s) as object)).toEqual(['b', 'a', 'c']);
  });
});

describe('WordPress session_tokens の実例', () => {
  it('unserialize すると期待するオブジェクトになる', () => {
    expect(phpUnserialize(SESSION_TOKENS_SERIALIZED)).toEqual(SESSION_TOKENS_VALUE);
  });

  it('serialize すると元の文字列と完全一致する(キー順維持)', () => {
    expect(phpSerialize(SESSION_TOKENS_VALUE)).toBe(SESSION_TOKENS_SERIALIZED);
  });
});

describe('往復性 unserialize(serialize(v)) === v', () => {
  const samples: Array<[string, PhpValue]> = [
    ['日本語を含む文字列', 'こんにちは、世界'],
    ['空配列', []],
    ['入れ子の配列とオブジェクト', [{ name: 'ユーザー', tags: ['a', 'b', []] }, null, true, -1.25]],
    ['session_tokens 形式', SESSION_TOKENS_VALUE],
  ];

  for (const [label, v] of samples) {
    it(label, () => {
      expect(phpUnserialize(phpSerialize(v))).toEqual(v);
    });
  }
});

describe('不正入力は PhpUnserializeError を投げる', () => {
  const invalid: Array<[string, string]> = [
    ['空文字', ''],
    ['途中切れ(配列の閉じ括弧なし)', 'a:1:{i:0;i:1;'],
    ['途中切れ(セミコロンなし)', 'i:1'],
    ['文字列の長さ不一致(宣言 5 / 実際 3)', 's:5:"abc";'],
    ['未知の型タグ', 'x:1;'],
    ['オブジェクト(stdClass)は拒否', 'O:8:"stdClass":0:{}'],
    ['C: カスタムオブジェクトは拒否', 'C:3:"Foo":0:{}'],
    ['r: 参照は拒否', 'a:1:{i:0;r:1;}'],
    ['R: 参照は拒否', 'a:2:{i:0;i:1;i:1;R:2;}'],
    ['配列要素数の宣言が実際より多い', 'a:2:{i:0;i:1;}'],
    ['配列要素数の宣言が実際より少ない', 'a:1:{i:0;i:1;i:1;i:2;}'],
    ['末尾に余計な文字', 'i:1;x'],
    ['末尾に余計な文字(正常な値の後ろ)', 's:1:"x";;'],
  ];

  for (const [label, input] of invalid) {
    it(label, () => {
      expect(() => phpUnserialize(input)).toThrow(PhpUnserializeError);
    });
  }

  it('PhpUnserializeError は Error のサブクラスである', () => {
    expect(new PhpUnserializeError('x')).toBeInstanceOf(Error);
  });

  it('入れ子深さ 33 は拒否される(上限 32 超過)', () => {
    expect(() => phpUnserialize(nestedArrayString(33))).toThrow(PhpUnserializeError);
  });

  it('入れ子深さ 32 は受理される(上限ちょうど)', () => {
    expect(() => phpUnserialize(nestedArrayString(32))).not.toThrow();
  });

  it('入れ子深さ 100 は拒否される', () => {
    expect(() => phpUnserialize(nestedArrayString(100))).toThrow(PhpUnserializeError);
  });
});

describe('巨大な宣言長はメモリを確保せず即座に拒否する', () => {
  it('a:99999999:{ は即座に PhpUnserializeError', () => {
    const start = performance.now();
    expect(() => phpUnserialize('a:99999999:{')).toThrow(PhpUnserializeError);
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it('s:99999999:"x"; は即座に PhpUnserializeError', () => {
    const start = performance.now();
    expect(() => phpUnserialize('s:99999999:"x";')).toThrow(PhpUnserializeError);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});

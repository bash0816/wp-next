// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { containerClassName, toPhpJson } from './layoutClass.js';

// 期待値は docs/spike-notes/container-class-hash.md の「検証」節の実 render 照合結果に由来する。
const headerInput1 = [
  { type: 'flex', flexWrap: 'nowrap', justifyContent: 'space-between' },
  true,
  null,
  false,
  '1.2rem',
  { padding: { top: 'var:preset|spacing|30', bottom: 'var:preset|spacing|30' } },
];
const headerInput2 = [
  { type: 'flex', flexWrap: 'nowrap', justifyContent: 'right' },
  true,
  'var:preset|spacing|10',
  false,
  '1.2rem',
  { blockGap: 'var:preset|spacing|10' },
];

describe('containerClassName: 実 render のハッシュと一致する (container-class-hash.md)', () => {
  it('header.php 1つ目 (flex/nowrap/space-between) → ec1e7a1e', () => {
    expect(containerClassName('core/group', headerInput1)).toBe(
      'wp-container-core-group-is-layout-ec1e7a1e',
    );
  });

  it('header.php 2つ目 (flex/nowrap/right) → fbffc046', () => {
    expect(containerClassName('core/group', headerInput2)).toBe(
      'wp-container-core-group-is-layout-fbffc046',
    );
  });
});

describe('toPhpJson: wp_json_encode (既定フラグ) 相当の文字列化', () => {
  it('md の入力 1 は空白なし・キー順は挿入順・| はエスケープされない', () => {
    expect(toPhpJson(headerInput1)).toBe(
      '[{"type":"flex","flexWrap":"nowrap","justifyContent":"space-between"},true,null,false,"1.2rem",{"padding":{"top":"var:preset|spacing|30","bottom":"var:preset|spacing|30"}}]',
    );
  });

  it('文字列中の / は \\/ にエスケープされる', () => {
    expect(toPhpJson(['a/b'])).toBe('["a\\/b"]');
  });

  it('キーの / もエスケープされる', () => {
    expect(toPhpJson([{ 'a/b': 1 }])).toBe('[{"a\\/b":1}]');
  });

  it('<>&\'" は既定フラグではエスケープされない (" と / は除く)', () => {
    expect(toPhpJson(['<a href="x">&\'</a>'])).toBe('["<a href=\\"x\\">&\'<\\/a>"]');
  });

  it('非ASCIIは小文字hexの \\uXXXX になる', () => {
    expect(toPhpJson(['é'])).toBe('["\\u00e9"]');
  });

  it('BMP外の文字はサロゲートペアの \\uXXXX になる', () => {
    expect(toPhpJson(['😀'])).toBe('["\\ud83d\\ude00"]');
  });

  it('制御文字は \\n \\t 等と \\u00XX で表される', () => {
    expect(toPhpJson(['\n\t\u0001'])).toBe('["\\n\\t\\u0001"]');
  });

  it('空の連想オブジェクトは PHP で decode 後の空配列と同じ [] になる', () => {
    expect(toPhpJson([{}])).toBe('[[]]');
  });

  it('整数は10進で出力される', () => {
    expect(toPhpJson([0, -3, 42])).toBe('[0,-3,42]');
  });
});

describe('containerClassName: 未対応入力は RangeError (fail-closed)', () => {
  it('float を含むと RangeError', () => {
    expect(() => containerClassName('core/group', [1.5])).toThrow(RangeError);
  });

  it('整数風キーを持つオブジェクトは RangeError (PHP配列のキー順と JS の順序が一致しない)', () => {
    expect(() => containerClassName('core/group', [{ '1': 'a', b: 'c' }])).toThrow(RangeError);
    expect(() => containerClassName('core/group', [{ '-3': 'a' }])).toThrow(RangeError);
    expect(() => containerClassName('core/group', [{ '01x': 'a' }])).not.toThrow();
  });

  it('安全範囲外の整数は RangeError', () => {
    expect(() => containerClassName('core/group', [2 ** 53])).toThrow(RangeError);
  });

  it('NaN / Infinity は RangeError', () => {
    expect(() => containerClassName('core/group', [Number.NaN])).toThrow(RangeError);
    expect(() => containerClassName('core/group', [Number.POSITIVE_INFINITY])).toThrow(RangeError);
  });

  it('undefined や関数は RangeError', () => {
    expect(() => containerClassName('core/group', [undefined])).toThrow(RangeError);
    expect(() => containerClassName('core/group', [() => 1])).toThrow(RangeError);
  });

  it('孤立サロゲートは RangeError (PHP の UTF-8 として不正)', () => {
    expect(() => containerClassName('core/group', ['\ud83d'])).toThrow(RangeError);
  });

  it('循環参照は RangeError', () => {
    const cyc: Record<string, unknown> = {};
    cyc.self = cyc;
    expect(() => containerClassName('core/group', [cyc])).toThrow(RangeError);
  });

  it('未知の blockName 文字 (記号・非ASCII・空) は RangeError', () => {
    expect(() => containerClassName('core/gr@up', headerInput1)).toThrow(RangeError);
    expect(() => containerClassName('core/グループ', headerInput1)).toThrow(RangeError);
    expect(() => containerClassName('', headerInput1)).toThrow(RangeError);
  });

  it('大文字の blockName は小文字化される (Core/Group → core-group)', () => {
    expect(containerClassName('Core/Group', headerInput1)).toBe(
      'wp-container-core-group-is-layout-ec1e7a1e',
    );
  });
});

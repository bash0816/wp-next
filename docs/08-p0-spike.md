# P0 成立性スパイク計画 v2(ブロックテーマをTSで描画できるか)
v2: GPT-6.1-sol STEP2/3 No-Go(Blocker2/Major6/Minor1)を反映。方式=B(ADR-025)。Dは将来検討で排除しない。
目的: B案の成立性を、測定可能な条件で判定する。基準=OCI基準WP 7.1.3 + twentytwentyfive 1.5。

## 1. 入力・基準・比較の契約
- **入力(再現可能)**: fixtures/ref に 基準HTML、post_content、投稿一覧に加え、**DBダンプ(基準WPのSQLite: posts/postmeta/options/users/usermeta/terms)と取得手順**を追加(段階A')。本実装はこのダンプのみを入力とする。期待値(基準HTML)は実WPから取得し、TS描画は生データのみ入力(期待値をコードに埋めない)。
- **fixture 2セット**: ①現行(ID5)②別fixture(ID・タイトル・slug・投稿順・入れ子本文・特殊文字を変えたもの、基準WPに作成して再取得)。過適合防止。
- **正規化DOM**: HTMLパーサ=parse5。比較範囲=`<body>`全体(headは別扱い=段階E)。無視するのは ①HTMLコメント ②要素間の空白のみ(テキストノード内は維持) ③属性順 ④siteurl(`http://127.0.0.1:8080`→プレースホルダ) ⑤nonce/`?ver=`のみ。class・href・子要素順・本文テキストは**消さない**。
- **比較器の負例テスト**: 文字・href・class・要素順を1つ変えると必ず不一致になること、子ブロックの欠落/二重出力も不一致になること。
- **テーマ範囲**: fixtureは部分取得(templates/parts/patterns/styles/theme.json/style.css/functions.php。画像・フォント除外)。画像・フォントと画面検証(スクショ差分)はE3へ。
- **ライセンス(段階A)**: twentytwentyfive 1.5 の著作権・無保証・継承元表示(上流readme.txt)を fixtures/ref/themes に保持。`@wordpress/*`は採用パッケージ・版・依存ごとに license を確認して `docs/licenses.md` に記録(parser 6.0.0はGPL-2.0以降=GPLv3選択可)。

## 2. 段階と合格条件(B=静的、C=動的を分離)
| 段階 | 内容 | 合格 |
|---|---|---|
| A/A' | fixture・ダンプ・ライセンス表示・再取得手順 | 保存済み、他マシンで再現できる |
| B | **静的ブロックのみ**(heading/paragraph/list/quote/separator)。`post_content`→HTML。静的専用golden(latest-posts行を除いた期待値)。list/quoteの子欠落・二重出力を検査 | 2fixtureで body 部分(entry-content内)が正規化DOM完全一致 |
| C | 動的 `core/latest-posts`: DB可視クエリ(`visibleWhere`必須)。件数・並び・既定属性・空結果、公開/private/下書き混在、公開状態変更後の再描画 | 本文全体(動的含む)が一致+可視性テスト |
| D | テンプレ合成: single.html、header/footer parts、patternのPHP式(`esc_html_e`等はTS代替)、core/post-title等。**comments・more-posts内query等の依存範囲を事前に列挙して固定** | body全体が一致 |
| E | theme.json→global-styles/CSS変数。対象は `:root`のCSS変数とTT25本文ブロック用ルールに限定(一覧を固定) | 対象範囲が完全一致(許容差分は一覧化したもののみ) |
## 3. 安全性(全段階の合格条件)
出力は文脈別escaping(テキスト/属性/URL)。パーサはサニタイザではない。未知ブロック・不正属性・未対応PHP式・pattern循環は**診断を出して合格を拒否**(生HTMLへの無条件フォールバック禁止)。可視性はSQL。
## 4. 判定と撤退条件(測定可能)
- Go: B,C,D,E(限定範囲)が全て合格。
- 時間上限(作業時間の目安): A/A' 0.5日、B 1日、C 1日、D 2日、E 1日。上限超過かつ未解決差分があれば、その時点で**ユーザーに報告して判断**(自動撤退しない)。
- 「未実装」と「方式不成立」を区別: 不成立と判定できるのは、TSで代替不能と示せたPHP依存(例: 任意PHPコードの実行が必須のテーマ機能)に限る。`esc_html_e()`等のPHPタグの存在だけでは根拠にしない。
- 撤退先候補はC(php-wasm描画)/D(併用)。ユーザー判断(ADR-025)。

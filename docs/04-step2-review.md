# STEP2 設計レビュー結果 (GPT-6.1-sol, 2026-10-25)  判定: 設計はNo-Go / 成立性スパイクはGo
※数値・仕様はレビュー引用の公式資料ベース。**実装前に一次情報で再確認**すること(D1/Workers制限は変わる)。

## Blocker → 対応方針(設計v2)
| # | 指摘 | v2での対応 |
|---|---|---|
| B1 | public→private化時にNext.jsキャッシュ/静的生成物/RSC/SWキャッシュを回収できない | 可視性変更時の失効手順を必須化(revalidate tag/path、CDN purge、SWはprivateを一切キャッシュしない+バージョン更新で破棄)。端末に保存済みの旧公開コンテンツは回収不能とオフライン要件に明記。privateを含みうるページは静的生成しない |
| B2 | privateメディアの権限/失効モデル未定義 | 非公開バケット+毎回認可するWorker配信を既定。署名URLは「失効不要な低機密」のみ。attachmentの親権限継承(inherit)、共用、サムネイル、旧URLを仕様化 |
| B3 | プラグイン隔離境界なし | 信頼モデルを確定: Tier A/B=「監査済みコードのみ」同一Worker(取込時レビュー必須)、Tier C=別実行境界+権限制限RPC(DB/通信/FSの許可リスト)。未監査コードは実行しない |

## Major → 対応
- M1 無料枠: D1無料500MB/Workers無料CPU10ms等。Phase1で実測、予算(クエリ数/走査行)設定、有料前提かの判断条件をADR化
- M2 スキーマ: 同形保存層+互換API層。生SQL互換は限定。wp_termmeta/wp_commentmeta追加、PHP serialize、重複meta、64bit ID(文字列扱い)の契約を定義
- M3 認証: WP6.8+のbcrypt(+SHA-384前処理)とphpass両対応で検証、初回ログイン時に再ハッシュ。閲覧権限と編集/削除/設定権限(capabilities)を分離。セッション失効・CSRF・REST公開フィールドを定義
- M4 移行: WXRはoptions/メディア実体/認証情報を含まない。入力方式別の取得範囲表、ID対応表、冪等再実行、削除検知、差分同期、切替/ロールバック手順を追加
- M5 ライセンス: ヘッダ依存をやめ、同梱ライブラリ・画像・フォント・生成物も依存物一覧(SBOM)で判定。通知保持・対応ソース提供。「別プロセスなら解決」と仮定しない
- M6 順序: 縦断スパイクを前倒し(下記)。Tier C不成立時の撤退条件を明記

## Minor
合格基準(hook順序・参照渡し・動的ブロック・CSS/JS依存、WP/Next/OpenNext版固定、実サイト出力比較)。XSS/SSRF/cron重複/復旧試験/旧URLリダイレクト。PHP検証時期をPhase1スパイクに統一。

## ロードマップ改訂(v2)
| Phase | 内容 |
|---|---|
| 0 | 設計v2確定、再レビュー |
| 1 | **成立性スパイク**: (a)認可付きSSR+D1+非公開メディア縦断 (b)PHP→同期WP API→非同期D1の最小実験 (c)Workers/D1制限実測。結果をADR化、Tier C採否 |
| 2 | monorepo/schema/core(canView+capabilities)/認証 |
| 3 | importer(入力方式別)・冪等・差分 |
| 4 | Next.js表示+ブロック+PWA(キャッシュ失効込み) |
| 5 | プラグインSDK+analyzer+SBOM判定 |
| 6 | 管理画面 |
| 7 | Cloudflare staging(承認後)・切替/ロールバック試験 |

# 友だち追加案内 staging 2026-10-07

公開中のroot画面には変更していません。このディレクトリは架空会員・架空投票の動作確認用です。
全API通信を模擬応答に差し替え、本番連携・投票・問い合わせは保存しません。LINE SDKも模擬動作で、友だち追加は実行しません。

- election.html?friend=0&linked=0 : 未友だち・未連携
- election.html?friend=0&linked=1 : 未友だち・連携済み
- election.html?friend=1&linked=0 : 友だち・未連携
- election.html?friend=1&linked=1 : 友だち・連携済み
- index.html?view=register&friend=0&linked=0 : 会員登録
- mode=cancel/unavailable/missing/reject/error/timeout : 追加キャンセル・未対応・例外・取得失敗

実LINEのLIFF認証、サブウィンドウ表示、実本人照合・永続化の通し確認は未実施です。本番反映条件には含めてください。

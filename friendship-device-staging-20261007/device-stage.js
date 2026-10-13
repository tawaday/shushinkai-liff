// Real LIFF SDK and real API; storage is limited to dedicated staging sheets.
document.addEventListener("DOMContentLoaded", () => {
 const notice=document.createElement("aside");notice.style.cssText="background:#fff0c2;padding:14px;line-height:1.7;font-weight:bold";
 notice.textContent=typeof launchParams !== "undefined" && launchParams.view === "event" ? "新年会の実機検証用です。本番とは別のテスト名簿を使い、受付からテスト用Zoom会議への移動を確認します。" : "実機検証専用：架空会員・テスト選挙です。本番の投票には含まれません。友だち追加は宗心会公式LINEへの実際の操作です。";document.body.prepend(notice);
});

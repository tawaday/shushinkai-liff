const PORTAL = {
  LIFF_ID: "2010887632-4M5XI8d7",
  GAS_API_URL: "https://script.google.com/macros/s/AKfycbwNCQUmgSBUHWp1uaUskloNa2vMbdmiFNN0bfhWrqWZGriaCOdKB13hFcFMDUfINIQ/exec"
};

let idToken = "";
let confirmationToken = "";
const $ = id => document.getElementById(id);
const screenIds = ["loading", "message", "registered", "register", "confirm", "inquiry", "inquiryComplete", "inquiryAdmin", "news", "inquiryHome", "inquiryFaq", "inquiryList", "faqManage"];
let visibleScreen = "loading";
const show = id => {
  visibleScreen = id;
  screenIds.forEach(x => $(x).classList.toggle("hidden", x !== id));
  const managing = ["inquiryAdmin","inquiryList","faqManage"].includes(id);
  for (const [tab, selected] of [["memberTab",!managing],["manageTab",managing]]) {
    if ($(tab)) {$(tab).classList.toggle("secondaryButton",!selected);$(tab).setAttribute("aria-pressed",String(selected));}
  }
};

const launchParams = (() => {
  const params = new URLSearchParams(location.search);
  const state = params.get("liff.state") || "";
  const query = state.includes("?")
    ? state.slice(state.indexOf("?") + 1)
    : state.replace(/^[?#]/, "");
  const nested = new URLSearchParams(query);
  let saved = {};
  // LINE外の初回ログインでは、OAuthから戻る際にLIFFのviewが落ちる場合がある。
  // code/state付きの正規コールバック時だけ、ログイン直前に保存した遷移先を復元する。
  if (params.has("code") && params.has("state")) {
    try { saved = JSON.parse(sessionStorage.getItem("shushinkai_liff_launch_params") || "{}"); } catch (_) {}
  }
  return {
    view: params.get("view") || nested.get("view") || saved.view || "home",
    preview: (params.get("preview") || nested.get("preview") || saved.preview || "") === "1" ? "1" : "",
    election: params.get("election") || nested.get("election") || saved.election || "chairman_2026",
    id: params.get("id") || nested.get("id") || saved.id || "",
    newsToken: params.get("nt") || nested.get("nt") || saved.newsToken || ""
  };
})();

// 入口の機能名だけを表示し、認証や遷移には使用しない。
const portalSubtitles = new Map([
  ["card", "会員証"],
  ["profile", "会員情報"],
  ["register", "会員登録"],
  ["news", "お知らせ"],
  ["news-admin", "お知らせ編集"],
  ["profile-news", "お知らせ編集"],
  ["contact", "問い合わせ"],
  ["inquiry", "問い合わせ"],
  ["inquiry-admin", "問い合わせ管理"],
  ["payment", "会計一覧"],
  ["reception", "QR受付"],
  ["reminder", "リマインド管理"],
  ["election-admin", "選挙管理"],
  ["vote", "電子投票"]
]);
$("portalSubtitle").textContent = portalSubtitles.get(launchParams.view) || "会員ポータル";

document.addEventListener("DOMContentLoaded", start);

async function start() {
  try {
    if (launchParams.view === "vote") {
      location.replace("election.html?election=" + encodeURIComponent(launchParams.election) + (launchParams.preview === "1" ? "&preview=1" : ""));
      return;
    }
    if (launchParams.view === "news" && launchParams.id && launchParams.newsToken) {
      const result = await api({
        action:"resolve", view:"news", id:launchParams.id, newsToken:launchParams.newsToken
      });
      if (result.ok) {
        handleResolve(result);
        return;
      }
    }
    await liff.init({ liffId:PORTAL.LIFF_ID, withLoginOnExternalBrowser:false });
    if (!liff.isLoggedIn()) {
      saveLaunchParamsForLogin_();
      liff.login({ redirectUri:location.href });
      return;
    }
    if (isIdTokenExpired_()) {
      restartLineLogin_();
      return;
    }
    idToken = liff.getIDToken() || "";
    if (!idToken) throw Error("LINE認証情報を取得できませんでした。");
    const result = await api({ action:"resolve", view:launchParams.view, id:launchParams.id, idToken });
    if (!result.ok && /(?:IdToken\s+expired|token.*expired|期限切れ)/i.test(String(result.error || ""))) {
      restartLineLogin_();
      return;
    }
    sessionStorage.removeItem("shushinkai_liff_launch_params");
    handleResolve(result);
  } catch (error) {
    message("画面を開けません", error.message);
  }
}

function isIdTokenExpired_() {
  const decoded = typeof liff.getDecodedIDToken === "function"
    ? liff.getDecodedIDToken()
    : null;
  const expiresAt = Number(decoded && decoded.exp || 0) * 1000;
  return !!expiresAt && expiresAt <= Date.now() + 30000;
}

function restartLineLogin_() {
  const retryKey = "shushinkai_liff_auth_retry";
  const lastRetry = Number(sessionStorage.getItem(retryKey) || 0);
  if (Date.now() - lastRetry < 15000) {
    sessionStorage.removeItem(retryKey);
    throw Error("LINE認証を更新できませんでした。画面を閉じて、もう一度開いてください。");
  }
  sessionStorage.setItem(retryKey, String(Date.now()));
  saveLaunchParamsForLogin_();
  try { liff.logout(); } catch (_) {}
  liff.login({ redirectUri:location.href });
}

function saveLaunchParamsForLogin_() {
  sessionStorage.setItem("shushinkai_liff_launch_params", JSON.stringify({
    view:launchParams.view,
    preview:launchParams.preview,
    election:launchParams.election,
    id:launchParams.id,
    newsToken:launchParams.newsToken
  }));
}

function handleResolve(result) {
  if (!result.ok) {
    if (result.notLinked) {
      showRegistration(result.fallbackUrl);
      return;
    }
    throw Error(result.error || "本人確認に失敗しました。");
  }
  if (result.view === "register") {
    showRegistration(result.fallbackUrl);
    return;
  }
  if (result.view === "alreadyRegistered") {
    renderRegistered(result);
    return;
  }
  if (result.redirectUrl) {
    location.replace(result.redirectUrl);
    return;
  }
  if (result.view === "vote") {
    location.replace("election.html?election=" + encodeURIComponent(launchParams.election) + (launchParams.preview === "1" ? "&preview=1" : ""));
    return;
  }
  if (result.view === "news") {
    if (result.announcement) renderNewsArticle(result.announcement);
    else renderNews(result.announcements || []);
    return;
  }
  if (result.view === "contactSent") {
    message("メニューを送りました", "宗心会公式LINEの個別トークに、お問い合わせメニューを送りました。LINEへ戻ってご確認ください。");
    return;
  }
  if (result.view === "inquiry") {
    configureInquiryTabs_(result.canManage === true);
    show("inquiryHome");
    return;
  }
  if (result.view === "inquiryList") {
    configureInquiryTabs_(true);
    renderInquiryList_(result);
    return;
  }
  if (result.view === "inquiryAdmin") {
    configureInquiryTabs_(true);
    renderInquiryAdmin_(result);
    return;
  }
  // These routes must resolve to an identity form, registered screen, or destination.
  if (["card", "profile", "register"].includes(launchParams.view)) {
    message("画面を開けませんでした", "表示に必要な情報を確認できませんでした。この画面を閉じ、LINE内から同じリンクをもう一度開いてください。繰り返す場合は、画面の画像と開いた時刻を事務局へお知らせください。");
    return;
  }
  message("ようこそ", `${result.memberName || "会員"} 様`);
}

function showRegistration(fallbackUrl) {
  const link = $("applicationLink");
  link.classList.toggle("hidden", !fallbackUrl);
  if (fallbackUrl) link.href = fallbackUrl;
  show("register");
}

function renderRegistered(result) {
  $("registeredMemberId").textContent = result.memberId || "（記録なし）";
  $("registeredMemberName").textContent = result.memberName || "（記録なし）";
  $("registeredAt").textContent = result.registeredAt || "（記録なし）";
  show("registered");
}

async function completeRegistration_(result) {
  if (launchParams.view !== "card" && launchParams.view !== "profile") {
    renderRegistered(result);
    return;
  }
  show("loading");
  try {
    if (isIdTokenExpired_()) {
      restartLineLogin_();
      return;
    }
    const destination = await api({ action:"resolve", view:launchParams.view, id:launchParams.id, idToken });
    if (!destination.ok && /(?:IdToken\s+expired|token.*expired|期限切れ)/i.test(String(destination.error || ""))) {
      restartLineLogin_();
      return;
    }
    if (!destination.ok || destination.notLinked || destination.registered !== true ||
        !destination.redirectUrl || ["register", "alreadyRegistered"].includes(destination.view)) {
      throw Error(destination.error || "連携後の行き先を確認できませんでした。");
    }
    handleResolve(destination);
  } catch (error) {
    message("LINE連携は完了しました", "元の画面を開けませんでした。LINEのメニューからもう一度開いてください。\n" + error.message);
  }
}

function message(title, text, url, label) {
  show("message");
  $("messageTitle").textContent = title;
  $("messageText").textContent = text || "";
  const link = $("messageLink");
  link.classList.toggle("hidden", !url);
  if (url) {
    link.href = url;
    link.textContent = label || "開く";
  }
}

$("lookupButton").onclick = async () => {
  try {
    $("registerError").textContent = "";
    const result = await api({
      action:"registrationLookup",
      idToken,
      name:$("name").value,
      clubTerm:$("clubTerm").value,
      birthDate:$("birthDate").value
    });
    if (!result.ok) throw Error(result.error);
    if (result.alreadyRegistered) {
      await completeRegistration_(result);
      return;
    }
    confirmationToken = result.confirmationToken;
    $("confirmText").textContent = `${result.member.name} 様（部内期数 ${result.member.clubTerm}）\nこの内容でLINE連携します。`;
    show("confirm");
  } catch (error) {
    $("registerError").textContent = error.message;
  }
};

$("confirmButton").onclick = async () => {
  const button = $("confirmButton");
  try {
    button.disabled = true;
    const result = await api({ action:"registrationConfirm", idToken, confirmationToken });
    if (!result.ok) throw Error(result.error);
    await completeRegistration_(result);
  } catch (error) {
    message("登録できませんでした", error.message);
  } finally {
    button.disabled = false;
  }
};

$("inquiryForm").addEventListener("submit", async event => {
  event.preventDefault();
  const button = $("inquirySubmit");
  const errorBox = $("inquiryError");
  try {
    errorBox.textContent = "";
    button.disabled = true;
    button.textContent = "送信しています…";
    const file = $("inquiryAttachment").files[0];
    if (file && file.size > 10 * 1024 * 1024) throw Error("添付ファイルは10MB以下にしてください。");
    const attachment = file ? await fileAsBase64_(file) : null;
    const responseChoice = document.querySelector('input[name="responseRequested"]:checked');
    const result = await apiJson({
      api:"1", fn:"inquirySubmit", idToken,
      inquiry:{
        category:$("inquiryCategory").value,
        contactKind:$("contactKind").disabled ? "" : $("contactKind").value,
        publicationScope:$("publicationScope").disabled ? "" : $("publicationScope").value,
        faqSearchKeyword:faqContext.keyword,sourceFaqId:faqContext.id,sourceFaqTitle:faqContext.title,
        subject:$("inquirySubject").value,
        body:$("inquiryBody").value,
        responseRequested:responseChoice && responseChoice.value === "true",
        attachment:attachment
      }
    });
    if (!result.ok) throw Error(result.error || "送信できませんでした。");
    $("inquiryForm").reset();faqContext={keyword:"",id:"",title:""};
    $("inquiryId").textContent = result.inquiryId;
    $("inquiryCreatedAt").textContent = result.createdAt;
    show("inquiryComplete");
    window.scrollTo(0, 0);
  } catch (error) {
    errorBox.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "送信する";
  }
});

function fileAsBase64_(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ fileName:file.name, mimeType:file.type, base64:String(reader.result || "").split(",")[1] || "" });
    reader.onerror = () => reject(Error("添付ファイルを読み取れませんでした。"));
    reader.readAsDataURL(file);
  });
}

async function apiJson(data) {
  const response = await fetch(PORTAL.GAS_API_URL, {
    method:"POST", headers:{ "Content-Type":"text/plain;charset=utf-8" },
    body:JSON.stringify(data), cache:"no-store", redirect:"follow"
  });
  if (!response.ok) throw Error("通信エラー（HTTP " + response.status + "）");
  return response.json();
}

function renderInquiryAdmin_(result) {
  const inquiry = result.inquiry || {};
  currentInquiryId = inquiry.inquiryId || currentInquiryId;
  $("adminInquiryId").textContent = inquiry.inquiryId || "";
  $("adminCreatedAt").textContent = inquiry.createdAt || "";
  $("adminMember").textContent = (inquiry.name || "") + (inquiry.memberId ? "（" + inquiry.memberId + "）" : "");
  $("adminCategory").textContent = inquiry.category || "";
  $("adminSubject").textContent = inquiry.subject || "";
  $("adminBody").textContent = inquiry.body || "";
  $("adminResponseRequested").textContent = inquiry.responseRequested ? "希望する" : "希望しない";
  if(result.officers) inquiryOfficers=result.officers;
  const assigned=$("adminAssignedTo"),selected=inquiry.assignedTo || (result.operator && result.operator.name || "");
  assigned.replaceChildren(new Option("未割当",""));
  const names=[...new Set(inquiryOfficers.map(x=>x.name))];
  for(const name of names) assigned.add(new Option(name,name));
  if(selected && !names.includes(selected)) assigned.add(new Option(selected+"（既存担当者）",selected));
  assigned.value=selected;
  $("adminMetadata").textContent=[inquiry.contactKind,inquiry.publicationScope].filter(Boolean).join(" / ")||"未記録";
  $("adminFaqSource").textContent=[inquiry.faqSearchKeyword,inquiry.sourceFaqTitle,inquiry.sourceFaqId].filter(Boolean).join(" / ")||"なし";
  $("adminFaqCandidate").classList.toggle("hidden",inquiry.category!=="質問");
  $("adminStatus").value = inquiry.status || "受付中";
  $("adminResponseText").value = inquiry.responseText || "";
  const attachment = $("adminAttachment");
  attachment.classList.toggle("hidden", !inquiry.attachmentUrl);
  if (inquiry.attachmentUrl) attachment.href = inquiry.attachmentUrl;
  $("adminStatusMessage").textContent = inquiry.responseSentAt
    ? "回答送信済み：" + inquiry.responseSentAt
    : "";
  show("inquiryAdmin");
}

async function submitInquiryAdminAction_(fn) {
  const isSend = fn === "inquiryRespond";
  const button = isSend ? $("adminSend") : $("adminSave");
  const otherButton = isSend ? $("adminSave") : $("adminSend");
  const errorBox = $("adminError");
  try {
    errorBox.textContent = "";
    $("adminStatusMessage").textContent = "";
    if (isSend && !$("adminResponseText").value.trim()) throw Error("回答文を入力してください。");
    button.disabled = true;
    otherButton.disabled = true;
    button.textContent = isSend ? "送信しています…" : "保存しています…";
    const result = await apiJson({
      api:"1", fn:fn, idToken, inquiryId:currentInquiryId,
      input:{
        assignedTo:$("adminAssignedTo").value,
        status:$("adminStatus").value,
        responseText:$("adminResponseText").value
      }
    });
    if (!result.ok) throw Error(result.error || "処理できませんでした。");
    renderInquiryAdmin_({inquiry:result.inquiry});
    $("adminStatusMessage").textContent = isSend
      ? "投稿者へ回答を送信しました。"
      : "下書きを保存しました。";
  } catch (error) {
    errorBox.textContent = error.message;
  } finally {
    button.disabled = false;
    otherButton.disabled = false;
    button.textContent = isSend ? "投稿者へ回答を送信" : "下書き保存";
  }
}

$("adminSave").onclick = () => submitInquiryAdminAction_("inquirySave");
$("adminSend").onclick = () => {
  const responseText = $("adminResponseText").value.trim();
  if (!responseText) {
    $("adminError").textContent = "回答文を入力してください。";
    return;
  }
  $("adminError").textContent = "";
  $("confirmRecipient").textContent = $("adminMember").textContent;
  $("confirmSubject").textContent = $("adminSubject").textContent;
  $("confirmResponseText").textContent = responseText;
  $("responseConfirmModal").classList.remove("hidden");
};
$("responseConfirmCancel").onclick = () => $("responseConfirmModal").classList.add("hidden");
$("responseConfirmSend").onclick = async () => {
  $("responseConfirmModal").classList.add("hidden");
  await submitInquiryAdminAction_("inquiryRespond");
};

async function api(data) {
  const body = new URLSearchParams(data);
  // Only coarse route/SDK flags are sent; diagnostics add no separate request or UI.
  if (["card", "profile", "register"].includes(launchParams.view) &&
      ["resolve", "registrationLookup", "registrationConfirm"].includes(data.action)) {
    body.set("traceBuild", "portal-20260926-prod1");
    body.set("traceView", launchParams.view);
    try {
      body.set("traceInLine", String(liff.isInClient() === true));
      body.set("traceLoggedIn", String(liff.isLoggedIn() === true));
    } catch (_) { /* Diagnostics must not block an existing request. */ }
  }
  const route = new URLSearchParams({
    action:String(data.action || ""),
    view:String(data.view || ""),
    id:String(data.id || ""),
    newsToken:String(data.newsToken || ""),
    _t:String(Date.now())
  });
  const response = await fetch(PORTAL.GAS_API_URL + "?" + route.toString(), {
    method:"POST",
    body,
    cache:"no-store",
    redirect:"follow"
  });
  if (!response.ok) throw Error("通信エラー（HTTP " + response.status + "）");
  const result = await response.json();
  if (!result || typeof result.ok !== "boolean") throw Error("本人確認結果を読み取れませんでした。");
  return result;
}

function renderNews(items) {
  show("news");
  $("newsArticle").classList.add("hidden");
  const list = $("newsList");
  list.replaceChildren();
  if (!items.length) {
    list.innerHTML = '<div class="newsItem">現在、新しいお知らせはありません。</div>';
    return;
  }
  items.forEach(item => {
    const article = document.createElement("article");
    article.className = "newsItem";
    const time = document.createElement("time");
    time.textContent = item.date || "";
    const heading = document.createElement("h2");
    heading.textContent = item.title;
    const body = document.createElement("p");
    body.textContent = item.body || "";
    article.append(time, heading, body);
    if (item.id) {
      const link = document.createElement("a");
      link.href = "?view=news&id=" + encodeURIComponent(item.id);
      link.textContent = "詳しく見る";
      article.append(link);
    }
    list.append(article);
  });
}

function renderNewsArticle(item) {
  show("news");
  $("newsList").replaceChildren();
  $("newsArticle").classList.remove("hidden");
  $("newsDate").textContent = item.date || "";
  $("newsTitle").textContent = item.title || "お知らせ";
  $("newsSummary").textContent = item.body || "";

  const Font = Quill.import("formats/font");
  Font.whitelist = ["gothic", "mincho"];
  Quill.register(Font, true);
  const Size = Quill.import("attributors/style/size");
  Size.whitelist = ["12px", "14px", "16px", "18px", "24px", "32px"];
  Quill.register(Size, true);

  const viewer = new Quill("#newsContent", {
    readOnly:true,
    modules:{ toolbar:false },
    theme:"snow"
  });
  if (item.contentDelta) {
    try {
      const delta = JSON.parse(item.contentDelta);
      if (!delta || !Array.isArray(delta.ops)) throw Error("invalid delta");
      viewer.setContents(delta);
      return;
    } catch (_) {}
  }
  viewer.setText(item.contentHtml || item.body || "");
}

let currentInquiryId = launchParams.id;
let editingFaq = {id:"",revision:0};
function configureInquiryTabs_(allowed) {
  $("inquiryTabs").classList.toggle("hidden", !allowed);
}
$("memberTab").onclick = () => show("inquiryHome");
$("manageTab").onclick = () => loadInquiryList_();
let faqContext={keyword:"",id:"",title:""};
let faqItems=[];
let inquiryOfficers=[];
const inquiryDescriptions={
  "質問":"FAQで解決しないことや、宗心会についてのご質問を事務局へお送りください。",
  "意見・連絡":"事務局へのご連絡、ご意見・ご要望はこちらからお願いします。種類を選んでお送りください。",
  "情報提供":"宗心会に関する資料・写真・情報をお寄せください。提供内容と添付資料の公開範囲を選択してください。"
};
function openInquiryForm_(label,context) {
  faqContext=context || {keyword:"",id:"",title:""};
  $("inquiryCategory").value=label==="意見・連絡" ? ($("contactKind").value==="事務局への連絡" ? "連絡" : "意見") : label;
  $("inquiryFormTitle").textContent=label;$("inquiryFormLead").textContent=inquiryDescriptions[label];
  $("contactKindField").classList.toggle("hidden",label!=="意見・連絡");
  $("contactKind").required=label==="意見・連絡";$("contactKind").disabled=label!=="意見・連絡";
  $("publicationScopeField").classList.toggle("hidden",label!=="情報提供");
  $("publicationScope").required=label==="情報提供";$("publicationScope").disabled=label!=="情報提供";
  if(context) $("inquirySubject").value=(context.keyword || context.title || "FAQについての質問").slice(0,100);
  show("inquiry");window.scrollTo(0,0);
}
$("contactKind").onchange=()=>{$("inquiryCategory").value=$("contactKind").value==="事務局への連絡" ? "連絡" : "意見";};
for (const [label,description] of [["FAQ","よくある質問・使い方"],["質問","事務局に質問する"],["意見・連絡","ご意見・事務局へのご連絡"],["情報提供","資料・写真・情報を提供する"]]) {
  const button=document.createElement("button");button.type="button";button.className="button secondaryButton entranceButton";
  const title=document.createElement("strong"),sub=document.createElement("span");title.textContent=label;sub.textContent=description;button.append(title,sub);
  button.onclick=()=>label==="FAQ" ? loadFaq_(false) : openInquiryForm_(label);
  $("inquiryEntrances").appendChild(button);
}
async function inquiryRequest_(fn, extra = {}) {
  const result = await apiJson({api:"1",fn,idToken,...extra});
  if (!result.ok) throw Error(result.error || "読み込みできませんでした。");
  return result;
}
async function loadInquiryList_() {
  show("inquiryList");$("inquiryListItems").textContent="読み込み中…";$("inquiryListError").textContent="";
  try {
    const result=await inquiryRequest_("inquiryList");
    if(visibleScreen === "inquiryList") renderInquiryList_(result);
  }
  catch(error) {$("inquiryListItems").textContent="";$("inquiryListError").textContent=error.message;}
}
function renderInquiryList_(result) {
  show("inquiryList");const list=$("inquiryListItems");list.replaceChildren();
  if (!result.inquiries.length) list.textContent="問い合わせはまだありません。";
  for (const item of result.inquiries) {
    const button=document.createElement("button");button.type="button";button.className="button secondaryButton";
    const badge=document.createElement("span"),text=document.createElement("span");
    const answered=item.status==="回答済" || item.responseSentAt;
    badge.className="statusBadge "+(answered ? "answered" : item.status==="対応中" ? "working" : item.responseRequested && item.status!=="保管" ? "needsResponse" : "");
    badge.textContent=item.status+(item.responseRequested && !answered && item.status!=="保管" ? "・要回答" : "");
    text.textContent=`${item.createdAt} / ${item.category}\n${item.subject}`;button.append(badge,text);
    button.onclick=async () => {
      button.disabled=true;
      try {
        const result=await api({action:"resolve",view:"inquiry-admin",id:item.inquiryId,idToken});
        if(visibleScreen === "inquiryList") handleResolve(result);
      }
      catch(error) {$("inquiryListError").textContent=error.message;}
      finally {button.disabled=false;}
    };list.appendChild(button);
  }
}
async function loadFaq_(manage) {
  const screen=manage ? "faqManage" : "inquiryFaq";
  show(screen);const list=$(manage ? "faqManageItems" : "faqItems");list.textContent="読み込み中…";
  if(manage) {resetFaq_();$("faqManageError").textContent="";}
  try {
    const result=await inquiryRequest_("faqList",{manage});
    if(visibleScreen!==screen) return;
    if(!manage) {faqItems=result.items;renderMemberFaq_();return;}
    list.replaceChildren();
    if(!result.items.length) list.textContent="FAQはまだ登録されていません。";
    for(const item of result.items) {
      const button=document.createElement("button");button.type="button";button.className="button secondaryButton";
      button.textContent=(item.published ? "公開中" : item.state==="candidate" ? "候補" : "下書き")+" / "+item.category+"："+item.question;
      button.onclick=()=>{editingFaq={id:item.id,revision:item.revision};$("faqQuestion").value=item.question;$("faqAnswer").value=item.answer;$("faqCategory").value=item.category;$("faqKeywords").value=item.keywords;$("faqPublished").checked=item.published;$("faqEditForm").scrollIntoView({behavior:"smooth"});};list.appendChild(button);
    }
  } catch(error) {if(visibleScreen===screen) list.textContent=error.message;}
}
function normalizeFaqSearch_(text) {return String(text||"").normalize("NFKC").toLocaleLowerCase("ja");}
function renderMemberFaq_() {
  const list=$("faqItems"),keyword=$("faqSearch").value.trim();list.replaceChildren();
  const terms=normalizeFaqSearch_(keyword).split(/\s+/).filter(Boolean);
  const matches=faqItems.filter(item=>terms.every(term=>normalizeFaqSearch_([item.category,item.question,item.answer,item.keywords].join(" ")).includes(term)));
  $("faqSearchCount").textContent=matches.length+"件";
  if(!matches.length) {const p=document.createElement("p");p.textContent="該当するFAQがありません。質問から事務局へお問い合わせください。";const button=document.createElement("button");button.type="button";button.className="button";button.textContent="質問する";button.onclick=()=>openInquiryForm_("質問",{keyword,id:"",title:""});list.append(p,button);return;}
  const groups=new Map();for(const item of matches) {const category=item.category||"その他";if(!groups.has(category)) groups.set(category,[]);groups.get(category).push(item);}
  for(const [category,items] of groups) {
    const heading=document.createElement("h2");heading.textContent=category;list.appendChild(heading);
    for(const item of items) {
      const details=document.createElement("details"),summary=document.createElement("summary"),answer=document.createElement("p"),choices=document.createElement("fieldset"),legend=document.createElement("legend");
      summary.textContent=item.question;answer.textContent=item.answer;answer.style.whiteSpace="pre-wrap";legend.textContent="解決しましたか？";choices.appendChild(legend);
      const ask=document.createElement("button");ask.type="button";ask.className="button hidden";ask.textContent="解決しないので質問する";
      ask.onclick=()=>openInquiryForm_("質問",{keyword:$("faqSearch").value.trim(),id:item.id,title:item.question});
      for(const [value,label] of [["yes","解決した"],["no","解決しない"]]) {
        const row=document.createElement("label"),radio=document.createElement("input");row.className="radioLabel";radio.type="radio";radio.name="faq-resolution-"+item.id;radio.value=value;radio.onchange=()=>ask.classList.toggle("hidden",value!=="no");row.append(radio,document.createTextNode(label));choices.appendChild(row);
      }
      details.append(summary,answer,choices,ask);list.appendChild(details);
    }
  }
}
$("faqSearch").oninput=renderMemberFaq_;
$("adminFaqCandidate").onclick=async()=>{
  const button=$("adminFaqCandidate");button.disabled=true;$("adminError").textContent="";
  try {const result=await inquiryRequest_("faqCandidate",{inquiryId:currentInquiryId,input:{responseText:$("adminResponseText").value}});$("adminStatusMessage").textContent=result.alreadyExists ? "この質問のFAQ候補は登録済みです。FAQ管理で確認してください。" : "非公開のFAQ候補を登録しました。FAQ管理で内容を整えてから公開してください。";}
  catch(error) {$("adminError").textContent=error.message;}
  finally {button.disabled=false;}
};
function resetFaq_(){editingFaq={id:"",revision:0};$("faqEditForm").reset();}
$("faqManageButton").onclick=()=>loadFaq_(true);
$("newFaq").onclick=resetFaq_;
$("faqEditForm").onsubmit=async event=>{
  event.preventDefault();const button=$("faqSaveButton");button.disabled=true;$("faqManageError").textContent="";
  try {
    await inquiryRequest_("faqSave",{input:{...editingFaq,question:$("faqQuestion").value,answer:$("faqAnswer").value,category:$("faqCategory").value,keywords:$("faqKeywords").value,published:$("faqPublished").checked}});
    await loadFaq_(true);
  } catch(error) {$("faqManageError").textContent=error.message;}
  finally {button.disabled=false;}
};

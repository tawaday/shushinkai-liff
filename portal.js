const PORTAL = {
  LIFF_ID: "2010887632-4M5XI8d7",
  GAS_API_URL: "https://script.google.com/macros/s/AKfycbwNCQUmgSBUHWp1uaUskloNa2vMbdmiFNN0bfhWrqWZGriaCOdKB13hFcFMDUfINIQ/exec"
};

let idToken = "";
let confirmationToken = "";
const $ = id => document.getElementById(id);
const screenIds = ["loading", "message", "registered", "register", "confirm", "inquiry", "inquiryComplete", "inquiryAdmin", "news"];
const show = id => screenIds.forEach(x => $(x).classList.toggle("hidden", x !== id));

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
    election: params.get("election") || nested.get("election") || saved.election || "chairman_2026",
    id: params.get("id") || nested.get("id") || saved.id || "",
    newsToken: params.get("nt") || nested.get("nt") || saved.newsToken || ""
  };
})();

document.addEventListener("DOMContentLoaded", start);

async function start() {
  try {
    if (launchParams.view === "news" && launchParams.id && launchParams.newsToken) {
      const result = await api({
        action:"resolve", view:"news", id:launchParams.id, newsToken:launchParams.newsToken
      });
      if (result.ok) {
        handleResolve(result);
        return;
      }
    }
    await liff.init({ liffId:PORTAL.LIFF_ID, withLoginOnExternalBrowser:true });
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
    location.replace("election.html?election=" + encodeURIComponent(launchParams.election));
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
    show("inquiry");
    return;
  }
  if (result.view === "inquiryAdmin") {
    renderInquiryAdmin_(result);
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
      renderRegistered(result);
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
    renderRegistered(result);
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
        subject:$("inquirySubject").value,
        body:$("inquiryBody").value,
        responseRequested:responseChoice && responseChoice.value === "true",
        attachment:attachment
      }
    });
    if (!result.ok) throw Error(result.error || "送信できませんでした。");
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
  $("adminInquiryId").textContent = inquiry.inquiryId || "";
  $("adminCreatedAt").textContent = inquiry.createdAt || "";
  $("adminMember").textContent = (inquiry.name || "") + (inquiry.memberId ? "（" + inquiry.memberId + "）" : "");
  $("adminCategory").textContent = inquiry.category || "";
  $("adminSubject").textContent = inquiry.subject || "";
  $("adminBody").textContent = inquiry.body || "";
  $("adminResponseRequested").textContent = inquiry.responseRequested ? "希望する" : "希望しない";
  $("adminAssignedTo").value = inquiry.assignedTo || (result.operator && result.operator.name || "");
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
      api:"1", fn:fn, idToken, inquiryId:launchParams.id,
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

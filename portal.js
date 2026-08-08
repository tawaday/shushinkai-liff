const PORTAL = {
  LIFF_ID: "2010887632-4M5XI8d7",
  GAS_API_URL: "https://script.google.com/macros/s/AKfycbwNCQUmgSBUHWp1uaUskloNa2vMbdmiFNN0bfhWrqWZGriaCOdKB13hFcFMDUfINIQ/exec"
};

let idToken = "";
let confirmationToken = "";
const $ = id => document.getElementById(id);
const screenIds = ["loading", "message", "registered", "register", "confirm", "news"];
const show = id => screenIds.forEach(x => $(x).classList.toggle("hidden", x !== id));

const launchParams = (() => {
  const params = new URLSearchParams(location.search);
  const state = params.get("liff.state") || "";
  const query = state.includes("?")
    ? state.slice(state.indexOf("?") + 1)
    : state.replace(/^[?#]/, "");
  const nested = new URLSearchParams(query);
  return {
    view: params.get("view") || nested.get("view") || "home",
    election: params.get("election") || nested.get("election") || "chairman_2026"
  };
})();

document.addEventListener("DOMContentLoaded", start);

async function start() {
  try {
    await liff.init({ liffId:PORTAL.LIFF_ID, withLoginOnExternalBrowser:true });
    if (!liff.isLoggedIn()) {
      liff.login({ redirectUri:location.href });
      return;
    }
    if (isIdTokenExpired_()) {
      restartLineLogin_();
      return;
    }
    idToken = liff.getIDToken() || "";
    if (!idToken) throw Error("LINE認証情報を取得できませんでした。");
    const result = await api({ action:"resolve", view:launchParams.view, idToken });
    if (!result.ok && /(?:IdToken\s+expired|token.*expired|期限切れ)/i.test(String(result.error || ""))) {
      restartLineLogin_();
      return;
    }
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
  try { liff.logout(); } catch (_) {}
  liff.login({ redirectUri:location.href });
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
    renderNews(result.announcements || []);
    return;
  }
  if (result.view === "contactSent") {
    message("メニューを送りました", "宗心会公式LINEの個別トークに、お問い合わせメニューを送りました。LINEへ戻ってご確認ください。");
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

async function api(data) {
  const body = new URLSearchParams(data);
  const route = new URLSearchParams({
    action:String(data.action || ""),
    view:String(data.view || ""),
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
    if (item.url) {
      const link = document.createElement("a");
      link.href = item.url;
      link.textContent = "詳しく見る";
      article.append(link);
    }
    list.append(article);
  });
}

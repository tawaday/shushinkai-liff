/** 宗心会6分割リッチメニュー用 共通LIFF認証API */
const PORTAL_CONFIG = {
  LINE_LOGIN_CHANNEL_ID: "2010887632",
  VERIFY_URL: "https://api.line.me/oauth2/v2.1/verify",
  ELECTION_LIFF_URL: "https://liff.line.me/2010887632-4M5XI8d7?view=vote&election=chairman_2026",
  ELECTION_ADMIN_URL: "https://liff.line.me/2010887632-4M5XI8d7?view=election-admin",
  PAYMENT_LIFF_URL: "https://liff.line.me/2010887632-4M5XI8d7?view=payment",
  RECEPTION_LIFF_URL: "https://liff.line.me/2010887632-4M5XI8d7?view=reception",
  REMINDER_LIFF_URL: "https://liff.line.me/2010887632-4M5XI8d7?view=reminder",
  ELECTION_ADMIN_WEBAPP_URL: "https://script.google.com/macros/s/AKfycbzD4j_-vMUuNy06uhyaMwC8_PZBo4AR8E1WIMvOQClzBls3jofLUmj46JAWAhCYmW4k/exec",
  NEWS_EDITOR_LIFF_URL: "https://liff.line.me/2010887632-4M5XI8d7?view=news-admin",
  // GASはファイル順が保証されないため、トップレベル初期化でCONFIGを参照しない。
  REGISTRATION_FALLBACK_URL: "https://docs.google.com/forms/d/e/1FAIpQLScUxzTBnNRn5Cw71Vs5mLF_WxRuS-igZZWgTCcQO6Q5raWX9A/viewform",
  ANNOUNCEMENT_SHEET: "announcements",
  REGISTRATION_TOKEN_TTL: 600,
  ELECTION_ADMIN_TICKET_TTL: 180,
  ELECTION_ADMIN_SIGNING_SECRET_PROPERTY: "ELECTION_ADMIN_SIGNING_SECRET"
};

function handlePortalApi_(e) {
  try {
    const action = String(e.parameter.action || "").trim();
    if (action === "electionIdentityLink") return portalJson_(linkElectionIdentity_(e.parameter));
    if (action === "resolve") return portalTraceJson_(resolvePortalDestination_(e.parameter), e.parameter);
    if (action === "registrationLookup") return portalTraceJson_(portalRegistrationLookup_(e.parameter), e.parameter);
    if (action === "registrationConfirm") return portalTraceJson_(portalRegistrationConfirm_(e.parameter), e.parameter);
    return portalJson_({ ok:false, error:"actionが不正です。" });
  } catch (error) {
    return portalTraceJson_({ ok:false, error:error && error.message ? error.message : String(error) }, e && e.parameter);
  }
}

function portalJson_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function verifyPortalIdToken_(idToken) {
  const token = String(idToken || "").trim();
  if (!token) return { ok:false, error:"LINE認証情報がありません。" };
  const response = UrlFetchApp.fetch(PORTAL_CONFIG.VERIFY_URL, {
    method:"post",
    payload:{ id_token:token, client_id:PORTAL_CONFIG.LINE_LOGIN_CHANNEL_ID },
    muteHttpExceptions:true
  });
  let data = {};
  try { data = JSON.parse(response.getContentText()); } catch (_) {}
  if (response.getResponseCode() !== 200 || !data.sub) {
    return { ok:false, error:data.error_description || "LINE認証に失敗しました。" };
  }
  return { ok:true, lineUserId:String(data.sub), displayName:String(data.name || "") };
}

function authenticatePortalMember_(idToken) {
  const line = verifyPortalIdToken_(idToken);
  if (!line.ok) return line;
  const link = findUserLinkByUserId_(line.lineUserId);
  if (!link || !link.id) return { ok:false, notLinked:true, lineUserId:line.lineUserId, displayName:line.displayName };
  const member = portalMemberSummary_(link.id);
  // LINE本人確認は、検証済みuserIdとuser_linkの一致で成立する。
  // 名簿詳細に一時的な不整合があっても一般会員向け画面は止めない。
  if (!member.ok) {
    console.warn("portalMemberSummary fallback", member.error || "unknown", link.id);
    return {
      ok:true,
      lineUserId:line.lineUserId,
      displayName:line.displayName,
      memberId:canonId_(link.id),
      memberName:String(link.name || line.displayName || "会員"),
      registeredAt:formatPortalRegistrationDate_(link.ts),
      role:ROLE.USER,
      electionRole:CONFIG.ELECTION_ROLE.NONE,
      memberSummaryWarning:true
    };
  }
  return Object.assign({
    ok:true,
    lineUserId:line.lineUserId,
    displayName:line.displayName,
    registeredAt:formatPortalRegistrationDate_(link.ts)
  }, member);
}

function portalMemberSummary_(memberId) {
  const sh = getSheet_();
  const headers = sheetHeaders_();
  const row = findRowById_(canonId_(memberId));
  if (row < 0) return { ok:false, error:"会員情報が見つかりません。" };
  const values = sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0];
  const get = name => { const i = headers.indexOf(name); return i >= 0 ? values[i] : ""; };
  const role = String(get("role") || ROLE.USER).trim() || ROLE.USER;
  return {
    ok:true,
    memberId:canonId_(memberId), role:role,
    electionRole:String(get("election_role") || CONFIG.ELECTION_ROLE.NONE),
    memberName:String(get("姓") || "") + " " + String(get("名") || "")
  };
}

function resolvePortalDestination_(params) {
  const view = String(params.view || "home").trim();
  const announcementId = String(params.id || "").trim();
  const newsToken = String(params.newsToken || "").trim();
  const electionAdminTicket = String(params.ticket || "").trim();
  // 選挙管理GASだけが、LIFF認証後に発行した一回限りの引換券を使用する。
  if (view === "election-admin-redeem") {
    return redeemElectionAdminTicket_(electionAdminTicket);
  }
  if (view === "news" && announcementId && newsToken) {
    if (!verifyAnnouncementViewToken_(newsToken, announcementId)) {
      return { ok:false, error:"お知らせのリンクの有効期限が切れています。LINEで「お知らせ」を開き直してください。" };
    }
    const announcement = getPortalAnnouncement_(announcementId);
    return announcement
      ? { ok:true, registered:true, view:"news", announcement:announcement }
      : { ok:false, error:"お知らせが見つからないか、現在は公開されていません。" };
  }
  const auth = authenticatePortalMember_(params.idToken);
  if (!auth.ok) {
    if (view === "register" || auth.notLinked) {
      return { ok:true, registered:false, view:"register", fallbackUrl:PORTAL_CONFIG.REGISTRATION_FALLBACK_URL };
    }
    return auth;
  }

  if (view === "register") {
    return {
      ok:true,
      registered:true,
      view:"alreadyRegistered",
      memberId:auth.memberId,
      memberName:auth.memberName,
      registeredAt:auth.registeredAt
    };
  }
  if (view === "profile") return { ok:true, registered:true, redirectUrl:portalProfileUrl_(auth.lineUserId) };
  if (view === "payment") {
    if (!canOpenPayment_(auth.role)) {
      return { ok:false, error:"会計一覧を開く権限がありません。" };
    }
    return { ok:true, registered:true, redirectUrl:portalPaymentUrl_(auth.lineUserId) };
  }
  if (view === "reception") {
    if (!canOpenReception_(auth.role)) {
      return { ok:false, error:"QR受付を開く権限がありません。" };
    }
    return { ok:true, registered:true, redirectUrl:portalReceptionUrl_() };
  }
  if (view === "reminder") {
    if (!canOpenReminder_(auth.role)) {
      return { ok:false, error:"リマインド管理を開く権限がありません。" };
    }
    return { ok:true, registered:true, redirectUrl:portalReminderUrl_() };
  }
  if (view === "profile-news" || view === "news-admin") {
    if (!isAdmin_({ role:auth.role }) && !isOrganizer_({ role:auth.role })) {
      return { ok:false, error:"お知らせを編集する権限がありません。" };
    }
    return { ok:true, registered:true, redirectUrl:portalNewsEditorUrl_(auth.lineUserId) };
  }
  if (view === "election-admin") {
    if (!isElectionManager_({ election_role:auth.electionRole })) {
      return { ok:false, error:"選挙管理画面を開く権限がありません。" };
    }
    return {
      ok:true,
      registered:true,
      redirectUrl:issueElectionAdminUrl_(auth)
    };
  }
  if (view === "card") return { ok:true, registered:true, redirectUrl:getMemberCardUrl_(auth.lineUserId) };
  if (view === "vote") return { ok:true, registered:true, view:"vote" };
  if (view === "news") {
    if (announcementId) {
      const announcement = getPortalAnnouncement_(announcementId);
      return announcement
        ? { ok:true, registered:true, view:"news", announcement:announcement }
        : { ok:false, error:"お知らせが見つからないか、現在は公開されていません。" };
    }
    return { ok:true, registered:true, view:"news", announcements:getPortalAnnouncements_() };
  }
  if (view === "contact" || view === "inquiry") {
    return {
      ok:true, registered:true, view:"inquiry",
      memberId:auth.memberId, memberName:auth.memberName,
      canManage:isAdmin_({role:auth.role}) || isOrganizer_({role:auth.role})
    };
  }
  if (view === "inquiry-admin") {
    return announcementId ? getInquiryDetail_(params.idToken, announcementId) : listInquiries_(params.idToken);
  }
  return { ok:true, registered:true, view:"home", memberName:auth.memberName };
}

function portalProfileUrl_(lineUserId, section) {
  const id = getIdByUserId_(lineUserId);
  let url = CONFIG.FORM_URL + "?lt=" + encodeURIComponent(issueLt_(lineUserId));
  if (id) url += "&prefill=" + encodeURIComponent(id);
  if (section) url += "&section=" + encodeURIComponent(section);
  return url;
}

function portalPaymentUrl_(lineUserId) {
  return getPaymentPageUrl_({ source:{ userId:String(lineUserId || "") } });
}

function portalReceptionUrl_() {
  return getReceptionPageUrl_() + "&openExternalBrowser=1";
}

function portalReminderUrl_() {
  return getReminderPageUrl_();
}

function portalNewsEditorUrl_(lineUserId) {
  return CONFIG.FORM_URL
    + "?page=news-editor&lt=" + encodeURIComponent(issueLt_(lineUserId, 60 * 60));
}

function portalGroupAnnouncementUrl_(lineUserId) {
  return CONFIG.FORM_URL
    + "?page=group-announcement&lt=" + encodeURIComponent(issueLt_(lineUserId, 60 * 60));
}

/**
 * LIFFで本人・選管権限を確認した会員に、短時間だけ有効な署名付き引換券を発行する。
 * 選挙管理GASは同じ共有鍵で署名を検証するため、Googleの外部通信権限を必要としない。
 */
function issueElectionAdminUrl_(auth) {
  const secret = electionAdminSigningSecret_();
  const now = Date.now();
  const payload = {
    memberId:canonId_(auth.memberId),
    lineUserId:String(auth.lineUserId || ""),
    electionRole:String(auth.electionRole || CONFIG.ELECTION_ROLE.NONE),
    issuedAt:now,
    expiresAt:now + PORTAL_CONFIG.ELECTION_ADMIN_TICKET_TTL * 1000,
    nonce:Utilities.getUuid().replace(/-/g, "")
  };
  const encoded = Utilities.base64EncodeWebSafe(
    Utilities.newBlob(JSON.stringify(payload)).getBytes()
  ).replace(/=+$/g, "");
  const signature = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(encoded, secret)
  ).replace(/=+$/g, "");
  const ticket = encoded + "." + signature;
  return PORTAL_CONFIG.ELECTION_ADMIN_WEBAPP_URL
    + "?page=settings&ticket=" + encodeURIComponent(ticket);
}

function electionAdminSigningSecret_() {
  const secret = String(
    PropertiesService.getScriptProperties().getProperty(
      PORTAL_CONFIG.ELECTION_ADMIN_SIGNING_SECRET_PROPERTY
    ) || ""
  ).trim();
  if (secret.length < 32) {
    throw new Error("選挙管理の署名設定がありません。管理者へご連絡ください。");
  }
  return secret;
}

/** 選挙管理GASから届いた引換券を一度だけ検証し、最新の選管権限を返す。 */
function redeemElectionAdminTicket_(ticket) {
  const code = String(ticket || "").trim();
  if (!/^[0-9a-f]{32}$/i.test(code)) {
    return { ok:false, error:"選挙管理の認証情報がありません。LINEから開き直してください。" };
  }
  const cache = CacheService.getScriptCache();
  const key = "portal-election-admin:" + code;
  const raw = cache.get(key);
  if (!raw) {
    return { ok:false, error:"選挙管理の認証期限が切れました。LINEから開き直してください。" };
  }
  // 同じURLを転送・再利用できないよう、取得直後に失効させる。
  cache.remove(key);

  let issued;
  try { issued = JSON.parse(raw); } catch (_) { issued = null; }
  if (!issued || !issued.memberId || !issued.lineUserId) {
    return { ok:false, error:"選挙管理の認証情報を確認できません。" };
  }
  const link = findUserLinkByUserId_(String(issued.lineUserId));
  if (!link || canonId_(link.id) !== canonId_(issued.memberId)) {
    return { ok:false, error:"LINE連携情報を確認できません。" };
  }
  const member = portalMemberSummary_(issued.memberId);
  if (!member.ok || !isElectionManager_({ election_role:member.electionRole })) {
    return { ok:false, error:"選挙管理画面を開く権限がありません。" };
  }
  return {
    ok:true,
    memberId:canonId_(issued.memberId),
    electionRole:String(member.electionRole)
  };
}

function getPortalAnnouncements_() {
  return readAnnouncements_()
    .filter(function(item) { return item && item.published !== false; })
    .sort(compareAnnouncements_)
    .slice(0, 20)
    .map(function(item) {
      return {
        id:item.id,
        date:item.date,
        title:item.title,
        body:item.body
      };
    });
}

function getPortalAnnouncement_(announcementId) {
  const id = String(announcementId || "").trim();
  if (!id) return null;
  const item = readAnnouncements_().find(function(current) {
    return current && current.published !== false && String(current.id || "") === id;
  });
  if (!item) return null;
  return {
    id:item.id,
    date:item.date,
    title:item.title,
    body:item.body,
    contentDelta:item.contentDelta || "",
    contentHtml:item.contentHtml || ""
  };
}

function pushContactMenu_(lineUserId, role, electionRole) {
  const flex = buildContactFlex_(role, electionRole, lineUserId);
  const response = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
    method:"post", contentType:"application/json",
    headers:{ Authorization:"Bearer " + getLineAccessToken_() },
    payload:JSON.stringify({ to:lineUserId, messages:[{ type:"flex", altText:"宗心会 お問い合わせメニュー", contents:flex }] }),
    muteHttpExceptions:true
  });
  if (response.getResponseCode() >= 300) throw new Error("問い合わせメニューを送信できませんでした。");
}

function portalRegistrationLookup_(params) {
  const line = verifyPortalIdToken_(params.idToken);
  if (!line.ok) return line;
  const existing = findUserLinkByUserId_(line.lineUserId);
  if (existing && existing.id) {
    return {
      ok:true,
      alreadyRegistered:true,
      memberId:canonId_(existing.id),
      memberName:String(existing.name || line.displayName || "会員"),
      registeredAt:formatPortalRegistrationDate_(existing.ts)
    };
  }
  if (!withUserLinkLock_(function() { return consumeElectionLinkAttempt_(line.lineUserId); })) {
    return {ok:false,rateLimited:true,error:"確認回数の上限に達しました。15分ほど待ってから再度お試しください。"};
  }
  const name = electionIdentityName_(params.name);
  const term = electionIdentityTerm_(params.clubTerm);
  const birth = electionIdentityDate_(params.birthDate, SpreadsheetApp.openById(SPREADSHEET_ID).getSpreadsheetTimeZone());
  if (!name || !term || !birth) return { ok:false, error:"氏名・部内期数・生年月日を入力してください。" };
  const matches = findPortalRegistrationMatches_(name, term, birth);
  if (matches.length !== 1) return { ok:false, error:"本人確認できませんでした。入力内容をご確認ください。" };
  if (findUserLinkById_(matches[0].id)) return { ok:false, error:"この会員IDは別のLINEアカウントと連携済みです。事務局へお問い合わせください。" };
  const key = Utilities.getUuid();
  CacheService.getScriptCache().put("portal-register:" + key, JSON.stringify({ id:matches[0].id, lineUserId:line.lineUserId, name:matches[0].name }), PORTAL_CONFIG.REGISTRATION_TOKEN_TTL);
  return { ok:true, confirmationToken:key, member:{ name:matches[0].name, clubTerm:matches[0].clubTerm } };
}

function portalRegistrationConfirm_(params) {
  const line = verifyPortalIdToken_(params.idToken);
  if (!line.ok) return line;
  const cache = CacheService.getScriptCache();
  const key = "portal-register:" + String(params.confirmationToken || "");
  const raw = cache.get(key);
  if (!raw) return { ok:false, error:"確認の有効時間が切れました。もう一度照合してください。" };
  const data = JSON.parse(raw);
  if (data.lineUserId !== line.lineUserId) return { ok:false, error:"LINE認証が一致しません。" };
  return withUserLinkLock_(function() {
    if (findUserLinkByUserId_(line.lineUserId) || findUserLinkById_(data.id)) return { ok:false, error:"すでに連携されています。" };
    upsertUserLink_(data.id, line.lineUserId, "", "", data.name, "liff_self_registration");
    setRegistered_(line.lineUserId, data.id, data.name);
    cache.remove(key);
    return {
      ok:true,
      memberId:canonId_(data.id),
      memberName:data.name,
      registeredAt:formatPortalRegistrationDate_(new Date())
    };
  });
}

function findPortalRegistrationMatches_(name, clubTerm, birthDate) {
  const sh = getSheet_(), headers = sheetHeaders_();
  if (sh.getLastRow() <= HEADER_ROW) return [];
  const timezone = SpreadsheetApp.openById(SPREADSHEET_ID).getSpreadsheetTimeZone();
  const values = sh.getRange(HEADER_ROW + 1, 1, Math.max(0, sh.getLastRow() - HEADER_ROW), sh.getLastColumn()).getValues();
  const ix = n => headers.indexOf(n);
  return values.map(r => ({
    id:canonId_(r[ix("ID")]), name:String(r[ix("姓")] || "") + " " + String(r[ix("名")] || ""),
    clubTerm:electionIdentityTerm_(r[ix("部内期数")]), birthDate:electionIdentityDate_(r[ix("生年月日")], timezone),
    active:String(r[ix("active_status")] || "active").toLowerCase()
  })).filter(x => x.id && electionIdentityName_(x.name) === name && x.clubTerm === clubTerm && x.birthDate === birthDate && !["withdrawn","deceased","inactive"].includes(x.active));
}

function normalizePortalDate_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value)) return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  const m = String(value || "").trim().replace(/[.\/]/g,"-").match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  return m ? m[1] + "-" + ("0"+m[2]).slice(-2) + "-" + ("0"+m[3]).slice(-2) : "";
}

function formatPortalRegistrationDate_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value)) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy年M月d日");
  }
  return String(value || "").trim();
}

  // ===================================================
  // 宗心会 電子投票 クライアント Ver.1.1
  // ===================================================

  const ELECTION_CLIENT_CONFIG = {
    DEFAULT_ELECTION_ID: "chairman_2026",
    LIFF_ID: "2010887632-4M5XI8d7",
    LIFF_URL: "https://liff.line.me/2010887632-4M5XI8d7",
    GAS_API_URL: "https://script.google.com/macros/s/AKfycbyYfVwfTY6p-2O0jBhWEeUVGLYtihMuSB0EdmO1bIByEK_hgh0fSb4IDBkJ151SElc/exec"
  };

  const ELECTION_VIEW = {
    LOADING: "loadingView",
    BEFORE: "beforeView",
    VOTE: "voteView",
    CONFIRM: "confirmView",
    SENDING: "sendingView",
    COMPLETE: "completeView",
    ALREADY: "alreadyVotedView",
    CLOSED: "closedView",
    INELIGIBLE: "ineligibleView",
    ERROR: "errorView"
  };


  let currentElectionId = "";
  let currentElection = null;
  let currentOptions = [];
  let currentConfidenceCandidate = null;
  let currentWithdrawnCandidates = [];
  let selectedOptionId = "";
  let currentIdToken = "";
  let isAuthenticating = false;
  let shouldOpenLiffOnRetry = false;
  let pageStateRequestTimer = null;

  document.addEventListener(
    "DOMContentLoaded",
    initializeElectionPage
  );


  // ===================================================
  // 初期表示
  // ===================================================

  function initializeElectionPage() {
    currentElectionId =
      getElectionIdFromUrl_() ||
      ELECTION_CLIENT_CONFIG.DEFAULT_ELECTION_ID;

    currentIdToken = "";
    initializeLiffAuthentication_();
  }


  function getElectionIdFromUrl_() {
    const injectedElectionId = String(
      window.INITIAL_ELECTION_ID || ""
    ).trim();

    if (injectedElectionId) {
      return injectedElectionId;
    }

    const params =
      new URLSearchParams(window.location.search);

    return String(
      params.get("election") || ""
    ).trim();
  }


  // ===================================================
  // ページ状態読込
  // ===================================================

  function loadElectionPageState() {
    showView_(ELECTION_VIEW.LOADING);

    if (pageStateRequestTimer) {
      clearTimeout(pageStateRequestTimer);
    }

    pageStateRequestTimer = setTimeout(function() {
      pageStateRequestTimer = null;
      showError_(
        "選挙情報の読み込みに時間がかかっています。通信状態を確認して、再読み込みしてください。"
      );
    }, 20000);

    const params = {
      electionId: currentElectionId,
      idToken: currentIdToken
    };

    callElectionApi_("getPageState", params)
      .then(handlePageStateLoaded_)
      .catch(handleServerFailure_);
  }


  function handlePageStateLoaded_(response) {
    if (pageStateRequestTimer) {
      clearTimeout(pageStateRequestTimer);
      pageStateRequestTimer = null;
    }

    if (!response || response.ok !== true) {
      if (
        response &&
        response.authenticationError === true
      ) {
        initializeLiffAuthentication_();
        return;
      }

      showError_(
        response && response.error
          ? response.error
          : "選挙情報を読み込めませんでした。"
      );
      return;
    }

    const data =
      response.electionData || {};

    currentElection =
      data.election || {};

    currentOptions =
      data.options || [];

    currentConfidenceCandidate =
      data.confidenceCandidate || null;
    currentWithdrawnCandidates = data.withdrawnCandidates || [];

    selectedOptionId = "";

    switch (response.state) {
      case "before":
        renderBeforeView_();
        showView_(ELECTION_VIEW.BEFORE);
        break;

      case "closed":
        renderClosedView_();
        showView_(ELECTION_VIEW.CLOSED);
        break;

      case "already":
        showView_(ELECTION_VIEW.ALREADY);
        break;

      case "ineligible":
        setText_(
          "ineligibleReason",
          response.ineligibleReason ||
            "現在の会員情報では投票できません。"
        );
        showView_(ELECTION_VIEW.INELIGIBLE);
        break;

      case "open":
        if (!currentOptions.length) {
          showError_(
            "投票の選択肢が登録されていません。"
          );
          return;
        }

        renderElection_();
        showView_(ELECTION_VIEW.VOTE);
        break;

      default:
        showError_(
          "選挙の状態を確認できませんでした。"
        );
    }

    window.scrollTo(0, 0);
  }


  // ===================================================
  // LIFF認証
  // ===================================================

  async function initializeLiffAuthentication_() {
    if (isAuthenticating) return;
    isAuthenticating = true;
    shouldOpenLiffOnRetry = false;
    showView_(ELECTION_VIEW.LOADING);

    try {
      if (typeof liff === "undefined") {
        throw new Error("LIFF SDKを読み込めませんでした。");
      }

      await liff.init({
        liffId: ELECTION_CLIENT_CONFIG.LIFF_ID,
        withLoginOnExternalBrowser: true
      });

      currentElectionId =
        getElectionIdFromUrl_() ||
        currentElectionId ||
        ELECTION_CLIENT_CONFIG.DEFAULT_ELECTION_ID;

      if (!liff.isLoggedIn()) {
        liff.login();
        return;
      }

      currentIdToken = String(
        liff.getIDToken() || ""
      ).trim();

      if (!currentIdToken) {
        shouldOpenLiffOnRetry = true;
        showAuthenticationError_(
          "LINEの認証情報を取得できませんでした。LINEの投票リンクから開き直してください。"
        );
        return;
      }

      loadElectionPageState();

    } catch (error) {
      console.error("LIFF初期化エラー:", error);
      shouldOpenLiffOnRetry = true;
      showAuthenticationError_(
        "LINE認証を開始できませんでした。LINEの投票リンクから開き直してください。"
      );
    } finally {
      isAuthenticating = false;
    }
  }

  function buildLiffElectionUrl_() {
    return ELECTION_CLIENT_CONFIG.LIFF_URL +
      "?election=" + encodeURIComponent(currentElectionId);
  }

  function showAuthenticationError_(message) {
    setText_("errorMessage", message);
    const button = document.getElementById("errorRetryButton");
    if (button) button.textContent = "LINEで開き直す";
    showView_(ELECTION_VIEW.ERROR);
    window.scrollTo(0, 0);
  }

  function reloadElection() {
    const button = document.getElementById("errorRetryButton");
    if (button) button.textContent = "再読み込み";

    if (shouldOpenLiffOnRetry) {
      const liffUrl = buildLiffElectionUrl_();
      try {
        window.top.location.href = liffUrl;
      } catch (error) {
        window.location.href = liffUrl;
      }
      return;
    }

    currentIdToken = "";
    initializeElectionPage();
  }


  // ===================================================
  // 開始前・終了画面
  // ===================================================

  function renderBeforeView_() {
    const startAt =
      String(
        currentElection.startAt || ""
      ).trim();

    const endAt =
      String(
        currentElection.endAt || ""
      ).trim();

    if (startAt) {
      setText_(
        "beforeMessage",
        startAt +
          "より投票を開始します。"
      );
    } else {
      setText_(
        "beforeMessage",
        "投票開始までお待ちください。"
      );
    }

    renderStatePeriod_(
      "beforePeriodBox",
      "beforePeriodText",
      startAt,
      endAt
    );
    renderWithdrawnCandidates_("beforeWithdrawnCandidates");
  }


  function renderClosedView_() {
    setText_(
      "closedMessage",
      "投票へのご協力ありがとうございました。"
    );

    renderStatePeriod_(
      "closedPeriodBox",
      "closedPeriodText",
      String(
        currentElection.startAt || ""
      ).trim(),
      String(
        currentElection.endAt || ""
      ).trim()
    );
  }


  function renderStatePeriod_(
    boxId,
    textId,
    startAt,
    endAt
  ) {
    const box =
      document.getElementById(boxId);

    if (!startAt && !endAt) {
      box.classList.add("hidden");
      return;
    }

    let text = "";

    if (startAt && endAt) {
      text = startAt + " ～ " + endAt;
    } else if (startAt) {
      text = startAt + " から";
    } else {
      text = endAt + " まで";
    }

    setText_(textId, text);
    box.classList.remove("hidden");
  }


  // ===================================================
  // 投票画面
  // ===================================================

  function renderElection_() {
    setText_(
      "electionTitle",
      currentElection.title ||
        "電子投票"
    );

    setText_(
      "electionDescription",
      currentElection.description || ""
    );

    renderElectionPeriod_();
    renderResultRule_();
    renderStatusBadge_();
    renderConfidenceCandidate_();
    renderOptions_();
    renderWithdrawnCandidates_("voteWithdrawnCandidates");

    const confirmButton =
      document.getElementById(
        "confirmButton"
      );

    confirmButton.disabled = true;
  }


  function renderElectionPeriod_() {
    const box =
      document.getElementById(
        "electionPeriod"
      );

    const startAt =
      String(
        currentElection.startAt || ""
      ).trim();

    const endAt =
      String(
        currentElection.endAt || ""
      ).trim();

    if (!startAt && !endAt) {
      box.classList.add("hidden");
      return;
    }

    let text = "";

    if (startAt && endAt) {
      text = startAt + " ～ " + endAt;
    } else if (startAt) {
      text = startAt + " から";
    } else {
      text = endAt + " まで";
    }

    setText_("periodText", text);
    box.classList.remove("hidden");
  }


  function renderResultRule_() {
    const box =
      document.getElementById(
        "resultRuleBox"
      );

    const rule =
      String(
        currentElection.resultRule || ""
      ).trim();

    if (!rule) {
      box.classList.add("hidden");
      return;
    }

    setText_("resultRuleText", rule);

    const ruleLabel =
      box.querySelector(".ruleLabel");

    if (ruleLabel) {
      ruleLabel.textContent =
        currentElection.voteType ===
        "confidence"
          ? "信任条件"
          : "選出方法";
    }

    box.classList.remove("hidden");
  }


  function renderStatusBadge_() {
    const badge =
      document.getElementById(
        "statusBadge"
      );

    badge.classList.remove("closed");
    badge.textContent = "投票受付中";
  }


  function renderConfidenceCandidate_() {
    const card =
      document.getElementById(
        "confidenceCandidateCard"
      );

    if (!currentConfidenceCandidate) {
      card.classList.add("hidden");
      return;
    }

    setText_(
      "confidenceCandidateName",
      currentConfidenceCandidate.name || ""
    );

    renderCandidatePhoto_(
      "confidenceCandidatePhoto",
      currentConfidenceCandidate.photoUrl
    );

    renderCandidateMeta_(
      "confidenceCandidateMeta",
      currentConfidenceCandidate
    );

    renderCandidateDetailText_(
      "confidenceCandidateProfile",
      "プロフィール",
      currentConfidenceCandidate.profile
    );

    renderCandidateDetailText_(
      "confidenceCandidateStatement",
      "所信",
      currentConfidenceCandidate.statement
    );

    renderCandidateDetailText_(
      "confidenceCandidateManifesto",
      "公約",
      currentConfidenceCandidate.manifesto
    );

    const detailsButton = document.getElementById(
      "confidenceCandidateDetailsButton"
    );
    const detailsPanel = document.getElementById(
      "confidenceCandidateDetails"
    );
    detailsPanel.classList.add("hidden");
    detailsButton.setAttribute("aria-expanded", "false");
    detailsButton.textContent = "プロフィール・所信・公約を見る";
    detailsButton.onclick = function() {
      toggleCandidateDetails_(detailsButton, detailsPanel);
    };
    detailsButton.classList.remove("hidden");

    card.classList.remove("hidden");
  }

  function toggleCandidateDetails_(button, panel) {
    const isOpening = panel.classList.contains("hidden");
    panel.classList.toggle("hidden", !isOpening);
    button.setAttribute("aria-expanded", String(isOpening));
    button.textContent = isOpening
      ? "詳細を閉じる"
      : "プロフィール・所信・公約を見る";
  }

  function renderCandidateDetailText_(elementId, label, value) {
    const element = document.getElementById(elementId);
    const text = String(value || "").trim();
    element.textContent =
      "【" + label + "】\n" + (text || "未登録");
    element.classList.remove("hidden");
  }


  function renderOptionalText_(
    elementId,
    value
  ) {
    const element =
      document.getElementById(elementId);

    const text =
      String(value || "").trim();

    if (!text) {
      element.textContent = "";
      element.classList.add("hidden");
      return;
    }

    element.textContent = text;
    element.classList.remove("hidden");
  }

  function renderCandidatePhoto_(elementId, value) {
    const image = document.getElementById(elementId);
    const url = String(value || "").trim();
    if (!url) {
      image.removeAttribute("src");
      image.classList.add("hidden");
      return;
    }
    image.src = url;
    image.classList.remove("hidden");
  }

  function renderCandidateMeta_(elementId, candidate) {
    const values = [candidate.dojo, candidate.rank, candidate.nominationType]
      .map(function(value) { return String(value || "").trim(); })
      .filter(Boolean);
    renderOptionalText_(elementId, values.join(" ／ "));
  }

  function renderLabeledText_(elementId, label, value) {
    const element = document.getElementById(elementId);
    const text = String(value || "").trim();
    if (!text) {
      element.textContent = "";
      element.classList.add("hidden");
      return;
    }
    element.textContent = "【" + label + "】\n" + text;
    element.classList.remove("hidden");
  }


  function renderOptions_() {
    const list =
      document.getElementById(
        "optionList"
      );

    list.innerHTML = "";

    currentOptions.forEach(
      function(option) {
        const label =
          document.createElement("label");

        label.className = "optionCard";


        const radio =
          document.createElement("input");

        radio.type = "radio";
        radio.name = "electionOption";
        radio.value = option.optionId;
        radio.className = "optionRadio";

        radio.addEventListener(
          "change",
          function() {
            selectOption_(
              option.optionId
            );
          }
        );


        const body =
          document.createElement("div");

        body.className = "optionBody";

        const photoUrl = String(option.photoUrl || "").trim();
        if (photoUrl) {
          const photo = document.createElement("img");
          photo.className = "candidatePhoto";
          photo.src = photoUrl;
          photo.alt = "候補者写真";
          body.classList.add("hasCandidatePhoto");
          body.appendChild(photo);
        }


        const optionLabel =
          document.createElement("div");

        optionLabel.className =
          "optionLabel";

        optionLabel.textContent =
          option.label || "";

        body.appendChild(optionLabel);


        const candidateName =
          String(
            option.candidateName || ""
          ).trim();

        if (
          candidateName &&
          candidateName !==
            String(
              option.label || ""
            ).trim()
        ) {
          const name =
            document.createElement("div");

          name.className =
            "candidateName";

          name.textContent =
            candidateName;

          body.appendChild(name);
        }

        const metaValues = [option.dojo, option.rank, option.nominationType]
          .map(function(value) { return String(value || "").trim(); })
          .filter(Boolean);

        if (metaValues.length) {
          const meta = document.createElement("div");
          meta.className = "candidateMeta";
          meta.textContent = metaValues.join(" ／ ");
          body.appendChild(meta);
        }


        const detailsPanel =
          document.createElement("div");

        detailsPanel.className =
          "candidateDetails hidden";

        const isCandidateOption = Boolean(candidateName);

        const profile =
          String(
            option.profile || ""
          ).trim();

        if (isCandidateOption) {
          const profileBox =
            document.createElement("div");

          profileBox.className =
            "candidateProfile";

          profileBox.textContent =
            "【プロフィール】\n" + (profile || "未登録");

          detailsPanel.appendChild(
            profileBox
          );
        }


        const statement =
          String(
            option.statement || ""
          ).trim();

        if (isCandidateOption) {
          const statementBox =
            document.createElement("div");

          statementBox.className =
            "candidateStatement";

          statementBox.textContent =
            "【所信】\n" + (statement || "未登録");

          detailsPanel.appendChild(
            statementBox
          );
        }

        const manifesto = String(option.manifesto || "").trim();
        if (isCandidateOption) {
          const manifestoBox = document.createElement("div");
          manifestoBox.className = "candidateManifesto";
          manifestoBox.textContent =
            "【公約】\n" + (manifesto || "未登録");
          detailsPanel.appendChild(manifestoBox);
        }

        if (isCandidateOption) {
          const detailsButton =
            document.createElement("button");

          detailsButton.type = "button";
          detailsButton.className =
            "candidateDetailsButton";
          detailsButton.textContent =
            "プロフィール・所信・公約を見る";
          detailsButton.setAttribute(
            "aria-expanded",
            "false"
          );

          detailsButton.addEventListener(
            "click",
            function(event) {
              event.preventDefault();
              event.stopPropagation();
              toggleCandidateDetails_(
                detailsButton,
                detailsPanel
              );
            }
          );

          body.appendChild(detailsButton);
          body.appendChild(detailsPanel);
        }


        label.appendChild(radio);
        label.appendChild(body);

        list.appendChild(label);
      }
    );
  }

  function renderWithdrawnCandidates_(elementId) {
    const box = document.getElementById(elementId);
    if (!box) return;
    box.innerHTML = "";
    if (!currentWithdrawnCandidates.length) {
      box.classList.add("hidden");
      return;
    }
    const heading = document.createElement("h2");
    heading.textContent = "候補者辞退のお知らせ";
    box.appendChild(heading);
    currentWithdrawnCandidates.forEach(function(candidate) {
      const item = document.createElement("div");
      item.className = "withdrawnCandidate";
      const name = document.createElement("strong");
      name.textContent = "【辞退】" + String(candidate.name || "");
      const detail = document.createElement("p");
      detail.textContent = [candidate.withdrawnAt, candidate.withdrawnReason].filter(Boolean).join("\n");
      item.appendChild(name);
      item.appendChild(detail);
      box.appendChild(item);
    });
    box.classList.remove("hidden");
  }


  function selectOption_(optionId) {
    selectedOptionId =
      String(optionId || "").trim();

    const confirmButton =
      document.getElementById(
        "confirmButton"
      );

    confirmButton.disabled =
      !selectedOptionId;
  }


  // ===================================================
  // 確認画面
  // ===================================================

  function openConfirmView() {
    if (!selectedOptionId) {
      alert(
        "投票する項目を選択してください。"
      );
      return;
    }

    const option =
      findCurrentOption_(
        selectedOptionId
      );

    if (!option) {
      showError_(
        "選択した項目を確認できませんでした。"
      );
      return;
    }

    setText_(
      "selectedOptionLabel",
      option.label || ""
    );

    const candidateBox =
      document.getElementById(
        "selectedCandidateName"
      );

    const candidateName =
      String(
        option.candidateName || ""
      ).trim();

    if (
      candidateName &&
      candidateName !==
        String(
          option.label || ""
        ).trim()
    ) {
      candidateBox.textContent =
        "候補者：" +
        candidateName;

      candidateBox.classList.remove(
        "hidden"
      );

    } else {
      candidateBox.textContent = "";
      candidateBox.classList.add(
        "hidden"
      );
    }

    showView_(
      ELECTION_VIEW.CONFIRM
    );

    window.scrollTo(0, 0);
  }


  function backToVoteView() {
    showView_(
      ELECTION_VIEW.VOTE
    );

    window.scrollTo(0, 0);
  }


  function findCurrentOption_(
    optionId
  ) {
    return currentOptions.find(
      function(option) {
        return (
          option.optionId ===
          optionId
        );
      }
    ) || null;
  }


  // ===================================================
  // 投票送信
  // ===================================================

  function submitVote() {
    if (!selectedOptionId) {
      showError_(
        "投票内容を確認できませんでした。"
      );
      return;
    }

    setSubmittingState_(true);

    showView_(
      ELECTION_VIEW.SENDING
    );

    const params = {
      electionId: currentElectionId,
      optionId: selectedOptionId,
      idToken: currentIdToken
    };

    callElectionApi_("castVote", params)
      .then(handleVoteResult_)
      .catch(handleVoteFailure_);
  }


  function handleVoteResult_(response) {
    setSubmittingState_(false);

    if (!response || response.ok !== true) {
      if (
        response &&
        response.alreadyVoted === true
      ) {
        showView_(
          ELECTION_VIEW.ALREADY
        );

        window.scrollTo(0, 0);
        return;
      }

      if (
        response &&
        response.votingIneligible === true
      ) {
        setText_(
          "ineligibleReason",
          response.error ||
            "現在の会員情報では投票できません。"
        );
        showView_(ELECTION_VIEW.INELIGIBLE);
        return;
      }

      if (
        response &&
        response.state === "closed"
      ) {
        renderClosedView_();

        showView_(
          ELECTION_VIEW.CLOSED
        );

        return;
      }

      showError_(
        response && response.error
          ? response.error
          : "投票を受け付けられませんでした。"
      );

      return;
    }

    showView_(
      ELECTION_VIEW.COMPLETE
    );

    window.scrollTo(0, 0);
  }


  function handleVoteFailure_(error) {
    setSubmittingState_(false);

    console.error(error);

    showError_(
      "通信中にエラーが発生しました。"
    );
  }


  function setSubmittingState_(
    isSubmitting
  ) {
    const submitButton =
      document.getElementById(
        "submitButton"
      );

    const backButton =
      document.getElementById(
        "backButton"
      );

    if (submitButton) {
      submitButton.disabled =
        isSubmitting;
    }

    if (backButton) {
      backButton.disabled =
        isSubmitting;
    }
  }


  // ===================================================
  // 共通画面制御
  // ===================================================

  function showView_(viewId) {
    const views =
      document.querySelectorAll(
        ".view"
      );

    views.forEach(function(view) {
      view.classList.add("hidden");
    });

    const target =
      document.getElementById(
        viewId
      );

    if (target) {
      target.classList.remove(
        "hidden"
      );
    }
  }


  function showError_(message) {
    setText_(
      "errorMessage",
      message ||
        "エラーが発生しました。"
    );

    showView_(
      ELECTION_VIEW.ERROR
    );

    window.scrollTo(0, 0);
  }


  function handleServerFailure_(error) {
    if (pageStateRequestTimer) {
      clearTimeout(pageStateRequestTimer);
      pageStateRequestTimer = null;
    }

    console.error(error);

    const detail = String(
      error && error.message
        ? error.message
        : error || ""
    ).trim();

    showError_(
      "選挙情報の読み込み中にエラーが発生しました。" +
      (detail ? "\n（" + detail + "）" : "")
    );
  }

  async function callElectionApi_(action, params) {
    const body = new URLSearchParams({
      action: action,
      electionId: String(params.electionId || ""),
      optionId: String(params.optionId || ""),
      idToken: String(params.idToken || "")
    });

    const response = await fetch(
      ELECTION_CLIENT_CONFIG.GAS_API_URL,
      {
        method: "POST",
        body: body,
        redirect: "follow"
      }
    );

    if (!response.ok) {
      throw new Error("GAS通信エラー: HTTP " + response.status);
    }

    const responseText = await response.text();

    try {
      return JSON.parse(responseText);
    } catch (error) {
      throw new Error(
        "GASの応答を読み取れませんでした" +
        (responseText
          ? ": " + responseText.slice(0, 120)
          : "（応答が空です）")
      );
    }
  }


  function setText_(
    elementId,
    text
  ) {
    const element =
      document.getElementById(
        elementId
      );

    if (element) {
      element.textContent =
        String(
          text == null ? "" : text
        );
    }
  }

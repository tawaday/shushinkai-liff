/* Optional friendship guidance: never used for authentication or voting. */
window.ShushinkaiFriendship = (() => {
  let friend = null, allowed = false, dismissed = false, busy = false, pending = null;
  const fallback = "https://line.me/R/ti/p/%40967vdyts";
  function panel() {
    let box = document.getElementById("friendshipNotice");
    if (box) return box;
    box = document.createElement("aside"); box.id = "friendshipNotice"; box.hidden = true;
    box.setAttribute("aria-label", "公式LINEの友だち追加（任意）");
    box.style.cssText = "margin:16px auto;padding:18px;max-width:560px;box-sizing:border-box;border:1px solid #ccd9d0;border-radius:12px;background:#f5faf6;line-height:1.7;color:#24372c";
    box.innerHTML = '<strong>宗心会公式LINEの友だち追加（任意）</strong><p>お知らせを受け取るには、公式LINEを友だち追加してください。追加しなくても投票・各サービスをそのまま利用できます。</p><button type="button" id="friendshipAdd">友だち追加</button> <button type="button" id="friendshipDismiss">今は追加しない</button><p id="friendshipStatus" role="status"></p><a id="friendshipFallback" hidden target="_blank" rel="noopener">公式LINEの友だち追加画面を開く</a>';
    box.querySelector("#friendshipFallback").href = fallback;
    (document.querySelector("main") || document.body).appendChild(box);
    box.querySelector("#friendshipAdd").onclick = add;
    box.querySelector("#friendshipDismiss").onclick = () => { dismissed = true; render(); };
    return box;
  }
  function render() { panel().hidden = !(allowed && friend === false && !dismissed); }
  function check() {
    if (pending) return pending;
    pending = (async () => {
      try {
        if (!window.liff || typeof liff.getFriendship !== "function") return;
        const result = await Promise.race([liff.getFriendship(), new Promise(resolve => setTimeout(() => resolve(null), 1500))]);
        friend = result && typeof result.friendFlag === "boolean" ? result.friendFlag : null;
      } catch (_) { friend = null; }
      finally { pending = null; render(); }
    })();
    return pending;
  }
  async function add() {
    if (busy) return;
    busy = true; const box = panel(), button = box.querySelector("#friendshipAdd"); button.disabled = true;
    try {
      // Availability also covers unsupported clients and LIFF window sizes.
      if (typeof liff.requestFriendship !== "function" || typeof liff.isApiAvailable !== "function" || !liff.isApiAvailable("requestFriendship")) throw Error("unavailable");
      await liff.requestFriendship();
      await check(); // Resolving the request does not mean the user added the account.
    } catch (_) {
      box.querySelector("#friendshipStatus").textContent = "こちらの友だち追加画面をご利用いただけます。追加せず、このまま利用することもできます。";
      box.querySelector("#friendshipFallback").hidden = false;
    } finally { busy = false; button.disabled = false; }
  }
  function offerContinuation(proceed) {
    if (friend !== false || dismissed) { proceed(); return; }
    allowed = true; render();
    const button = document.createElement("button"); button.type = "button";
    button.textContent = "友だち追加せず、そのままサービスへ進む";
    button.onclick = proceed; document.getElementById("registered").appendChild(button);
  }
  return { check, offerContinuation, show: value => { allowed = value === true; render(); } };
})();

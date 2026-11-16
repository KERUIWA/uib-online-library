(() => {
  const endpoint = window.CYRENE_LETTER_API || "https://YOUR-WORKER-SUBDOMAIN.workers.dev";
  const panel = document.getElementById("cyreneLettersPanel");
  if (!panel) return;
  const toggle = document.getElementById("cyreneLettersToggle");
  const status = document.getElementById("cyreneLettersStatus");
  const keyInput = document.getElementById("cyreneLettersKey");
  const saveKey = document.getElementById("cyreneLettersSaveKey");
  const forgetKey = document.getElementById("cyreneLettersForgetKey");
  const keyName = "uib-cyrene-access-key";
  let token = sessionStorage.getItem(keyName) || "";
  if (token) keyInput.value = token;
  function show(message, error=false) {
    status.textContent = message;
    status.dataset.state = error ? "error" : "ok";
  }
  function authHeaders() { return {"Content-Type":"application/json","Authorization":"Bearer "+token}; }
  async function refresh() {
    try {
      const r = await fetch(endpoint+"/api/cyrene/status",{cache:"no-store"});
      if (!r.ok) throw new Error("Status unavailable");
      const data = await r.json();
      toggle.checked = !!data.enabled;
      toggle.disabled = false;
      show(data.enabled ? "Letters are on. Cyrene will write once a day, at a time she chooses." : "Letters are paused. Her story and promises are safely kept.");
    } catch(e) {
      toggle.disabled = true;
      show("The letter service is not connected yet. Finish the Cloudflare setup to activate it.",true);
    }
  }
  saveKey.addEventListener("click", async () => {
    token=keyInput.value.trim();
    if (!token) { show("Enter your access key first.",true); return; }
    sessionStorage.setItem(keyName,token);
    show("Access key saved for this browser tab. You can now change the setting.");
    await refresh();
  });
  forgetKey.addEventListener("click", () => {
    token=""; sessionStorage.removeItem(keyName); keyInput.value="";
    show("Access key cleared from this tab.");
  });
  toggle.addEventListener("change", async () => {
    if (!token) { toggle.checked=!toggle.checked; show("Enter your access key to change this setting.",true); return; }
    toggle.disabled=true;
    try {
      const r=await fetch(endpoint+"/api/cyrene/toggle",{method:"POST",headers:authHeaders(),body:JSON.stringify({enabled:toggle.checked})});
      if (!r.ok) throw new Error("The service rejected the change. Check your access key.");
      const data=await r.json();
      show(data.enabled ? "Letters are on. Her next letter will arrive at a randomly chosen time." : "Letters are off. Her story and promises will be kept for later.");
    } catch(e) {
      toggle.checked=!toggle.checked;
      show(e.message || "Could not update the setting.",true);
    } finally { toggle.disabled=false; }
  });
  refresh();
})();
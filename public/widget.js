(function () {
  "use strict";

  var currentScript = document.currentScript || (function () {
    var scripts = document.getElementsByTagName("script");
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i].src && scripts[i].src.indexOf("widget.js") !== -1) return scripts[i];
    }
    return null;
  })();

  if (!currentScript) return;

  var siteKey = currentScript.getAttribute("data-site-key");
  if (!siteKey) {
    console.error("Linkly widget: data-site-key is missing on the widget script tag.");
    return;
  }

  var apiBase = new URL(currentScript.src).origin;
  var visitorKey = "audiencew_visitor_id";
  var contactKey = "audiencew_visitor_contact";

  function getVisitorId() {
    try {
      var id = window.localStorage.getItem(visitorKey);
      if (!id) {
        id = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
        window.localStorage.setItem(visitorKey, id);
      }
      return id;
    } catch (e) {
      return "guest-" + Math.random().toString(16).slice(2);
    }
  }

  function getContact() {
    try {
      var raw = window.localStorage.getItem(contactKey);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveContact(contact) {
    try {
      window.localStorage.setItem(contactKey, JSON.stringify(contact));
    } catch (e) {}
  }

  function formatTime(value) {
    try {
      return new Intl.DateTimeFormat("ar-SA", { hour: "2-digit", minute: "2-digit", numberingSystem: "latn" }).format(new Date(value));
    } catch (e) {
      return "";
    }
  }

  var visitorId = getVisitorId();
  var contact = getContact();
  var lastRenderedId = "";
  var pollTimer = null;
  var isOpen = false;
  var sending = false;

  var root = document.createElement("div");
  root.id = "audiencew-widget-root";
  root.style.all = "initial";
  root.style.position = "fixed";
  root.style.zIndex = "2147483000";
  root.style.bottom = "20px";
  root.style.insetInlineEnd = "20px";
  root.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, Arial, sans-serif";
  root.style.direction = "rtl";
  document.body.appendChild(root);

  var style = document.createElement("style");
  style.textContent = [
    "#audiencew-widget-root * { box-sizing: border-box; }",
    "#audiencew-widget-root { --aw-brand: #178a82; --aw-brand-dark: #106b65; --aw-brand-light: #d6f5f1; }",
    "@keyframes aw-pop { from { opacity: 0; transform: translateY(14px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }",
    "@keyframes aw-fade-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }",
    "@keyframes aw-pulse { 0% { box-shadow: 0 0 0 0 rgba(23,138,130,.45); } 70% { box-shadow: 0 0 0 10px rgba(23,138,130,0); } 100% { box-shadow: 0 0 0 0 rgba(23,138,130,0); } }",
    "#aw-bubble { width: 60px; height: 60px; border-radius: 50%; background: linear-gradient(135deg, var(--aw-brand), var(--aw-brand-dark)); color: #fff; border: none; cursor: pointer; box-shadow: 0 10px 28px rgba(16,107,101,.38); display: flex; align-items: center; justify-content: center; transition: transform .18s ease, box-shadow .18s ease; animation: aw-pulse 2.6s ease-out 1.2s 2; }",
    "#aw-bubble:hover { transform: translateY(-2px) scale(1.05); box-shadow: 0 14px 32px rgba(16,107,101,.46); }",
    "#aw-bubble svg { width: 26px; height: 26px; transition: transform .2s ease, opacity .2s ease; }",
    "#aw-bubble .aw-icon-close { position: absolute; opacity: 0; transform: rotate(-45deg) scale(.6); }",
    "#aw-bubble.aw-open .aw-icon-chat { opacity: 0; transform: rotate(45deg) scale(.6); }",
    "#aw-bubble.aw-open .aw-icon-close { opacity: 1; transform: rotate(0) scale(1); }",
    "#aw-panel { position: fixed; bottom: 92px; inset-inline-end: 20px; width: 360px; max-width: calc(100vw - 32px); height: 500px; max-height: calc(100vh - 150px); background: #fff; border-radius: 20px; box-shadow: 0 24px 60px rgba(15,40,37,.28), 0 0 0 1px rgba(15,40,37,.06); display: none; flex-direction: column; overflow: hidden; }",
    "#aw-panel.open { display: flex; animation: aw-pop .22s cubic-bezier(.2,.9,.3,1.2); }",
    "#aw-header { position: relative; background: linear-gradient(135deg, var(--aw-brand), var(--aw-brand-dark)); color: #fff; padding: 18px 18px 16px; display: flex; align-items: center; gap: 12px; flex-shrink: 0; overflow: hidden; }",
    "#aw-header::after { content: ''; position: absolute; inset-inline-end: -30px; top: -40px; width: 140px; height: 140px; border-radius: 50%; background: rgba(255,255,255,.08); }",
    "#aw-avatar { width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,.16); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }",
    "#aw-avatar svg { width: 22px; height: 22px; }",
    "#aw-header-text { flex: 1; min-width: 0; }",
    "#aw-header-text strong { display: block; font-size: 15px; font-weight: 800; }",
    "#aw-header-status { display: flex; align-items: center; gap: 5px; margin-top: 3px; font-size: 11.5px; color: rgba(255,255,255,.85); font-weight: 600; }",
    "#aw-header-status i { width: 7px; height: 7px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 0 2px rgba(74,222,128,.35); flex-shrink: 0; }",
    "#aw-close { position: relative; background: rgba(255,255,255,.14); border: none; color: #fff; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background .15s ease, transform .15s ease; flex-shrink: 0; }",
    "#aw-close:hover { background: rgba(255,255,255,.26); transform: rotate(90deg); }",
    "#aw-close svg { width: 15px; height: 15px; }",
    "#aw-body { flex: 1; overflow-y: auto; padding: 16px 14px; background: #f6f8f7; display: flex; flex-direction: column; gap: 3px; }",
    "#aw-body::-webkit-scrollbar { width: 6px; }",
    "#aw-body::-webkit-scrollbar-thumb { background: #d7e3e1; border-radius: 999px; }",
    ".aw-row { display: flex; flex-direction: column; margin-bottom: 10px; animation: aw-fade-in .22s ease; }",
    ".aw-row.in { align-items: flex-start; }",
    ".aw-row.out { align-items: flex-end; }",
    ".aw-msg { max-width: 80%; padding: 10px 13px; border-radius: 16px; font-size: 13.5px; line-height: 1.65; white-space: pre-wrap; word-break: break-word; }",
    ".aw-row.in .aw-msg { background: #fff; color: #16302c; box-shadow: 0 1px 2px rgba(15,40,37,.08), 0 0 0 1px #e7edec; border-end-start-radius: 4px; }",
    ".aw-row.out .aw-msg { background: linear-gradient(135deg, var(--aw-brand), var(--aw-brand-dark)); color: #fff; border-end-end-radius: 4px; }",
    ".aw-time { font-size: 10.5px; color: #93a6a2; margin-top: 4px; padding: 0 3px; }",
    "#aw-greeting { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 14px; animation: aw-fade-in .25s ease; }",
    "#aw-greeting .aw-gicon { width: 30px; height: 30px; border-radius: 50%; background: var(--aw-brand-light); color: var(--aw-brand-dark); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }",
    "#aw-greeting .aw-gicon svg { width: 16px; height: 16px; }",
    "#aw-greeting p { margin: 0; max-width: 78%; background: #fff; color: #16302c; padding: 10px 13px; border-radius: 16px; border-end-start-radius: 4px; font-size: 13.5px; line-height: 1.65; box-shadow: 0 1px 2px rgba(15,40,37,.08), 0 0 0 1px #e7edec; }",
    "#aw-form { padding: 18px 16px; display: flex; flex-direction: column; gap: 10px; background: #fff; border-top: 1px solid #eef2f1; }",
    "#aw-form p.aw-intro { margin: 0 0 2px; font-size: 12.5px; color: #5b7570; font-weight: 600; }",
    ".aw-field { position: relative; }",
    ".aw-field svg { position: absolute; inset-inline-start: 12px; top: 50%; transform: translateY(-50%); width: 15px; height: 15px; color: #9db2ae; pointer-events: none; }",
    "#aw-form input { width: 100%; padding: 11px 12px 11px 12px; padding-inline-start: 34px; border-radius: 10px; border: 1.5px solid #e3e9e8; font-size: 13px; font-family: inherit; background: #fbfcfc; transition: border-color .15s ease, background .15s ease; }",
    "#aw-form input:focus { outline: none; border-color: var(--aw-brand); background: #fff; }",
    "#aw-form button[type=submit] { background: linear-gradient(135deg, var(--aw-brand), var(--aw-brand-dark)); color: #fff; border: none; border-radius: 10px; padding: 11px 12px; font-size: 13.5px; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: filter .15s ease, transform .1s ease; }",
    "#aw-form button[type=submit]:hover { filter: brightness(1.06); }",
    "#aw-form button[type=submit]:active { transform: scale(.98); }",
    "#aw-form button[type=submit] svg { width: 14px; height: 14px; }",
    "#aw-footer { display: none; border-top: 1px solid #eef2f1; padding: 10px 12px; gap: 8px; align-items: center; background: #fff; flex-shrink: 0; }",
    "#aw-footer.visible { display: flex; }",
    "#aw-input-wrap { flex: 1; display: flex; }",
    "#aw-input { flex: 1; border: 1.5px solid #e3e9e8; border-radius: 999px; padding: 10px 16px; font-size: 13px; font-family: inherit; background: #f6f8f7; transition: border-color .15s ease, background .15s ease; }",
    "#aw-input:focus { outline: none; border-color: var(--aw-brand); background: #fff; }",
    "#aw-send { background: linear-gradient(135deg, var(--aw-brand), var(--aw-brand-dark)); color: #fff; border: none; border-radius: 50%; width: 38px; height: 38px; flex-shrink: 0; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: filter .15s ease, transform .1s ease; }",
    "#aw-send:hover { filter: brightness(1.08); }",
    "#aw-send:active { transform: scale(.94); }",
    "#aw-send svg { width: 16px; height: 16px; margin-inline-start: -1px; }",
    "#aw-send:disabled { opacity: .55; cursor: default; }",
    "#aw-badge { position: absolute; top: -3px; inset-inline-start: -3px; background: #ef4444; color: #fff; border: 2px solid #fff; border-radius: 999px; font-size: 10.5px; font-weight: 800; min-width: 19px; height: 19px; display: none; align-items: center; justify-content: center; padding: 0 4px; }",
    "#aw-badge.visible { display: flex; }",
    "#aw-footer-note { padding: 7px 16px 12px; text-align: center; font-size: 10.5px; color: #9db2ae; background: #fff; flex-shrink: 0; }",
    "@media (max-width: 420px) { #aw-panel { inset-inline-end: 12px; bottom: 84px; width: calc(100vw - 24px); } }"
  ].join("\n");
  root.appendChild(style);

  var CHAT_ICON = '<svg class="aw-icon-chat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  var CLOSE_MINI_ICON = '<svg class="aw-icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var CLOSE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var USER_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21a8 8 0 1 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>';
  var MAIL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg>';
  var SEND_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.6 22 12 3.4 3.4 3 10l13 2-13 2 .4 6.6Z"/></svg>';
  var HEADSET_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14v-2a9 9 0 0 1 18 0v2"/><path d="M21 15a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h3v4Z"/><path d="M3 15a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2H3v4Z"/></svg>';

  var bubbleWrap = document.createElement("div");
  bubbleWrap.style.position = "relative";
  var bubble = document.createElement("button");
  bubble.id = "aw-bubble";
  bubble.type = "button";
  bubble.setAttribute("aria-label", "الدردشة معنا");
  bubble.innerHTML = CHAT_ICON + CLOSE_MINI_ICON;
  var badge = document.createElement("span");
  badge.id = "aw-badge";
  bubbleWrap.appendChild(bubble);
  bubbleWrap.appendChild(badge);
  root.appendChild(bubbleWrap);

  var panel = document.createElement("div");
  panel.id = "aw-panel";
  panel.innerHTML =
    '<div id="aw-header">' +
      '<div id="aw-avatar">' + HEADSET_ICON + '</div>' +
      '<div id="aw-header-text"><strong>الدردشة المباشرة</strong><div id="aw-header-status"><i></i><span>عادة نرد خلال دقائق</span></div></div>' +
      '<button id="aw-close" type="button" aria-label="إغلاق">' + CLOSE_ICON + '</button>' +
    '</div>' +
    '<div id="aw-body">' +
      '<div id="aw-greeting"><div class="aw-gicon">' + HEADSET_ICON + '</div><p>مرحبًا 👋 راسلنا وبنساعدك بأسرع وقت ممكن.</p></div>' +
    '</div>' +
    '<form id="aw-form">' +
      '<p class="aw-intro">قبل ما نبدأ، عرّفنا عليك:</p>' +
      '<div class="aw-field">' + USER_ICON + '<input id="aw-name" type="text" placeholder="اسمك" required autocomplete="name" /></div>' +
      '<div class="aw-field">' + MAIL_ICON + '<input id="aw-email" type="email" placeholder="بريدك الإلكتروني" required autocomplete="email" /></div>' +
      '<button type="submit">ابدأ المحادثة ' + SEND_ICON + '</button>' +
    '</form>' +
    '<div id="aw-footer">' +
      '<div id="aw-input-wrap"><input id="aw-input" type="text" placeholder="اكتب رسالتك هنا" autocomplete="off" /></div>' +
      '<button id="aw-send" type="button" aria-label="إرسال">' + SEND_ICON + '</button>' +
    '</div>' +
    '<div id="aw-footer-note">مدعوم بواسطة Linkly</div>';
  root.appendChild(panel);

  var body = panel.querySelector("#aw-body");
  var greeting = panel.querySelector("#aw-greeting");
  var form = panel.querySelector("#aw-form");
  var footer = panel.querySelector("#aw-footer");
  var footerNote = panel.querySelector("#aw-footer-note");
  var nameInput = panel.querySelector("#aw-name");
  var emailInput = panel.querySelector("#aw-email");
  var textInput = panel.querySelector("#aw-input");
  var sendButton = panel.querySelector("#aw-send");

  function showChatUi() {
    form.style.display = "none";
    footer.className = "visible";
    footerNote.style.display = "none";
  }

  if (contact && contact.name) {
    showChatUi();
  }

  function renderMessages(messages) {
    if (!messages.length) return;
    var latestId = messages[messages.length - 1].id;
    if (latestId === lastRenderedId) return;
    lastRenderedId = latestId;

    greeting.style.display = "none";
    body.innerHTML = "";
    body.appendChild(greeting);
    messages.forEach(function (message) {
      var row = document.createElement("div");
      row.className = "aw-row " + (message.direction === "out" ? "out" : "in");
      var bubbleEl = document.createElement("div");
      bubbleEl.className = "aw-msg";
      bubbleEl.textContent = message.text;
      var time = document.createElement("span");
      time.className = "aw-time";
      time.textContent = formatTime(message.createdAt);
      row.appendChild(bubbleEl);
      row.appendChild(time);
      body.appendChild(row);
    });
    body.scrollTop = body.scrollHeight;

    if (!isOpen) {
      var unread = messages.filter(function (message) { return message.direction === "out"; }).length;
      if (unread) {
        badge.textContent = String(unread);
        badge.className = "visible";
      }
    }
  }

  function fetchMessages() {
    if (!contact) return;
    fetch(apiBase + "/api/website/messages?siteKey=" + encodeURIComponent(siteKey) + "&visitorId=" + encodeURIComponent(visitorId))
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (data) {
        if (data && data.ok) renderMessages(data.messages);
      })
      .catch(function () {});
  }

  function setSending(value) {
    sending = value;
    sendButton.disabled = value;
  }

  function sendMessage(text) {
    if (!text.trim()) return;
    setSending(true);
    return fetch(apiBase + "/api/website/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteKey: siteKey,
        visitorId: visitorId,
        name: contact ? contact.name : undefined,
        email: contact ? contact.email : undefined,
        text: text
      })
    }).then(function (response) { return response.ok; }).then(fetchMessages).finally(function () { setSending(false); });
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var name = nameInput.value.trim();
    var email = emailInput.value.trim();
    if (!name || !email) return;
    contact = { name: name, email: email };
    saveContact(contact);
    showChatUi();
    sendMessage("مرحباً، أحتاج مساعدة.");
  });

  function submitText() {
    if (sending) return;
    var text = textInput.value;
    if (!text.trim()) return;
    textInput.value = "";
    sendMessage(text);
  }

  sendButton.addEventListener("click", submitText);
  textInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      submitText();
    }
  });

  function openPanel() {
    isOpen = true;
    panel.className = "open";
    bubble.className = "aw-open";
    badge.className = "";
    fetchMessages();
    window.setTimeout(function () {
      (contact ? textInput : nameInput).focus();
    }, 120);
  }

  function closePanel() {
    isOpen = false;
    panel.className = "";
    bubble.className = "";
  }

  bubble.addEventListener("click", function () {
    if (isOpen) closePanel();
    else openPanel();
  });
  panel.querySelector("#aw-close").addEventListener("click", closePanel);

  if (contact) fetchMessages();
  pollTimer = window.setInterval(fetchMessages, 6000);
})();

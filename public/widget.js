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
    console.error("AudienceW widget: data-site-key is missing on the widget script tag.");
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

  var visitorId = getVisitorId();
  var contact = getContact();
  var lastRenderedId = "";
  var pollTimer = null;
  var isOpen = false;

  var root = document.createElement("div");
  root.id = "audiencew-widget-root";
  root.style.all = "initial";
  root.style.position = "fixed";
  root.style.zIndex = "2147483000";
  root.style.bottom = "20px";
  root.style.insetInlineEnd = "20px";
  root.style.fontFamily = "Tahoma, Arial, sans-serif";
  root.style.direction = "rtl";
  document.body.appendChild(root);

  var style = document.createElement("style");
  style.textContent = [
    "#audiencew-widget-root * { box-sizing: border-box; }",
    "#aw-bubble { width: 58px; height: 58px; border-radius: 50%; background: #111827; color: #fff; border: none; cursor: pointer; box-shadow: 0 8px 24px rgba(0,0,0,.25); font-size: 26px; display: flex; align-items: center; justify-content: center; }",
    "#aw-panel { position: fixed; bottom: 90px; inset-inline-end: 20px; width: 340px; max-width: calc(100vw - 32px); height: 460px; max-height: calc(100vh - 140px); background: #fff; border-radius: 16px; box-shadow: 0 12px 40px rgba(0,0,0,.3); display: none; flex-direction: column; overflow: hidden; }",
    "#aw-panel.open { display: flex; }",
    "#aw-header { background: #111827; color: #fff; padding: 14px 16px; font-size: 15px; font-weight: bold; display: flex; align-items: center; justify-content: space-between; }",
    "#aw-close { background: transparent; border: none; color: #fff; font-size: 18px; cursor: pointer; }",
    "#aw-body { flex: 1; overflow-y: auto; padding: 12px; background: #f3f4f6; display: flex; flex-direction: column; gap: 8px; }",
    ".aw-msg { max-width: 80%; padding: 8px 12px; border-radius: 12px; font-size: 13px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }",
    ".aw-msg.in { align-self: flex-start; background: #fff; color: #111827; border: 1px solid #e5e7eb; }",
    ".aw-msg.out { align-self: flex-end; background: #111827; color: #fff; }",
    "#aw-form { padding: 14px; display: flex; flex-direction: column; gap: 8px; }",
    "#aw-form input { padding: 10px 12px; border-radius: 8px; border: 1px solid #d1d5db; font-size: 13px; font-family: inherit; }",
    "#aw-form button, #aw-send { background: #111827; color: #fff; border: none; border-radius: 8px; padding: 10px 12px; font-size: 13px; cursor: pointer; }",
    "#aw-footer { display: none; border-top: 1px solid #e5e7eb; padding: 10px; gap: 8px; align-items: center; }",
    "#aw-footer.visible { display: flex; }",
    "#aw-input { flex: 1; border: 1px solid #d1d5db; border-radius: 8px; padding: 9px 10px; font-size: 13px; font-family: inherit; }",
    "#aw-badge { position: absolute; top: -4px; inset-inline-start: -4px; background: #ef4444; color: #fff; border-radius: 999px; font-size: 11px; min-width: 18px; height: 18px; display: none; align-items: center; justify-content: center; padding: 0 4px; }",
    "#aw-badge.visible { display: flex; }"
  ].join("\n");
  root.appendChild(style);

  var bubbleWrap = document.createElement("div");
  bubbleWrap.style.position = "relative";
  var bubble = document.createElement("button");
  bubble.id = "aw-bubble";
  bubble.type = "button";
  bubble.setAttribute("aria-label", "الدردشة معنا");
  bubble.textContent = "💬";
  var badge = document.createElement("span");
  badge.id = "aw-badge";
  bubbleWrap.appendChild(bubble);
  bubbleWrap.appendChild(badge);
  root.appendChild(bubbleWrap);

  var panel = document.createElement("div");
  panel.id = "aw-panel";
  panel.innerHTML =
    '<div id="aw-header"><span>الدردشة المباشرة</span><button id="aw-close" type="button" aria-label="إغلاق">✕</button></div>' +
    '<div id="aw-body"></div>' +
    '<form id="aw-form"><input id="aw-name" type="text" placeholder="اسمك" required />' +
    '<input id="aw-email" type="email" placeholder="بريدك الإلكتروني" required />' +
    '<button type="submit">ابدأ المحادثة</button></form>' +
    '<div id="aw-footer"><input id="aw-input" type="text" placeholder="اكتب رسالتك هنا" />' +
    '<button id="aw-send" type="button">إرسال</button></div>';
  root.appendChild(panel);

  var body = panel.querySelector("#aw-body");
  var form = panel.querySelector("#aw-form");
  var footer = panel.querySelector("#aw-footer");
  var nameInput = panel.querySelector("#aw-name");
  var emailInput = panel.querySelector("#aw-email");
  var textInput = panel.querySelector("#aw-input");
  var sendButton = panel.querySelector("#aw-send");

  function showChatUi() {
    form.style.display = "none";
    footer.className = "visible";
  }

  if (contact && contact.name) {
    showChatUi();
  }

  function renderMessages(messages) {
    if (!messages.length) return;
    var latestId = messages[messages.length - 1].id;
    if (latestId === lastRenderedId) return;
    lastRenderedId = latestId;

    body.innerHTML = "";
    messages.forEach(function (message) {
      var bubbleEl = document.createElement("div");
      bubbleEl.className = "aw-msg " + (message.direction === "out" ? "out" : "in");
      bubbleEl.textContent = message.text;
      body.appendChild(bubbleEl);
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

  function sendMessage(text) {
    if (!text.trim()) return;
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
    }).then(function (response) { return response.ok; }).then(fetchMessages);
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
    var text = textInput.value;
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
    badge.className = "";
    fetchMessages();
  }

  function closePanel() {
    isOpen = false;
    panel.className = "";
  }

  bubble.addEventListener("click", function () {
    if (isOpen) closePanel();
    else openPanel();
  });
  panel.querySelector("#aw-close").addEventListener("click", closePanel);

  if (contact) fetchMessages();
  pollTimer = window.setInterval(fetchMessages, 6000);
})();

const state = {
  filter: 'all',
  q: '',
  conversations: [],
  selected: null,
  workspace: {},
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2800);
}

async function api(action, options = {}) {
  const url = options.method === 'POST' ? `/api.php?action=${action}` : `/api.php?action=${action}${options.query || ''}`;
  const res = await fetch(url, options);
  const json = await res.json();
  if (!json.ok) {
    throw new Error(json.msg || 'حدث خطأ غير متوقع');
  }
  return json.data;
}

function fmt(n) {
  return new Intl.NumberFormat('ar-SA').format(Number(n || 0));
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[ch]));
}

function initials(name) {
  return (name || 'و').trim().slice(0, 1);
}

function openApp() {
  $('#landingPage').classList.add('hidden');
  $('#appPage').classList.remove('hidden');
  loadAll();
}

function openAuthModal(intent = 'trial', plan = 'Growth') {
  const form = $('#trialForm');
  if (!form) return;
  const planName = planLabel(plan);

  form.elements.intent.value = intent;
  form.elements.auth_provider.value = 'form';
  form.elements.plan_name.value = planName;
  const planChoice = Array.from(form.querySelectorAll('input[name="plan_select"]')).find((input) => input.value === planName);
  if (planChoice) planChoice.checked = true;

  const isLogin = intent === 'login';
  $('#authTitle').textContent = isLogin ? 'ادخل إلى حسابك في AudienceW' : 'ابدأ تجربة AudienceW';
  $('#authModeTitle').textContent = isLogin ? 'دخول أو طلب وصول' : 'بيانات التواصل';
  $('#trial')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => form.elements.company_name?.focus(), 450);
}

function openLanding() {
  $('#appPage').classList.add('hidden');
  $('#landingPage').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function switchView(view) {
  $$('.nav button[data-view]').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === view));
  $$('.view').forEach((el) => el.classList.toggle('active', el.id === `view-${view}`));
  const labels = {
    dashboard: 'لوحة التشغيل',
    inbox: 'المحادثات',
    crm: 'CRM العملاء',
    campaigns: 'الحملات الإعلانية',
    automation: 'الرد الآلي',
    settings: 'الإعدادات والصلاحيات',
  };
  $('#viewTitle').textContent = labels[view] || 'AudienceW';
  if (view === 'inbox') {
    loadConversations();
  }
}

async function loadAll() {
  await Promise.all([loadOverview(), loadWorkspace(), loadSettings(), loadConversations()]);
}

async function loadOverview() {
  const data = await api('overview');
  const items = [
    ['محادثات مفتوحة', data.summary.open_conversations],
    ['غير معين', data.summary.unassigned],
    ['رسائل غير مقروءة', data.summary.unread],
    ['عملاء نشطين', data.summary.active_tenants],
    ['تجارب مجانية', data.summary.trial_tenants],
    ['متوسط الردود', `${fmt(data.summary.campaign_replies)}%`],
  ];
  $('#stats').innerHTML = items.map(([label, value]) => `<div class="stat"><span>${label}</span><b>${value}</b></div>`).join('');
  $('#latestList').innerHTML = data.latest.length ? data.latest.map(conversationItem).join('') : '<p class="hint">لا توجد محادثات بعد.</p>';
}

async function loadWorkspace() {
  state.workspace = await api('workspace');
  renderPlans();
  renderAgents();
  renderCrm();
  renderCampaigns();
  renderAutomations();
}

function renderPlans() {
  const plans = [
    {
      name: 'البداية',
      price: 199,
      features: ['عدد 1 مستخدم فقط للدخول على المنصة', 'عدد لامحدود من المحادثات', 'عدد لامحدود من جهات الاتصال', 'ربط واتساب مجانا 0 ريال شهريا', 'رسوم المحادثات في الأسئلة المتكررة', 'رد آلي واتساب + قنوات التواصل الاجتماعي', 'التقارير المفصلة', 'الردود السريعة'],
    },
    {
      name: 'النمو',
      price: 499,
      badge: 'الأكثر طلبًا',
      features: ['حتى 10 مستخدمين للدخول على المنصة', 'عدد لامحدود من المحادثات', 'عدد لامحدود من جهات الاتصال', 'ربط واتساب مجانا 0 ريال شهريا', 'توزيع المحادثات على الموظفين', 'رد آلي واتساب + قنوات التواصل الاجتماعي', 'التقارير المفصلة', 'تقييم خدمة العملاء'],
    },
    {
      name: 'التوسع',
      price: 999,
      features: ['حتى 30 مستخدم للدخول على المنصة', 'عدد لامحدود من المحادثات', 'عدد لامحدود من جهات الاتصال', 'ربط واتساب مجانا 0 ريال شهريا', 'Webhooks و API للتكاملات', 'إدارة متعددة الفروع والفرق', 'تقارير متقدمة ومؤشرات SLA', 'مدير نجاح مخصص'],
    },
  ];
  $('#landingPlans').innerHTML = plans.map((plan, index) => `
    <div class="price plan-card ${index === 1 ? 'featured' : ''}">
      <div class="plan-title">
        <h3>${esc(plan.name)}</h3>
        ${plan.badge ? `<span>${esc(plan.badge)}</span>` : ''}
      </div>
      <div class="plan-price">
        <span class="currency">ريال</span>
        <b>${fmt(plan.price)}</b>
        <span class="period">/ الشهر</span>
      </div>
      <div class="plan-divider"></div>
      <ul class="plan-features">
        ${plan.features.map((feature) => `<li>${esc(feature)}</li>`).join('')}
      </ul>
    </div>
  `).join('');
}

function planLabel(name) {
  return {
    Starter: 'البداية',
    Growth: 'النمو',
    Scale: 'التوسع',
  }[name] || name;
}

function planDescription(name) {
  return {
    Starter: 'للفرق الصغيرة التي تحتاج صندوق وارد منظم.',
    Growth: 'للمتاجر والفرق التي تحتاج توزيع وردود آلية.',
    Scale: 'للشركات عالية الحجم والفروع والتكاملات.',
  }[name] || 'باقة مرنة حسب احتياج الفريق.';
}

function renderAgents() {
  const agents = state.workspace.agents || [];
  $('#agentsMini').innerHTML = agents.map((agent) => `
    <div class="kv" style="margin-bottom:10px">
      <div><span>${esc(agent.name)}</span><b>${fmt(agent.active_chats)} محادثات</b></div>
    </div>
  `).join('');
  $('#agentsTable').innerHTML = `
    <table>
      <thead><tr><th>الموظف</th><th>الدور</th><th>الحالة</th><th>محادثات نشطة</th></tr></thead>
      <tbody>${agents.map((agent) => `<tr><td>${esc(agent.name)}<br><small>${esc(agent.email)}</small></td><td>${roleLabel(agent.role)}</td><td><span class="pill">${statusLabel(agent.status)}</span></td><td>${fmt(agent.active_chats)}</td></tr>`).join('')}</tbody>
    </table>
  `;
}

function renderCrm() {
  const stages = [
    ['new', 'جديد'],
    ['qualified', 'مؤهل'],
    ['proposal', 'عرض سعر'],
    ['won', 'ناجح'],
    ['lost', 'مغلق'],
  ];
  const deals = state.workspace.deals || [];
  $('#crmBoard').innerHTML = stages.map(([stage, label]) => `
    <div class="lane">
      <h3>${label}</h3>
      ${deals.filter((deal) => deal.stage === stage).map((deal) => `
        <div class="deal">
          <b>${esc(deal.title)}</b>
          <small>${esc(deal.contact_name || 'عميل محتمل')} · ${fmt(deal.value)} ر.س</small>
          <small>المالك: ${esc(deal.owner || '-')}</small>
          <small>التالي: ${esc(deal.next_step || '-')}</small>
          <select data-deal="${deal.id}">
            ${stages.map(([value, text]) => `<option value="${value}" ${value === deal.stage ? 'selected' : ''}>${text}</option>`).join('')}
          </select>
        </div>
      `).join('') || '<p class="hint" style="padding:12px">لا توجد فرص هنا.</p>'}
    </div>
  `).join('');
  $$('select[data-deal]').forEach((select) => {
    select.addEventListener('change', async () => {
      const form = new FormData();
      form.set('deal_id', select.dataset.deal);
      form.set('stage', select.value);
      await api('update_deal_stage', { method: 'POST', body: form });
      toast('تم تحديث مرحلة العميل');
      await loadWorkspace();
    });
  });
}

function renderCampaigns() {
  const campaigns = state.workspace.campaigns || [];
  const running = campaigns.find((campaign) => campaign.status === 'running') || campaigns[0];
  $('#campaignPulse').textContent = running
    ? `${running.name}: ${fmt(running.sent_count)} رسالة، معدل رد ${fmt(running.reply_rate)}%.`
    : 'لا توجد حملات بعد.';
  $('#campaignTable').innerHTML = `
    <table>
      <thead><tr><th>الحملة</th><th>الجمهور</th><th>القناة</th><th>الحالة</th><th>الإرسال</th><th>معدل الرد</th><th>الموعد</th></tr></thead>
      <tbody>${campaigns.map((campaign) => `<tr><td><b>${esc(campaign.name)}</b></td><td>${esc(campaign.audience)}</td><td>${esc(campaign.channel)}</td><td><span class="pill blue">${campaignStatus(campaign.status)}</span></td><td>${fmt(campaign.sent_count)}</td><td>${fmt(campaign.reply_rate)}%</td><td>${esc(campaign.scheduled_at || '-')}</td></tr>`).join('')}</tbody>
    </table>
  `;
}

function renderAutomations() {
  const rules = state.workspace.automations || [];
  $('#automationGrid').innerHTML = rules.map((rule) => `
    <div class="feature">
      <div class="icon">${rule.status === 'active' ? 'ON' : 'OFF'}</div>
      <h3>${esc(rule.trigger_name)}</h3>
      <p>${esc(rule.reply_body)}</p>
      <p class="hint">التحويل إلى: ${esc(rule.handoff_to || '-')}</p>
      <button class="btn" data-rule="${rule.id}">${rule.status === 'active' ? 'إيقاف' : 'تفعيل'}</button>
    </div>
  `).join('');
  $$('[data-rule]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const form = new FormData();
      form.set('id', btn.dataset.rule);
      await api('toggle_automation', { method: 'POST', body: form });
      toast('تم تحديث قاعدة الرد الآلي');
      await loadWorkspace();
    });
  });
}

async function loadSettings() {
  const data = await api('settings');
  const form = $('#settingsForm');
  if (!form) return;
  ['phone_number_id', 'waba_id', 'business_phone', 'verify_token', 'graph_version'].forEach((key) => {
    if (form.elements[key]) form.elements[key].value = data[key] || '';
  });
  form.elements.is_active.checked = String(data.is_active) === '1';
  $('#webhookHint').textContent = `Webhook: ${location.origin}${data.webhook_url} · التوكن محفوظ: ${data.has_access_token ? 'نعم' : 'لا'}`;
}

async function loadConversations() {
  const query = `&filter=${encodeURIComponent(state.filter)}&q=${encodeURIComponent(state.q)}`;
  state.conversations = await api('conversations', { query });
  $('#conversationList').innerHTML = state.conversations.length
    ? state.conversations.map(conversationItem).join('')
    : '<div class="empty">لا توجد محادثات مطابقة</div>';
  $$('#conversationList .conv, #latestList .conv').forEach((el) => {
    el.addEventListener('click', () => selectConversation(Number(el.dataset.id)));
  });
}

function conversationItem(conv) {
  return `
    <div class="conv ${state.selected?.id === conv.id ? 'active' : ''}" data-id="${conv.id}">
      <div class="avatar">${esc(initials(conv.name))}</div>
      <div>
        <div style="display:flex;gap:8px;align-items:center">
          <div class="name">${esc(conv.name || conv.phone || conv.wa_id)}</div>
          ${Number(conv.unread_count) > 0 ? `<span class="badge">${fmt(conv.unread_count)}</span>` : ''}
        </div>
        <div class="preview">${esc(conv.last_message_preview || 'لا توجد رسائل')}</div>
        <div class="meta"><span>${esc(conv.assigned_to || 'غير معين')}</span><span>${esc(conv.status)}</span></div>
      </div>
    </div>
  `;
}

async function selectConversation(id) {
  const existing = state.conversations.find((conv) => Number(conv.id) === id);
  state.selected = existing || { id };
  renderConversationHead();
  const messages = await api('messages', { query: `&conversation_id=${id}` });
  $('#messages').innerHTML = messages.length
    ? messages.map((msg) => `<div class="bubble ${msg.direction === 'outbound' ? 'outbound' : 'inbound'}">${esc(msg.body)}<div class="time">${esc(msg.created_at || '')} · ${esc(msg.status || '')}</div></div>`).join('')
    : '<div class="empty">لا توجد رسائل في هذه المحادثة</div>';
  $('#messages').scrollTop = $('#messages').scrollHeight;
  $('#messageBody').disabled = false;
  $('#sendBtn').disabled = false;
  $('#assignBtn').disabled = false;
  $('#closeBtn').disabled = false;
  loadConversations();
}

function renderConversationHead() {
  const conv = state.selected || {};
  $('#chatHead').innerHTML = `
    <div class="avatar">${esc(initials(conv.name))}</div>
    <div><div class="name">${esc(conv.name || conv.phone || 'محادثة')}</div><div class="preview">${esc(conv.phone || conv.wa_id || '')}</div></div>
    <span style="flex:1"></span>
    <button class="btn" id="assignBtn">إسناد لي</button>
    <button class="btn danger" id="closeBtn">إغلاق</button>
  `;
  $('#contactInfo').innerHTML = `
    <div><span>الاسم</span><b>${esc(conv.name || '-')}</b></div>
    <div><span>الرقم</span><b>${esc(conv.phone || conv.wa_id || '-')}</b></div>
    <div><span>الموظف</span><b>${esc(conv.assigned_to || 'غير معين')}</b></div>
    <div><span>الحالة</span><b>${esc(conv.status || '-')}</b></div>
    <div><span>وسوم</span><b>${esc(conv.tags || '-')}</b></div>
  `;
  bindConversationActions();
}

function bindConversationActions() {
  $('#assignBtn')?.addEventListener('click', async () => {
    if (!state.selected) return;
    const form = new FormData();
    form.set('conversation_id', state.selected.id);
    await api('assign', { method: 'POST', body: form });
    toast('تم إسناد المحادثة');
    await loadConversations();
  });
  $('#closeBtn')?.addEventListener('click', async () => {
    if (!state.selected) return;
    const form = new FormData();
    form.set('conversation_id', state.selected.id);
    await api('close', { method: 'POST', body: form });
    toast('تم إغلاق المحادثة');
    await loadConversations();
  });
}

function roleLabel(role) {
  return {
    support_lead: 'مشرف دعم',
    support: 'دعم',
    sales: 'مبيعات',
  }[role] || role;
}

function statusLabel(status) {
  return status === 'active' ? 'نشط' : status;
}

function campaignStatus(status) {
  return {
    draft: 'مسودة',
    scheduled: 'مجدولة',
    running: 'تعمل',
    active: 'نشطة',
  }[status] || status;
}

function bindAuthButtons() {
  $$('[data-auth-modal]').forEach((btn) => {
    if (btn.dataset.boundAuth === '1') return;
    btn.dataset.boundAuth = '1';
    btn.addEventListener('click', () => {
      openAuthModal(btn.dataset.intent || 'trial', btn.dataset.plan || 'Growth');
    });
  });
}

function boot() {
  bindAuthButtons();
  $('#menuToggle')?.addEventListener('click', () => {
    const header = $('.topbar-inner');
    const isOpen = document.body.classList.toggle('mobile-menu-open');
    header.classList.toggle('menu-open', isOpen);
    $('#menuToggle').setAttribute('aria-expanded', String(isOpen));
  });
  $$('.nav-links a').forEach((link) => {
    link.addEventListener('click', () => {
      document.body.classList.remove('mobile-menu-open');
      const navToggle = $('#navToggle');
      if (navToggle) navToggle.checked = false;
      $('.topbar-inner')?.classList.remove('menu-open');
      $('#menuToggle')?.setAttribute('aria-expanded', 'false');
    });
  });
  $('[data-back-landing]')?.addEventListener('click', openLanding);
  $$('input[name="plan_select"]').forEach((input) => {
    input.addEventListener('change', (event) => {
      $('#trialForm').elements.plan_name.value = event.target.value;
    });
  });
  $$('[data-provider]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const provider = btn.dataset.provider;
      $('#trialForm').elements.auth_provider.value = provider;
      toast(provider === 'google' ? 'تم اختيار Google، أكمل البيانات للمتابعة' : 'تم اختيار Facebook، أكمل البيانات للمتابعة');
    });
  });
  $('#trialForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const selectedPlan = event.currentTarget.querySelector('input[name="plan_select"]:checked')?.value || 'النمو';
    form.set('plan_name', selectedPlan);
    try {
      const result = await api('submit_trial', { method: 'POST', body: form });
      toast(result.message || 'تم استلام طلبك');
      openApp();
    } catch (error) {
      toast(error.message);
    }
  });
  $$('#appNav button[data-view]').forEach((btn) => btn.addEventListener('click', () => switchView(btn.dataset.view)));
  $('#conversationTabs')?.addEventListener('click', (event) => {
    const btn = event.target.closest('.tab');
    if (!btn) return;
    state.filter = btn.dataset.filter;
    $$('#conversationTabs .tab').forEach((tab) => tab.classList.toggle('active', tab === btn));
    loadConversations();
  });
  $('#search')?.addEventListener('input', (event) => {
    state.q = event.target.value;
    loadConversations();
  });
  $('#seedBtn')?.addEventListener('click', async () => {
    await api('seed', { method: 'POST', body: new FormData() });
    toast('تمت إضافة رسالة تجربة');
    await loadAll();
    switchView('inbox');
  });
  $('#sendForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.selected) return;
    const body = $('#messageBody').value.trim();
    if (!body) return;
    const form = new FormData();
    form.set('conversation_id', state.selected.id);
    form.set('body', body);
    try {
      await api('send', { method: 'POST', body: form });
      $('#messageBody').value = '';
      toast('تم إرسال الرد');
      await selectConversation(Number(state.selected.id));
    } catch (error) {
      toast(error.message);
    }
  });
  $('#settingsForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set('is_active', event.currentTarget.elements.is_active.checked ? '1' : '0');
    await api('save_settings', { method: 'POST', body: form });
    toast('تم حفظ الإعدادات');
    await loadSettings();
  });
  $$('.quick-reply').forEach((btn) => {
    btn.addEventListener('click', () => {
      $('#messageBody').value = btn.textContent.trim();
      $('#messageBody').focus();
    });
  });
  loadWorkspace().catch(() => {});
}

document.addEventListener('DOMContentLoaded', boot);

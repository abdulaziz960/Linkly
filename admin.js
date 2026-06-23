const $ = (selector) => document.querySelector(selector);

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[ch]));
}

function fmt(value) {
  return new Intl.NumberFormat('ar-SA').format(Number(value || 0));
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2400);
}

async function loadAdmin() {
  const res = await fetch('/api.php?action=workspace');
  const json = await res.json();
  if (!json.ok) {
    toast(json.msg || 'تعذر تحميل لوحة الإدارة');
    return;
  }
  render(json.data);
}

function render(data) {
  const tenants = data.tenants || [];
  const plans = data.plans || [];
  const trialRequests = data.trial_requests || [];
  const totalMessages = tenants.reduce((sum, tenant) => sum + Number(tenant.monthly_messages || 0), 0);
  const totalSeats = tenants.reduce((sum, tenant) => sum + Number(tenant.seats || 0), 0);

  $('#adminStats').innerHTML = [
    ['كل العملاء', tenants.length],
    ['نشط', tenants.filter((tenant) => tenant.status === 'active').length],
    ['تجربة مجانية', tenants.filter((tenant) => tenant.status === 'trial').length],
    ['رسائل هذا الشهر', fmt(totalMessages)],
    ['مقاعد مستخدمة', fmt(totalSeats)],
    ['طلبات جديدة', trialRequests.length],
  ].map(([label, value]) => `<div class="stat"><span>${label}</span><b>${value}</b></div>`).join('');

  $('#tenantsTable').innerHTML = `
    <table>
      <thead><tr><th>الشركة</th><th>الباقة</th><th>الحالة</th><th>نهاية التجربة</th><th>المقاعد</th><th>رسائل الشهر</th></tr></thead>
      <tbody>${tenants.map((tenant) => `
        <tr>
          <td><b>${esc(tenant.company_name)}</b><br><small>تم الإنشاء: ${esc(tenant.created_at)}</small></td>
          <td>${esc(tenant.plan_name)}</td>
          <td><span class="pill ${tenant.status === 'trial' ? 'orange' : ''}">${tenant.status === 'trial' ? 'تجربة' : 'نشط'}</span></td>
          <td>${esc(tenant.trial_ends_at)}</td>
          <td>${fmt(tenant.seats)}</td>
          <td>${fmt(tenant.monthly_messages)}</td>
        </tr>
      `).join('')}</tbody>
    </table>
  `;

  $('#plansList').innerHTML = plans.map((plan) => `
    <div class="plan">
      <b>${esc(plan.name)} · ${fmt(plan.price)} ر.س</b>
      <p>${fmt(plan.conversations_limit)} محادثة شهرية · ${fmt(plan.agents_limit)} موظفين</p>
      <p>${esc(plan.features)}</p>
    </div>
  `).join('');

  $('#trialRequestsTable').innerHTML = `
    <table>
      <thead><tr><th>الشركة</th><th>المسؤول</th><th>التواصل</th><th>النية</th><th>الباقة</th><th>الدخول</th><th>التاريخ</th></tr></thead>
      <tbody>${trialRequests.length ? trialRequests.map((lead) => `
        <tr>
          <td><b>${esc(lead.company_name)}</b><br><small>${esc(lead.team_size || '-')}</small></td>
          <td>${esc(lead.contact_name)}</td>
          <td>${esc(lead.email)}<br><small>${esc(lead.phone)}</small></td>
          <td><span class="pill ${lead.intent === 'subscribe' ? '' : 'orange'}">${intentLabel(lead.intent)}</span></td>
          <td>${esc(lead.plan_name || '-')}</td>
          <td>${providerLabel(lead.auth_provider)}</td>
          <td>${esc(lead.created_at)}</td>
        </tr>
      `).join('') : '<tr><td colspan="7">لا توجد طلبات حتى الآن.</td></tr>'}</tbody>
    </table>
  `;

  $('#usageTable').innerHTML = `
    <table>
      <thead><tr><th>الشركة</th><th>الاستخدام</th><th>متوسط الرسائل لكل مقعد</th><th>ملاحظة</th></tr></thead>
      <tbody>${tenants.map((tenant) => {
        const perSeat = Number(tenant.seats) > 0 ? Math.round(Number(tenant.monthly_messages || 0) / Number(tenant.seats)) : 0;
        const note = tenant.status === 'trial' ? 'تابع التحويل قبل نهاية التجربة' : 'اشتراك فعّال';
        return `<tr><td>${esc(tenant.company_name)}</td><td>${fmt(tenant.monthly_messages)} رسالة</td><td>${fmt(perSeat)}</td><td>${note}</td></tr>`;
      }).join('')}</tbody>
    </table>
  `;
}

function intentLabel(intent) {
  return {
    trial: 'تجربة',
    subscribe: 'اشتراك',
    login: 'دخول',
  }[intent] || intent;
}

function providerLabel(provider) {
  return {
    form: 'نموذج',
    google: 'Google',
    facebook: 'Facebook',
  }[provider] || provider;
}

document.addEventListener('DOMContentLoaded', () => {
  $('#refreshBtn').addEventListener('click', () => {
    loadAdmin();
    toast('تم تحديث البيانات');
  });
  loadAdmin();
});

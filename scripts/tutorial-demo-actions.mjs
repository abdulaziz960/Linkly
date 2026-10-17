// Actual application interactions used only by the local tutorial recorder.
export const botTypes = ['إرسال رسالة','إرسال صورة','إرسال فيديو','إرسال مستند','إرسال قائمة قصيرة','إرسال قائمة طويلة','رد من قاعدة المعرفة','رد AI تلقائي','عرض الكتالوج','أقرب فرع','تحويل لفريق','تحويل لموظف','إغلاق المحادثة'];
export async function performDemo({ guide, index, page: p, click, fill, api, showResponse, focus }) {
  const openDocs = async () => {await p.locator('#tutorial-api-result').evaluateAll(els=>els.forEach(el=>el.remove()));const link=p.getByRole('link',{name:'فتح التوثيق الكامل',exact:true});await link.evaluate(el=>el.setAttribute('target','_self'));await click(link);await p.locator('main').waitFor();};
  const button = (name) => p.getByRole('button', { name, exact: true }).filter({ visible: true }).first();
  const dialog = () => p.getByRole('dialog').filter({ visible: true }).first();
  const custom = () => click(button('＋ خطوة مخصصة'));
  const save = () => click(dialog().getByRole('button',{name:/^(حفظ التعديل|＋ إضافة خطوة|إضافة خطوة)$/}).filter({visible:true}).first());
  const selectType = async (name) => { await click(dialog().getByRole('button').filter({ hasText: /إرسال رسالة|إرسال صورة|إرسال فيديو|إرسال مستند|إرسال قائمة|رد من|رد AI|عرض الكتالوج|أقرب فرع|تحويل|إغلاق المحادثة/ }).first()); await click(p.getByRole('option', { name, exact: true })); };
  const edit = (title) => click(p.locator('.bot-flow-node').filter({ has: p.locator('b', { hasText: title }) }).first());
  const close = () => click(dialog().getByRole('button', { name: 'إغلاق', exact: true }).last());
  const nameField = () => p.locator('#bot-step-form input').first();
  const setNext = async (title) => { const label = p.locator('#bot-step-form label').filter({ has: p.locator('span', { hasText: /^ربط بخطوة$/ }) }); await click(label.getByRole('button')); await click(p.getByRole('option', { name: title, exact: true })); };
  const chooseOption = async (number, title) => { await click(p.getByRole('button', { name: `ربط الخيار ${number} بخطوة`, exact: true })); await click(p.getByRole('option', { name: title, exact: true })); };
  if (guide.id === 'bot') {
    if(index===0) {await click(button('تيليجرام'));await click(button('واتساب'));}
    if(index===1) await click(p.locator('.bot-library-filters button').filter({hasText:/^خطوات$/}));
    if(index===2) await click(p.locator('.bot-library-filters button').filter({hasText:/^مسارات كاملة$/}));
    if(index===3) await click(p.getByRole('button',{name:'إضافة مسار خدمة عملاء كامل',exact:true}));
    if(index===4) {await click(button('تصغير المخطط'));await click(button('تكبير المخطط'));await click(button('إعادة تمركز المخطط'));}
    if(index===5) await edit('الترحيب');
    if(index===6) {await setNext('القائمة الرئيسية');await save();}
    if(index===7) {await edit('القائمة الرئيسية');await click(button('＋ إضافة خيار'));await fill(p.getByPlaceholder('الخيار 4'), 'خيار تدريبي');await click(dialog().getByRole('button',{name:'حذف الخيار',exact:true}).last());await save();}
    if(index===8) {await edit('الترحيب');await p.setViewportSize({width:640,height:360});await click(button('نقل لأسفل'));await click(button('نقل لأعلى'));}
    if(index===9) {await fill(p.locator('#bot-step-form textarea').first(),'أهلًا بك في متجرنا التجريبي. اختر الخدمة المناسبة من القائمة التالية.');await save();}
    if(index===10) {await p.setViewportSize({width:1600,height:900});await custom();await fill(nameField(),'خطوة تدريبية للحذف');await fill(p.locator('#bot-step-form textarea'),'هذه خطوة مؤقتة');await save();await edit('خطوة تدريبية للحذف');await click(button('حذف الخطوة'));}
    if(index===11) await click(p.locator('.bot-toggle input'));
    return;
  }
  if (guide.id === 'bot-build') {
    if(index===0) await custom();
    if(index===1) {await fill(nameField(),'ترحيب المتجر');await fill(p.locator('#bot-step-form textarea'),'أهلًا بك، كيف نقدر نخدمك؟');await save();}
    if(index===2) {await custom();await fill(nameField(),'الأسعار');await fill(p.locator('#bot-step-form textarea'),'الخدمة الأساسية تبدأ من 100 ريال. اكتب الخدمة المطلوبة لمساعدتك.');await save();}
    if(index===3) {await custom();await selectType('تحويل لفريق');await fill(nameField(),'فريق الدعم');await click(p.locator('#bot-step-form label').filter({has:p.locator('span',{hasText:/^الفريق$/})}).getByRole('button'));await click(p.getByRole('option',{name:'خدمة العملاء',exact:true}));await save();}
    if(index===4) {await custom();await selectType('إرسال قائمة قصيرة');await fill(nameField(),'قائمة المتجر');await fill(p.locator('#bot-step-form textarea'),'اختر الخدمة التي تحتاجها');await fill(p.getByPlaceholder('الخيار 1'),'الأسعار');await click(button('＋ إضافة خيار'));await fill(p.getByPlaceholder('الخيار 2'),'التحدث مع الدعم');}
    if(index===5) {await chooseOption(1,'الأسعار');await chooseOption(2,'فريق الدعم');await save();}
    if(index===6) {await edit('ترحيب المتجر');await setNext('قائمة المتجر');await save();}
    if(index===7) {await click(button('تصغير المخطط'));await click(p.locator('.bot-toggle input'));}
    return;
  }
  if (guide.id === 'bot-types') {
    if(index>0) await close();
    await custom();if(index>0) await selectType(botTypes[index]);
    await fill(nameField(),botTypes[index]);
    const text = p.locator('#bot-step-form textarea').first();
    if(await text.count()) await fill(text, index===0?'أهلًا بك في نشاطنا، يسعدنا خدمتك.':index===12?'شكرًا لتواصلك معنا.':'مثال تدريبي — '+guide.steps[index].body);
    if([1,2,3].includes(index)) {
      const ext = index===1?'jpg':'mp4';
      await p.locator('#bot-step-form input[type="file"]').setInputFiles(index===3 ? {name:'دليل-تدريبي.txt',mimeType:'text/plain',buffer:Buffer.from('هذا مستند تدريبي لشرح رفع الملفات.')} : `public/tutorials/whatsapp.${ext}`);
      await p.locator('.bot-media-pick').filter({hasText:/تم الرفع|whatsapp|دليل-تدريبي/}).waitFor({timeout:10000});
    }
    if([4,5].includes(index)){await fill(p.getByPlaceholder('الخيار 1'),'الخدمات');await click(button('＋ إضافة خيار'));await fill(p.getByPlaceholder('الخيار 2'),'خدمة العملاء');}
    if(index===10 || index===11) {const label=p.locator('#bot-step-form label').filter({has:p.locator('span',{hasText:index===10?/^الفريق$/:/^الموظف$/})});await click(label.getByRole('button'));await click(p.getByRole('option').first());}
    return;
  }
  if (guide.id === 'api-key' || guide.id === 'developers') {
    if(index===1) {await fill(p.getByPlaceholder('اسم المفتاح (مثال: تكامل سلة)'), 'تكامل تدريبي للفيديو');await click(button('إنشاء مفتاح'));}
    if(index===2) {await click(button('نسخ'));await click(button('إخفاء'));}
    if(index===3) await click(p.locator('tr').filter({hasText:'تكامل تدريبي للفيديو'}).getByRole('button',{name:'إلغاء',exact:true}).first());
    return;
  }
  if(guide.id==='api-request') {
    if(index===0) {await openDocs();}
    if(index===1) await showResponse({method:'GET',path:'/api/v1/customers?limit=5',authorization:'Bearer YOUR_API_KEY',note:'الطلب التالي يستخدم مفتاحًا تدريبيًا محليًا. قيمة المفتاح مخفية.'});
    if(index===2) {const r=await p.request.get(api.base+'/api/v1/customers?limit=5',{headers:{Authorization:`Bearer ${api.key}`}});if(r.status()!==200)throw Error('API success demo failed');await showResponse({method:'GET',path:'/api/v1/customers?limit=5',status:r.status(),body:await r.json()});}
    return;
  }
  if(guide.id==='api-errors') {
    if(index===0) {const r=await p.request.get(api.base+'/api/v1/customers');if(r.status()!==401)throw Error('Expected 401');await showResponse({method:'GET',path:'/api/v1/customers',status:r.status(),body:await r.json()});}
    if(index===1) {const r=await p.request.post(api.base+'/api/v1/customers',{headers:{Authorization:`Bearer ${api.key}`},data:{}});if(r.status()!==400)throw Error('Expected 400');await showResponse({method:'POST',path:'/api/v1/customers',requestBody:{},status:r.status(),body:await r.json()});}
    if(index===2){await openDocs();const heading=p.locator('#errors-title');await heading.scrollIntoViewIfNeeded();await focus(await heading.boundingBox());}
    return;
  }
  if(guide.id==='api-customer') {
    const data={name:'عميل API التجريبي',phone:'966555000088'};
    if(index===0)await showResponse({method:'POST',path:'/api/v1/customers',requestBody:data,authorization:'Bearer YOUR_API_KEY'});
    if(index===1){const r=await p.request.post(api.base+'/api/v1/customers',{headers:{Authorization:`Bearer ${api.key}`},data});if(r.status()!==200)throw Error('Customer API demo failed');await showResponse({method:'POST',path:'/api/v1/customers',status:r.status(),body:await r.json()});}
    if(index===2){await p.locator('#tutorial-api-result').evaluateAll(els=>els.forEach(el=>el.remove()));await click(p.locator('.dashboard-sidebar nav').getByRole('button',{name:'العملاء والوسوم',exact:true}));await p.getByPlaceholder('بحث باسم العميل، الرقم، أو الوسم...').waitFor();await p.reload();await fill(p.getByPlaceholder('بحث باسم العميل، الرقم، أو الوسم...'),'عميل API التجريبي');await p.getByRole('cell',{name:'عميل API التجريبي',exact:true}).waitFor();}
    return;
  }
  if(guide.id==='api-webhooks') {
    if(index===0) await fill(p.getByPlaceholder('https://example.com/webhooks/linkly'),'https://example.com/linkly-webhook');
    if(index===1) {await click(p.getByLabel('استلام رسالة',{exact:true}));await click(p.getByLabel('إغلاق محادثة',{exact:true}));await click(button('إضافة Webhook'));await click(button('إخفاء'));}
    if(index===2) {await click(button('إيقاف'));await click(button('تفعيل'));await click(button('السجل'));}
    if(index===3) {await click(button('حذف'));await openDocs();await p.getByRole('heading',{name:/Webhooks|توقيع/}).last().scrollIntoViewIfNeeded();}
    return;
  }
  const channelNames = {whatsapp:'واتساب',instagram:'إنستغرام',facebook:'فيسبوك',gmail:'جيميل',x:'إكس',tiktok:'تيك توك',youtube:'يوتيوب',telegram:'تيليجرام',website:'الموقع الإلكتروني','google-maps':'خرائط جوجل',sms:'الرسائل النصية',linkedin:'لينكد إن'};
  if (guide.category === 'القنوات') {
    const card=p.locator('.channel-connect-card').filter({hasText:channelNames[guide.id]});
    if(await card.count()) {await card.first().scrollIntoViewIfNeeded();await focus(await card.first().boundingBox());if(index===1){const action=card.getByRole('button').first();if(await action.count() && await action.isEnabled()){if(['instagram','facebook','gmail','x','tiktok','youtube'].includes(guide.id))await focus(await action.boundingBox());else await click(action);}}}
    if(index===2 && guide.id==='telegram'){const inputs=p.getByRole('dialog').locator('input[type="text"],input[type="password"]');if(await inputs.count())await fill(inputs.first(),'رمز البوت التدريبي — لا يستخدم للربط');}
    return;
  }
  if(['salla','zid','shopify'].includes(guide.id)) {
    if(index===0) await click(p.locator('.meta-test-card').filter({hasText:guide.id==='salla'?'سلة':guide.id==='zid'?'زد':'شوبيفاي'}).getByRole('button'));
    if(index===1) await click(p.getByRole('tab',{name:'الربط',exact:true}));
    if(index===2) await click(p.getByRole('tab',{name:'إشعارات الطلب',exact:true}));
    if(index===3) await click(p.getByRole('tab',{name:'السلات المتروكة',exact:true}));
    return;
  }
  if(guide.id==='events') {
    if(index===0)await click(p.locator('.meta-test-card').filter({hasText:'ميتا (فيسبوك وإنستغرام)'}).getByRole('button'));
    if(index===1) await click(p.getByRole('tab',{name:'استقبال العملاء',exact:true}));
    if(index===2) await click(p.getByRole('tab',{name:'ربط الأحداث',exact:true}));
    if(index===3) {const input=p.getByRole('dialog').locator('input').filter({visible:true}).first();if(await input.count()) await fill(input,'DEMO_ONLY');}
    return;
  }
  if(guide.id==='automations') {
    if(index===0)await click(button('＋ إنشاء أتمتة'));
    if(index===1){await fill(p.getByPlaceholder('مثال: توزيع محادثات المبيعات'),'قاعدة تدريبية');await click(button('التالي'));await click(button('التالي'));}
    if(index===2){await click(button('التالي'));}
    if(index===3){const toggle=p.getByRole('dialog').getByRole('checkbox');if(await toggle.isChecked())await click(toggle);await click(button('حفظ كمتوقفة'));await click(button('🧪 تجربة رسالة'));const input=p.getByRole('dialog').locator('textarea,input[type="text"]').first();if(await input.count())await fill(input,'مرحبًا، أحتاج مساعدة');}
    return;
  }
  const actions = {
    'quick-replies': ['إضافة رد سريع'], templates:['إنشاء قالب'], contacts:['إضافة عميل'], teams:['إضافة موظف'], hours:['إضافة جدول'], campaigns:['＋ حملة جديدة'], email:['＋ حملة بريد جديدة'], segments:['إضافة تقسيم'], catalog:['إضافة منتج'], knowledge:['إضافة عنصر'], automations:['＋ إنشاء أتمتة']
  };
  if(guide.id==='pipeline'){if(index===1)await click(p.getByRole('tab',{name:'داخل المنصة',exact:true}));if(index===2)await click(p.getByRole('tab',{name:/ربط منصة/}));return;}
  if(guide.id==='reports'){if(index===1)await click(button('آخر 30 يوماً'));if(index===2)await click(p.getByRole('tab',{name:'الآن (مركز العمليات)',exact:true}));return;}
  if(guide.id==='branding'){if(index===1)await fill(p.getByLabel('اسم العلامة التجارية'),'متجر التدريب');return;}
  if(guide.id==='inbox'){if(index===1){const input=p.locator('.dashboard-main input').first();if(await input.count())await fill(input,'عميل تجريبي');}if(index===2)await click(button('الفلاتر'));return;}
  const action=actions[guide.id];
  if(action && index===0){const target=button(action[0]);await target.evaluate(el=>el.scrollIntoView({block:'center',inline:'center'}));await focus(await target.boundingBox());}
  if(action && index===1) await click(button(action[0]));
  if(index>=2 && action) {
    const modal=p.getByRole('dialog').filter({visible:true}).first();
    const scope=await modal.count()?modal:p.locator('.dashboard-main');
    const inputs=scope.locator('input:not([type="file"]):not([type="checkbox"]):not([type="radio"]):not([type="hidden"])').filter({visible:true});
    for(let i=0;i<Math.min(await inputs.count(),2);i++){const input=inputs.nth(i);if(await input.isEditable()){const type=await input.getAttribute('type');await fill(input,type==='number'?'100':type==='tel'?'966555000077':type==='email'?'demo@example.com':type==='time'?'09:00':'مثال تدريبي');}}
    const textarea=scope.locator('textarea').filter({visible:true}).first();if(await textarea.count())await fill(textarea,'أهلًا بك، يسعدنا مساعدتك. هذا محتوى تجريبي لشرح الإعداد.');
    if(['quick-replies','contacts','knowledge','catalog','segments'].includes(guide.id)) {
      const submit=scope.locator('button[type="submit"]').filter({visible:true}).last();
      if(await submit.count() && await submit.isEnabled()) {await click(submit);await modal.waitFor({state:'hidden'});}
    }
  }
}

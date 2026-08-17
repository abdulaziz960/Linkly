import "./landing.css";

const landingMarkup = `<div class="landing" id="landingPage">
  <header class="topbar">
    <div class="topbar-inner">
      <div class="logo"><span class="logo-mark"><img src="/assets/audiencew-logo.svg" alt=""></span>AudienceW</div>
      <input class="nav-toggle" id="navToggle" type="checkbox" aria-label="فتح القائمة">
      <label class="menu-toggle" id="menuToggle" for="navToggle" aria-label="فتح القائمة">
        <span></span><span></span><span></span>
      </label>
      <nav class="nav-links">
        <a href="#channels">القنوات</a>
        <a href="#workflow">طريقة الشغل</a>
        <a href="#pricing">الأسعار</a>
        <a href="#faq">أسئلة</a>
      </nav>
      <a class="btn ghost" href="/dashboard">دخول</a>
      <a class="btn primary" href="#trial">جرّبها</a>
    </div>
  </header>

  <main>
    <section class="hero wrap">
      <div>
        <span class="eyebrow">واتساب · إنستقرام · تقييمات قوقل</span>
        <h1>عميلك يكتب لك من ثلاث أماكن، وأنت <em>تتابعها من مكان واحد</em></h1>
        <p>رسالة واتساب، تعليق إنستقرام، تقييم على خرائط قوقل — كلها توصل لصندوق وارد واحد، توزّعها على فريقك، وترد قبل ما يمل العميل من الانتظار.</p>
        <div class="hero-actions">
          <a class="btn primary" href="#trial">جرّب AudienceW مجانًا</a>
          <a class="btn ghost" href="#channels">شوف كيف تشتغل</a>
        </div>
        <div class="hero-note">لا حاجة لبطاقة دفع الآن · فريقنا يجهز لك القنوات بنفسه</div>
        <div class="hero-metrics">
          <div class="metric"><b>٣</b><span>قنوات تربطها بدقايق</span></div>
          <div class="metric"><b>واحد</b><span>صندوق وارد لكل الفريق</span></div>
          <div class="metric"><b>صفر</b><span>رسائل تضيع بين التطبيقات</span></div>
        </div>
      </div>
      <div class="product-shot">
        <div class="shot-head"><span class="dot"></span><span class="dot"></span><span class="dot"></span><strong>صندوق الوارد</strong></div>
        <div class="shot-body">
          <div class="shot-row"><div class="shot-avatar">و</div><div><b>سارة</b><p>أبغى أعرف تفاصيل باقة النمو، عندكم فريق مبيعات؟</p></div><span class="pill">واتساب</span></div>
          <div class="shot-row"><div class="shot-avatar">إ</div><div><b>@rakan.st</b><p>هل التوصيل متاح للرياض؟ علّق تحت البوست</p></div><span class="pill">إنستقرام</span></div>
          <div class="shot-row"><div class="shot-avatar">ق</div><div><b>تقييم جديد</b><p>٥ نجوم — «خدمة سريعة ورد ممتاز، جربتهم مرتين»</p></div><span class="pill">قوقل</span></div>
          <div class="shot-row"><div class="shot-avatar">ن</div><div><b>أُسندت لنورة</b><p>محادثة سارة انتقلت لقسم المبيعات ووُسمت «مهتمة»</p></div><span class="pill">فريق الدعم</span></div>
        </div>
      </div>
    </section>

    <section class="section first wrap" id="channels">
      <div class="section-head">
        <span>القنوات</span>
        <h2>ثلاث قنوات، كل وحدة فيها طبيعة مختلفة</h2>
        <p class="section-lead">ما نحاول نخليها متشابهة بالقوة. كل قناة تظهر بالشكل اللي يناسبها، لكن الرد والإسناد والمتابعة بنفس الطريقة.</p>
      </div>
      <div class="channel-grid">
        <div class="channel-card lead">
          <span class="channel-tag">الأكثر استخدامًا</span>
          <h3>واتساب بزنس</h3>
          <p>رسائل، قوالب رسمية، مرفقات وتسجيلات صوتية، ونافذة الـ٢٤ ساعة واضحة داخل كل محادثة بدل ما تتفاجئ إنها انتهت.</p>
        </div>
        <div class="channel-card">
          <span class="channel-tag">رسائل وتعليقات</span>
          <h3>إنستقرام</h3>
          <p>الرسائل الخاصة والتعليقات على المنشورات توصلك بنفس الصندوق، مع اسم الحساب وسياق المنشور اللي علّق تحته.</p>
        </div>
        <div class="channel-card">
          <span class="channel-tag">سمعة النشاط</span>
          <h3>تقييمات خرائط قوقل</h3>
          <p>تقييم جديد بخمس نجوم أو بشكوى؟ يوصلك فورًا وترد عليه باسم نشاطك التجاري بدل ما يفوتك أسبوع.</p>
        </div>
      </div>
    </section>

    <section class="section wrap">
      <div class="story">
        <p class="story-quote">"كنت أفتح ثلاث تطبيقات كل صباح، وأنسى أرد على تعليقات إنستقرام غالبًا."</p>
        <div class="story-body">
          <p>هذا اللي يصير مع أغلب الفرق: <strong>مو إن الرسائل كثيرة، المشكلة إنها متفرقة.</strong> رسالة هنا، تعليق هناك، تقييم ما أحد شافه إلا بعد أسبوع.</p>
          <p>AudienceW ما يلغي القنوات ولا يبدّلها بشات بوت غريب — يجمعها بمكان واحد فيه <strong>حالة واضحة لكل محادثة</strong> (مين ردّ، مين ينتظر، مين أُغلقت)، ووسوم وإسناد تعرف فيها مين مسؤول عن كل عميل.</p>
        </div>
      </div>
    </section>

    <section class="section wrap" id="workflow">
      <div class="section-head">
        <span>طريقة الشغل</span>
        <h2>من أول ربط لحد أول رد، أربع خطوات</h2>
      </div>
      <div class="timeline">
        <div class="tl-step"><b>١</b><h3>اربط قنواتك</h3><p>واتساب وإنستقرام عبر Meta، وخرائط قوقل عبر Google Business Profile.</p></div>
        <div class="tl-step"><b>٢</b><h3>أضف فريقك</h3><p>حدد الموظفين والأقسام، وحدد مين يشوف مين من المحادثات.</p></div>
        <div class="tl-step"><b>٣</b><h3>جهّز ردودك الجاهزة</h3><p>ردود سريعة وقوالب لأكثر الأسئلة تكرارًا، جاهزة قبل ما تحتاجها.</p></div>
        <div class="tl-step"><b>٤</b><h3>راقب وطوّر</h3><p>زمن الرد، مين متأخر، ومن وين توصلك أغلب الاستفسارات.</p></div>
      </div>
    </section>

    <section class="section wrap">
      <div class="section-head">
        <span>أمثلة حقيقية</span>
        <h2>هذا اللي يصير جوّا الصندوق فعليًا</h2>
      </div>
      <div class="examples">
        <div class="message-card">
          <div class="message-top"><strong>رسالة واتساب</strong><span class="pill">مبيعات</span></div>
          <div class="message-bubble">أهلًا سارة، شفنا اهتمامك بباقة النمو. تناسبك مكالمة ٥ دقايق اليوم العصر؟</div>
          <div class="mini-stat"><span>وقت الرد</span><b>أقل من دقيقتين</b></div>
        </div>
        <div class="message-card">
          <div class="message-top"><strong>تعليق إنستقرام</strong><span class="pill">دعم</span></div>
          <div class="message-bubble">تم الرد على تعليق @rakan.st المرتبط بمنشور "عرض نهاية الأسبوع": التوصيل متاح للرياض وجدة.</div>
          <div class="mini-stat"><span>ربط تلقائي</span><b>بالمنشور نفسه</b></div>
        </div>
        <div class="message-card">
          <div class="message-top"><strong>تقييم قوقل</strong><span class="pill">سمعة</span></div>
          <div class="message-bubble">شكرًا لك! يسعدنا إنك جربتنا مرتين ورضيت عن الخدمة. بانتظار زيارتك الجاية.</div>
          <div class="mini-stat"><span>تقييمات هالأسبوع</span><b>١٨</b></div>
        </div>
      </div>
    </section>

    <section class="section wrap" id="pricing">
      <div class="section-head">
        <span>الأسعار</span>
        <h2>اختر حسب حجم فريقك، مو حسب توقعاتنا لك</h2>
      </div>
      <div class="pricing" id="landingPlans">
        <div class="plan">
          <div class="plan-name"><h3>البداية</h3></div>
          <p class="plan-lead">لصاحب المشروع اللي يرد بنفسه أو بموظف أو اثنين.</p>
          <div class="plan-price"><b>١٩٩</b><span>ريال / شهريًا</span></div>
          <ul>
            <li>٣ مستخدمين</li>
            <li>صندوق وارد مشترك</li>
            <li>ربط واتساب</li>
            <li>ردود سريعة ووسوم</li>
            <li>تقارير أساسية</li>
          </ul>
          <a class="btn ghost" href="#trial">ابدأ بهذي</a>
        </div>
        <div class="plan featured">
          <div class="plan-name"><h3>النمو</h3><span class="plan-tag">الأكثر اختيارًا</span></div>
          <p class="plan-lead">لفريق يوزّع المحادثات ويحتاج واتساب وإنستقرام مع بعض.</p>
          <div class="plan-price"><b>٤٩٩</b><span>ريال / شهريًا</span></div>
          <ul>
            <li>حتى ١٠ مستخدمين</li>
            <li>واتساب + إنستقرام</li>
            <li>توزيع المحادثات على الفريق</li>
            <li>رد آلي وقواعد تحويل</li>
            <li>تقارير أداء ومؤشر SLA</li>
          </ul>
          <a class="btn primary" href="#trial">ابدأ بهذي</a>
        </div>
        <div class="plan">
          <div class="plan-name"><h3>التوسّع</h3></div>
          <p class="plan-lead">لشركة عندها أكثر من فرع وتحتاج تكاملات إضافية.</p>
          <div class="plan-price"><b>٩٩٩</b><span>ريال / شهريًا</span></div>
          <ul>
            <li>حتى ٣٠ مستخدم</li>
            <li>واتساب + إنستقرام + قوقل</li>
            <li>فروع وفرق متعددة</li>
            <li>Webhooks و API</li>
            <li>دعم أولوية</li>
          </ul>
          <a class="btn ghost" href="#trial">ابدأ بهذي</a>
        </div>
      </div>
      <p class="pricing-note">رسوم رسائل واتساب الرسمية، إن وُجدت، تُحسب حسب تسعير Meta بشكل منفصل عن الاشتراك.</p>
    </section>

    <section class="section wrap" id="trial">
      <div class="trial-panel">
        <aside class="trial-side">
          <div>
            <span class="eyebrow">يبدأ خلال دقايق</span>
            <h2 id="authTitle">جرّب AudienceW</h2>
            <p>عبّي بيانات نشاطك، ونحدد معك القنوات المناسبة قبل أي اشتراك.</p>
          </div>
          <ul>
            <li>تجربة مخصصة حسب قنواتك الحالية</li>
            <li>مراجعة أولية لطريقة تواصلك مع عملائك</li>
            <li>نساعدك تختار الباقة المناسبة</li>
          </ul>
        </aside>
        <section class="trial-form">
          <h2 id="authModeTitle">بيانات التواصل</h2>
          <p>خلّها مختصرة — نحتاجها فقط عشان نرتب التجربة ونفهم حجم فريقك وقنواتك.</p>
          <form id="trialForm" class="form-grid">
            <input type="hidden" name="intent" value="trial">
            <input type="hidden" name="auth_provider" value="form">
            <input type="hidden" name="plan_name" value="النمو">
            <label>اسم النشاط<input name="company_name" required placeholder="مثال: متجر الجودة"></label>
            <label>اسمك<input name="contact_name" required placeholder="اسمك الكامل"></label>
            <label>البريد الإلكتروني<input name="email" type="email" required placeholder="name@company.com"></label>
            <label>رقم الجوال<input name="phone" required placeholder="05xxxxxxxx"></label>
            <div class="choice-field">
              <div class="choice-title">حجم فريقك</div>
              <div class="choice-grid">
                <label class="choice-option"><input type="radio" name="team_size" value="1-3" checked><b>١-٣</b><span>فريق صغير</span></label>
                <label class="choice-option"><input type="radio" name="team_size" value="4-10"><b>٤-١٠</b><span>تشغيل يومي</span></label>
                <label class="choice-option"><input type="radio" name="team_size" value="11-30"><b>١١-٣٠</b><span>عدة أقسام</span></label>
                <label class="choice-option"><input type="radio" name="team_size" value="30+"><b>٣٠+</b><span>حجم كبير</span></label>
              </div>
            </div>
            <div class="choice-field">
              <div class="choice-title">القنوات اللي تحتاجها</div>
              <div class="choice-grid plans">
                <label class="choice-option"><input type="checkbox" name="channels" value="واتساب" checked><b>واتساب</b><span>رسائل وقوالب</span></label>
                <label class="choice-option"><input type="checkbox" name="channels" value="إنستقرام"><b>إنستقرام</b><span>رسائل وتعليقات</span></label>
                <label class="choice-option"><input type="checkbox" name="channels" value="Google Maps"><b>خرائط قوقل</b><span>تقييمات وردود</span></label>
              </div>
            </div>
            <label class="full"><button class="btn primary" type="submit" style="width:100%">أرسل طلب التجربة</button></label>
          </form>
          <p class="form-note">بعد الإرسال، يتواصل معك فريقنا خلال يوم عمل لتجهيز تجربة مناسبة لقنواتك وطريقة شغلك.</p>
        </section>
      </div>
    </section>

    <section class="section wrap" id="readiness">
      <div class="section-head">
        <span>جاهزية المنصة</span>
        <h2>هذا وضع القنوات الحين، بدون تجميل</h2>
        <p class="section-lead">النسخة اللايف شغالة، وكل قناة تحتاج مفاتيحها الرسمية من Meta أو Google عند ربطها لحساب العميل.</p>
      </div>
      <div class="status-grid">
        <div class="status-panel">
          <h3>القنوات في لوحة الربط</h3>
          <p>ابدأ بواتساب، ثم وسّع لإنستقرام وخرائط قوقل وبقية القنوات حسب حاجتك.</p>
          <div class="status-list">
            <div class="status-row"><span class="status-icon">و</span><div><b>واتساب Cloud API</b><span>رسائل، قوالب، واختبار إرسال</span></div><span class="chip">جاهز</span></div>
            <div class="status-row"><span class="status-icon">إ</span><div><b>إنستقرام وفيسبوك</b><span>رسائل وتعليقات عبر Meta</span></div><span class="chip">جاهز</span></div>
            <div class="status-row"><span class="status-icon">ب</span><div><b>البريد الإلكتروني</b><span>ربط Gmail مباشر، إرسال واستقبال</span></div><span class="chip">جاهز</span></div>
            <div class="status-row"><span class="status-icon">ق</span><div><b>تقييمات خرائط قوقل</b><span>مزامنة والرد من المنصة</span></div><span class="chip">جاهز</span></div>
            <div class="status-row"><span class="status-icon">آ</span><div><b>الرد الآلي</b><span>سيناريوهات ترحيب وتحويل تلقائي لكل قناة</span></div><span class="chip">جاهز</span></div>
            <div class="status-row"><span class="status-icon">+</span><div><b>Telegram وX وTikTok وSMS وودجت الموقع</b><span>جاهزة للربط، تحتاج مفاتيح كل مزود</span></div><span class="chip pending">تحتاج مفاتيح</span></div>
          </div>
        </div>
        <div class="status-panel">
          <h3>حالة الإطلاق</h3>
          <p>النسخة الإنتاجية منشورة ومربوطة بالدومين الرسمي.</p>
          <div class="live-box">
            <div><span>الدومين الرسمي</span><b>audiencew.audience.sa</b></div>
            <div><span>حالة الخدمة</span><b>Online</b></div>
            <div><span>بيئة التشغيل</span><b>Vercel</b></div>
          </div>
          <div class="status-actions">
            <a class="btn primary" href="/dashboard">فتح لوحة التحكم</a>
            <a class="btn ghost" href="#trial">اطلب إعداد القنوات</a>
          </div>
        </div>
      </div>
    </section>

    <section class="section wrap" id="faq">
      <div class="section-head">
        <span>أسئلة</span>
        <h2>أسئلة يسألها أغلب العملاء</h2>
      </div>
      <div class="faq">
        <div class="faq-item"><h3>ردّي على تعليقات إنستقرام يفوتني كثير، تحلّونها؟</h3><p>التعليق يوصلك بنفس صندوق واتساب، مربوط بالمنشور واسم صاحب الحساب — ما تحتاج تفتح تطبيق ثاني.</p></div>
        <div class="faq-item"><h3>لو ما عندي خرائط قوقل مفعّلة بعد؟</h3><p>نساعدك تربط Google Business Profile وقت التجربة، وبعدها تبدأ التقييمات توصل المنصة تلقائيًا.</p></div>
        <div class="faq-item"><h3>يقدر أكثر من موظف يشتغل بنفس الوقت؟</h3><p>إي، توزّع المحادثات على فريقك حسب القسم أو حالة الموظف، وكل واحد يشوف بس اللي مسؤول عنه.</p></div>
        <div class="faq-item"><h3>فيه رد آلي خارج أوقات الدوام؟</h3><p>إي، تحدد رسالة ترحيب وخارج الدوام، وتحويل تلقائي لموظف أو قسم معيّن حسب نوع الاستفسار.</p></div>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <div class="footer-inner">
      <div>
        <div class="logo"><span class="logo-mark"><img src="/assets/audiencew-logo-light.svg" alt=""></span>AudienceW</div>
        <p>منصة لإدارة محادثات العملاء عبر واتساب بزنس وإنستقرام وتقييمات خرائط قوقل، لفرق الدعم والمبيعات اللي تبي تشتغل من مكان واحد.</p>
      </div>
      <nav class="footer-links" aria-label="روابط مهمة">
        <a href="/privacy">سياسة الخصوصية</a>
        <a href="/terms">شروط الاستخدام</a>
        <a href="/data-deletion">حذف البيانات</a>
        <a href="#trial">تواصل معنا</a>
      </nav>
      <p class="footer-note">جميع الحقوق محفوظة لشركة الجمهور المخصص للدعاية والإعلان.</p>
    </div>
  </footer>
</div>`;

export default function HomePage() {
  return <div dangerouslySetInnerHTML={{ __html: landingMarkup }} />;
}

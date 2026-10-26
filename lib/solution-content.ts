import type { Metadata } from "next";

type Locale = { title: string; description: string; sections: { title: string; paragraphs: string[] }[]; checklist: string[] };
export type Solution = { slug: string; ar: Locale; en: Locale };

export const solutions: Solution[] = [
  {
    slug: "whatsapp-team-inbox",
    ar: {
      title: "إدارة واتساب لفريق خدمة العملاء من صندوق واحد",
      description: "دليل عملي لتنظيم محادثات واتساب بين الموظفين: متطلبات الربط، اختيار الباقة، توزيع المسؤوليات، ومراجعة الرسائل والتكلفة قبل بدء العمل.",
      sections: [
        { title: "متى تحتاج إلى صندوق مشترك؟", paragraphs: ["إذا كان أكثر من موظف يتابع نفس العملاء، يصبح السؤال المهم: من المسؤول عن كل محادثة وما الذي ينتظر التنفيذ؟ يجمع لنكلي سياق المحادثة والوسوم والحالة في مساحة واحدة، لتسليم المتابعة بين أفراد الفريق دون الاعتماد على رسائل جانبية أو ذاكرة الموظف.", "ابدأ بمسار واحد، مثل استفسارات الطلبات. اتفق مع الفريق على معنى المحادثة الجديدة والمفتوحة والمحلولة، وعلى وقت التصعيد. وجود نظام لا يغني عن تحديد هذه المسؤوليات."] },
        { title: "جهّز حساباتك واختر السعة المناسبة", paragraphs: ["راجع مع فريقنا حالة رقم واتساب وحساب Meta للأعمال وصلاحيات الشخص المسؤول عن الربط. صلاحية استخدام الرقم الحالي ومسار نقله أو ربطه يعتمدان على حالته ومتطلبات Meta؛ لا تفصل رقمًا مستخدمًا قبل مراجعة الخطوات.", "باقة الأفراد مخصصة لمستخدم واحد. لفريق متعدد المستخدمين اختر الباقة المناسبة من مقارنة الأسعار، وراجع عدد الموظفين والقنوات وحدود الأتمتة. رسوم قوالب واتساب التي تفرضها Meta منفصلة عن الاشتراك، كما أن الأسعار المعروضة لا تشمل الضريبة."] },
        { title: "اختبر دورة محادثة كاملة", paragraphs: ["بعد إنشاء الحساب وتفعيله، اربط واتساب من إعدادات التكاملات، ثم أضف الموظفين بأدوار مناسبة. أرسل استفسارًا من رقم اختبار تملكه، وتأكد من وصوله إلى الصندوق وإسناده للموظف المقصود. جرّب الرد، وإضافة وسم، وتسليم المتابعة لموظف آخر، ثم حل المحادثة.", "راجع متابعة العميل بعد نافذة خدمة واتساب: قد تحتاج إلى قالب معتمد حسب نوع الرسالة وسياسات Meta. لا تفترض أن أي رد أو حملة يمكن إرسالها بلا قيود لمجرد اتصال القناة."] },
        { title: "قِس ما تغيّر قبل توسيع الاستخدام", paragraphs: ["قارن زمن أول رد وعدد المحادثات التي بقيت دون مسؤول قبل التجربة وبعدها خلال ساعات عمل متشابهة. استخدم عدد محادثات كافيًا لفهم سير العمل، وسجّل أسباب التأخير بدل نسب كل تغيير إلى الأداة.", "التجربة ثلاثة أيام تبدأ عند إنشاء الحساب؛ جهّز صلاحيات الربط قبل البدء، وتواصل معنا إذا احتجت مساعدة. لا تُرسل كلمة مرورك أو رموز التحقق في المحادثة مع الدعم."] }
      ],
      checklist: ["مراجعة أهلية الرقم وصلاحيات Meta", "اختيار باقة تستوعب الفريق", "استقبال رسالة وإسنادها والرد عليها", "مراجعة تكلفة القوالب وساعات العمل"]
    },
    en: {
      title: "A shared WhatsApp inbox for your support team",
      description: "Set up a shared WhatsApp workflow: check connection requirements, choose team capacity, assign conversations and verify messaging costs before launch.",
      sections: [
        { title: "Start with ownership, not just another inbox", paragraphs: ["When several employees help the same customers, every conversation needs an owner and a next action. Linkly brings the conversation, tags and status into one workspace so a handover does not depend on a separate message or someone's memory.", "Start with one workflow, such as order enquiries. Agree what new, open and resolved mean, who takes over an unanswered conversation and when escalation should happen."] },
        { title: "Prepare your accounts and choose capacity", paragraphs: ["Review your WhatsApp number, Meta business account and connection permissions with our team. Whether an existing number can be connected or needs migration depends on its current setup and Meta's requirements. Do not disconnect a working number before reviewing the process.", "Individuals includes one user. For a team, compare user capacity, channels and automation limits before selecting a plan. Meta's WhatsApp template charges are separate from the subscription, and displayed subscription prices exclude VAT."] },
        { title: "Test a complete conversation", paragraphs: ["Create and activate the account, connect WhatsApp in integrations, then invite employees with appropriate roles. Send a message from a test number you control. Confirm receipt, assignment to the right employee, a reply, tagging, handover and resolution.", "Check follow-up outside WhatsApp's service window. An approved template may be required depending on the message and Meta's policies. A connected channel does not remove restrictions on sending messages or campaigns."] },
        { title: "Measure before expanding", paragraphs: ["Compare first-response time and unassigned conversations over comparable business hours. Use enough conversations to understand the workflow, and record why delays occur rather than attributing every change to software.", "The three-day trial starts at account creation. Prepare connection permissions beforehand and contact us for setup help. Never send passwords or verification codes to support."] }
      ],
      checklist: ["Review number eligibility and Meta permissions", "Choose enough seats for the team", "Receive, assign and answer a test message", "Review template costs and business hours"]
    }
  },
  {
    slug: "instagram-customer-service",
    ar: {
      title: "تنظيم محادثات إنستغرام ومتابعة العملاء",
      description: "حوّل استفسارات إنستغرام إلى متابعة واضحة لفريق المبيعات والدعم. تعرّف على الربط والصلاحيات والتوزيع والاختبار واختيار الباقة المناسبة.",
      sections: [
        { title: "من رسالة خاصة إلى متابعة واضحة", paragraphs: ["قد يبدأ العميل بسؤال عن منتج على إنستغرام ثم يحتاج إلى سعر أو متابعة طلب. في صندوق لنكلي يستطيع الفريق قراءة السياق وتحديد المسؤول وإضافة الوسوم والحالة. الهدف أن يعرف الموظف التالي ما تم الاتفاق عليه وما بقي.", "اختر وسومًا قليلة تعبّر عن العمل الفعلي، مثل استفسار منتج أو طلب قائم أو يحتاج متابعة. كثرة الوسوم دون اتفاق على استخدامها تجعل البحث والتقارير أصعب."] },
        { title: "متطلبات الربط والباقة", paragraphs: ["تحتاج إلى حساب إنستغرام مؤهل للربط والصلاحيات التي تطلبها Meta أثناء الاتصال. استخدم حساب المسؤول المناسب وأكمل شاشة الموافقة الرسمية؛ لا تشارك بيانات تسجيل الدخول مع الموظفين أو الدعم. راجع حالة الربط إذا تغيّرت الصلاحيات لاحقًا.", "إنستغرام متاح بدءًا من الباقة العادية وفق مقارنة الباقات الحالية. راجع عدد المستخدمين والقنوات والأتمتة قبل الاشتراك. حدود المراسلة وإمكانية الرد على أنواع التفاعل تبقى خاضعة لما تسمح به المنصة."] },
        { title: "اختبار قبل استقبال الفريق للعملاء", paragraphs: ["اربط الحساب من إعدادات التكاملات، ثم أرسل رسالة خاصة من حساب اختبار مختلف. تحقق من وصول الرسالة إلى القناة الصحيحة، ومن قدرة الموظف المصرح له على الرد. جرّب أيضًا التعليقات إذا كنت ستستخدم إدارتها في سير عملك، وتأكد من التمييز بينها وبين الرسائل الخاصة.", "اختبر تسليم المحادثة بين موظفين وإضافة وسم وإغلاقها بعد الحل. إذا لم يصل تفاعل، راجع الصلاحيات وحالة الربط أولًا قبل إعادة الاتصال. احتفظ بوقت الاختبار ونوع التفاعل لمساعدة الدعم على التشخيص دون إرسال بيانات عميل حقيقية."] },
        { title: "اجعل الوعود قابلة للمتابعة", paragraphs: ["إذا وعد الموظف العميل بعرض أو متابعة، سجّل الخطوة التالية داخل سياق العمل وحدد مسؤولًا عنها. استخدم ردودًا سريعة للأسئلة المتكررة، لكن راجع السعر والتوفر قبل إرسالها.", "تابع المحادثات المتأخرة وعدد عمليات التسليم التي لم تكتمل. يمكنك مقارنة أسلوب العمل الجديد بالطريقة السابقة خلال ساعات عمل متشابهة. اطلب عرضًا توضيحيًا من الفريق إذا احتجت مراجعة سيناريو نشاطك قبل التجربة."] }
      ],
      checklist: ["حساب مؤهل وصلاحيات ربط صحيحة", "باقة تشمل إنستغرام وعدد الموظفين", "اختبار الرسائل والتعليقات المطلوبة", "تعريف مسؤول المتابعة والوسوم"]
    },
    en: {
      title: "Organize Instagram conversations and follow-up",
      description: "Turn Instagram enquiries into a clear support workflow. Review connection permissions, team routing, testing and plan capacity before getting started.",
      sections: [
        { title: "Give every enquiry a next step", paragraphs: ["An Instagram enquiry may begin with a product question and continue into pricing or order support. Linkly keeps context, ownership, tags and status together so the next employee can see what was agreed and what remains to be done.", "Choose a few meaningful tags, such as product enquiry, existing order and follow-up needed. Too many tags without a shared definition make search and reporting harder."] },
        { title: "Check connection requirements and your plan", paragraphs: ["Use an Instagram account eligible for connection and grant the permissions requested by Meta through its official connection flow. Use the correct administrator account and do not share login credentials with employees or support. Recheck the connection if permissions later change.", "Instagram is included from the Regular plan in the current comparison. Review user capacity, channels and automation limits. Messaging limits and supported interactions remain subject to the platform's permissions and policies."] },
        { title: "Test before the team goes live", paragraphs: ["Connect the account in integrations, then send a private message from a separate test account. Check that it reaches the right channel and that an authorized employee can reply. If comments are part of your workflow, test them separately and distinguish them from private messages.", "Try handing the conversation to another employee, tagging it and resolving it. If an interaction is missing, review permissions and connection status before reconnecting. Record its time and type for support without sending real customer data."] },
        { title: "Make promises traceable", paragraphs: ["When an employee promises a quote or a follow-up, record the next step and its owner. Quick replies help with common questions, but check current pricing and availability before sending.", "Track delayed conversations and incomplete handovers over comparable business hours. Request a walkthrough if you need to review your business scenario before starting the trial."] }
      ],
      checklist: ["Eligible account and connection permissions", "A plan with Instagram and sufficient users", "Test the messages and comments you need", "Agree follow-up ownership and tags"]
    }
  },
  {
    slug: "salla-whatsapp-notifications",
    ar: {
      title: "ربط سلة بإشعارات واتساب ومتابعة الطلبات",
      description: "افهم تكامل سلة في لنكلي: متابعة الطلبات وإشعارات واتساب والسلات المتروكة، والفرق عن كتالوج المنتجات، مع خطوات اختبار وتوضيح الرسوم.",
      sections: [
        { title: "ما الذي يشمله ربط سلة؟", paragraphs: ["يساعد تكامل سلة فريقك على متابعة الطلب والشحن ضمن سياق محادثة العميل، وتشغيل إشعارات واتساب وتذكيرات السلات المتروكة وفق الإعدادات التي تختارها. ربط سلة لهذه الوظائف متاح في جميع الباقات؛ عدد الموظفين وبقية الأدوات يختلف حسب الباقة.", "كتالوج المنتجات والشراء من واتساب ميزة مختلفة تبدأ من باقة المؤسسات الكبيرة. لا تخلط بين وصول بيانات الطلب وإشعاراته وبين عرض كتالوج للبيع داخل واتساب. تكاملا زد وشوبيفاي مذكوران كميزات قادمة."] },
        { title: "قبل تشغيل الإشعارات", paragraphs: ["جهّز صلاحية إدارة المتجر وحساب واتساب للأعمال المناسب، ثم أكمل الربط من شاشة التكاملات أو المسار الرسمي المتاح لمتجرك. اقرأ الصلاحيات قبل الموافقة وراجع نجاح اتصال المتجر وقناة واتساب كلٍّ على حدة.", "اختر أحداثًا واضحة للإشعار، مثل تحديث حالة الطلب أو الشحن. راجع القالب ومحتواه ورقم الطلب وبيانات التوصيل التي يحتاجها العميل. لا تتضمن الرسالة بيانات حساسة لا تساعده على متابعة الطلب."] },
        { title: "اختبر الطلب والسلة المتروكة منفصلين", paragraphs: ["استخدم طلب اختبار ورقمًا تملكه. غيّر حالة الطلب بالطريقة المعتادة في المتجر وتحقق من وصول إشعار واحد بالمحتوى الصحيح. راجع ظهور معلومات الطلب داخل سياق المتابعة ثم اختبر حالة أخرى، بدل تشغيل كل الأحداث دفعة واحدة.", "لتذكير السلة المتروكة، تحقق من شروط تشغيل التذكير وتوقيته ومن أن رسالة الاختبار تناسب العميل. راقب الرسائل المكررة أو المتأخرة قبل توسيع التشغيل. إذا كانت هناك مشكلة، جهّز وقت الحدث ومعرّف طلب الاختبار للدعم."] },
        { title: "الرسوم وحدود الإرسال", paragraphs: ["اشتراك لنكلي ورسوم قوالب WhatsApp التي تفرضها Meta بندان منفصلان. راجع نوع القالب وأي تكلفة لدى Meta، والضريبة وحدود رصيد الرسائل في صفحة الأسعار؛ لا تعتبر الإشعارات غير محدودة بمجرد توفر تكامل سلة.", "الرسائل التسويقية تحتاج مراجعة موافقة العميل وآلية التوقف، وتظل خاضعة لسياسات المنصة. ابدأ بمجموعة اختبار صغيرة، وقِس نجاح التسليم وعدد استفسارات حالة الطلب قبل الحكم على النتيجة."] }
      ],
      checklist: ["صلاحيات المتجر وقناة واتساب جاهزة", "تمييز إشعارات الطلب عن الكتالوج", "طلب اختبار وإشعار واحد صحيح", "مراجعة القوالب والتكلفة وحدود الإرسال"]
    },
    en: {
      title: "Connect Salla orders to WhatsApp updates",
      description: "Understand Salla order updates, WhatsApp notifications and abandoned carts in Linkly, how they differ from the product catalog, and what to test before launch.",
      sections: [
        { title: "What the Salla connection includes", paragraphs: ["Salla integration helps your team follow orders and shipping in the customer conversation, with WhatsApp updates and abandoned-cart reminders based on your settings. These Salla features are available on every plan; user capacity and other tools differ by plan.", "The product catalog and buying on WhatsApp are separate features starting on Large Enterprises. Receiving order information is different from offering a shopping catalog in WhatsApp. Zid and Shopify integrations are listed as coming soon."] },
        { title: "Before enabling notifications", paragraphs: ["Prepare store administration permissions and the appropriate WhatsApp business account. Connect through integrations or the official flow available for your store. Review the permissions and confirm the store connection and WhatsApp connection separately.", "Choose explicit notification events, such as order or shipping status updates. Review the template, order reference and delivery details the customer needs. Avoid including sensitive information that does not help the customer follow the order."] },
        { title: "Test orders and abandoned carts separately", paragraphs: ["Use a test order and a phone number you control. Change its status through the normal store workflow and check that one notification arrives with the correct content. Check the order context available for follow-up before enabling more events.", "For abandoned-cart reminders, review the trigger, timing and message. Look for duplicate or delayed messages before expanding the rollout. Keep the test order reference and event time ready if support is needed."] },
        { title: "Charges and sending limits", paragraphs: ["The Linkly subscription and Meta's WhatsApp template charges are separate. Review template type, any Meta fees, VAT and message allowances in pricing. Availability of the Salla connection does not mean unlimited notifications.", "Review customer consent and stopping rules for marketing messages, which remain subject to platform policies. Start with a small test group and measure delivery success and order-status enquiries before drawing conclusions."] }
      ],
      checklist: ["Store permissions and WhatsApp connection ready", "Order updates distinguished from the catalog", "One correct notification for a test order", "Review templates, charges and sending limits"]
    }
  },
  {
    slug: "whatsapp-campaigns",
    ar: {
      title: "حملات واتساب للأعمال بقوالب معتمدة ونتائج واضحة",
      description: "كيف ترسل حملة واتساب لجمهورك: قالب معتمد من Meta، جمهور من ملف أو شريحة، تكلفة واضحة قبل الإرسال، ومتابعة من وصلته الرسالة ومن قرأها ومن ردّ.",
      sections: [
        { title: "من الجمهور إلى الإرسال", paragraphs: ["ابدأ بقالب معتمد من Meta، ثم ارفع ملف أرقام بصيغة Excel أو CSV أو اختر شريحة جاهزة من عملائك. قبل الإرسال تظهر لك التكلفة المتوقعة ورصيدك الحالي، فتعرف إن كان الرصيد يكفي الجمهور."] },
        { title: "اعرف ماذا حدث بعد الإرسال", paragraphs: ["تعرض الحملة عدد الرسائل المُرسلة والواصلة والمقروءة ومن ردّ عليها، مع أسباب الفشل مجمّعة، مثل رقم غير مسجّل في واتساب أو رصيد غير كافٍ. وتُحسب التكلفة بالريال من الرسائل التي أُرسلت فعلًا."] },
        { title: "احترم من لا يريد الرسائل", paragraphs: ["إذا طلب العميل إيقاف الرسائل التسويقية فلن تصله حملاتك التالية. هذا يحمي سمعة رقمك لدى واتساب ويحميك من الشكاوى."] },
        { title: "الجدولة والرصيد", paragraphs: ["يُشحن رصيد الحملات بالرسالة ويقل سعر الرسالة كلما زادت الكمية. يمكنك جدولة حملة قادمة وتعديل موعدها أو إلغاؤها قبل أن تبدأ، وإعادة الإرسال للمستلمين الذين فشلت رسائلهم فقط. الحملات متاحة من الباقة العادية فأعلى، وتفاصيل الأسعار في صفحة الأسعار."] }
      ],
      checklist: ["قالب معتمد من Meta", "جمهور وافق على استقبال رسائلك", "رصيد يكفي عدد المستلمين", "حملة تجريبية على رقمك أولًا", "مراجعة النتائج بعد الإرسال"]
    },
    en: {
      title: "WhatsApp Business campaigns with approved templates and clear results",
      description: "How to send a WhatsApp campaign: a Meta-approved template, an audience from a file or segment, a clear cost before sending, and tracking of who received, read and replied.",
      sections: [
        { title: "From audience to send", paragraphs: ["Start with a Meta-approved template, then upload a numbers file in Excel or CSV or choose a ready segment of your customers. Before sending you see the estimated cost and your current balance, so you know whether it covers the audience."] },
        { title: "Know what happened after sending", paragraphs: ["A campaign shows how many messages were sent, delivered, read and answered, with failure reasons grouped, such as a number that is not on WhatsApp or an insufficient balance. The cost is calculated in riyals from the messages actually sent."] },
        { title: "Respect people who do not want messages", paragraphs: ["If a customer asks to stop marketing messages, your next campaigns skip them. That protects your number's reputation with WhatsApp and spares you complaints."] },
        { title: "Scheduling and balance", paragraphs: ["Campaign balance is topped up per message and the per-message price falls as the amount grows. You can schedule an upcoming campaign, change or cancel its time before it starts, and resend only to recipients whose messages failed. Campaigns are available from the Regular plan upward; pricing details are on the pricing page."] }
      ],
      checklist: ["A Meta-approved template", "An audience that agreed to hear from you", "A balance that covers the recipients", "A test campaign to your own number first", "Review the results after sending"]
    }
  },
  {
    slug: "whatsapp-auto-reply",
    ar: {
      title: "الرد الآلي على واتساب: رسالة ترحيب وخيارات وتحويل للفريق",
      description: "ابنِ ردًّا آليًا يرحّب بالعميل ويعرض الخيارات ويحوّله للفريق الصحيح، ثم اعرف متى تضيف الأتمتة بالقواعد والمساعد الذكي. بدون برمجة.",
      sections: [
        { title: "رد آلي بخطوات مرئية", paragraphs: ["تبني مسار المحادثة خطوة بخطوة على مخطط واحد: رسالة ترحيب، ثم قائمة خيارات، ثم رد جاهز أو تحويل إلى موظف أو فريق. تعدّل أي خطوة بنقرة وترى المسار كاملًا قبل التفعيل."] },
        { title: "ما الذي تتيحه كل باقة؟", paragraphs: ["الرد الآلي متاح في كل الباقات، ويزيد عدد الخطوات وأنواعها كلما ارتفعت الباقة. الأتمتة بالقواعد (متى تبدأ القاعدة وماذا تنفذ) ومساعد الذكاء الاصطناعي المبني على قاعدة معرفتك يبدآن من باقة المؤسسات الصغيرة."] },
        { title: "مساعد يجيب من معرفتك أنت", paragraphs: ["تضيف أسئلتك وأجوبتك إلى قاعدة المعرفة، ويقترح المساعد ردودًا من هذا المحتوى فقط. لا ينبغي أن يجيب عن شيء لم تكتبه، لذلك ابدأ بأسئلة عملائك الأكثر تكرارًا."] },
        { title: "اختبر قبل أن تفعّل", paragraphs: ["جرّب الرد الآلي من رقمك أولًا، وتأكد أن زر التحويل إلى الفريق يصل إلى الشخص الصحيح وأن الرسائل خارج ساعات الدوام تظهر كما تريد."] }
      ],
      checklist: ["رسالة ترحيب واضحة", "خيارات تغطي أكثر الأسئلة تكرارًا", "خطوة تحويل إلى موظف أو فريق", "اختبار المسار من رقم تملكه", "مراجعة قاعدة المعرفة قبل تفعيل الذكاء الاصطناعي"]
    },
    en: {
      title: "WhatsApp auto reply: a welcome, options and a handoff to your team",
      description: "Build an auto reply that welcomes customers, shows options and hands them to the right team, then learn when to add rule-based automation and the AI assistant. No coding.",
      sections: [
        { title: "An auto reply built from visible steps", paragraphs: ["You build the conversation flow step by step on one diagram: a welcome message, then a list of options, then a ready answer or a handoff to an agent or team. You edit any step with a click and see the whole flow before turning it on."] },
        { title: "What each plan includes", paragraphs: ["The auto reply is available on every plan, with more steps and step types on higher plans. Rule-based automation (when a rule starts and what it does) and the AI assistant built on your knowledge base start with the Small Enterprises plan."] },
        { title: "An assistant that answers from your own knowledge", paragraphs: ["You add your questions and answers to the knowledge base and the assistant drafts replies from that content only. It should not answer anything you did not write, so start with your customers' most frequent questions."] },
        { title: "Test before you turn it on", paragraphs: ["Try the auto reply from your own number first, and check that the handoff to the team reaches the right person and that messages outside working hours read the way you want."] }
      ],
      checklist: ["A clear welcome message", "Options covering the most frequent questions", "A handoff step to an agent or team", "A test of the flow from a number you own", "A reviewed knowledge base before enabling AI"]
    }
  },
  {
    slug: "restaurants-whatsapp-inbox",
    ar: {
      title: "واتساب للمطاعم والمقاهي: تنظيم الاستفسارات بين الفروع",
      description: "كيف ينظم مطعمك أو مقهاك رسائل واتساب: رد آلي عن الدوام والموقع والقائمة، توجيه المحادثات للفرع المناسب، وحملات للعروض. جرّب Linkly مجانًا.",
      sections: [
        { title: "الأسئلة المتكررة تُجاب وحدها", paragraphs: ["ساعات العمل وموقع الفرع والقائمة تمثل أغلب الرسائل الأولى. يجيب الرد الآلي عنها فورًا، ويحوّل ما يحتاج إلى إنسان مثل المناسبات والطلبات الخاصة إلى موظف."] },
        { title: "فروعك في صندوق واحد", paragraphs: ["تضيف الفروع بمواقعها، فيعرضها الرد الآلي للعميل قبل أي طلب. توجَّه محادثات كل فرع إلى فريقه، وتبقى الإدارة ترى الصورة كاملة وتقارن سرعة الرد بين الفروع."] },
        { title: "عروض نهاية الأسبوع", paragraphs: ["أرسل عرضًا أو وجبة جديدة إلى عملائك بقوالب معتمدة من Meta، وتابع من قرأها ومن ردّ. الحملات متاحة من الباقة العادية فأعلى."] },
        { title: "ابدأ بتجربة صغيرة", paragraphs: ["اربط رقم الفرع الأكثر ازدحامًا أولًا، وقِس أسبوعًا واحدًا: عدد المحادثات وزمن أول رد، ثم وسّع على بقية الفروع."] }
      ],
      checklist: ["رقم واتساب للأعمال لكل فرع أو رقم موحّد", "ساعات العمل ومواقع الفروع جاهزة", "ردود خارج الدوام", "موظفون مسندون لكل فرع", "قياس زمن أول رد قبل التوسع"]
    },
    en: {
      title: "WhatsApp for restaurants and cafes: organize inquiries across branches",
      description: "How your restaurant or cafe can organize WhatsApp: an auto reply for hours, location and menu, conversations routed to the right branch, and campaigns for offers. Try Linkly free.",
      sections: [
        { title: "Repeated questions answer themselves", paragraphs: ["Opening hours, the branch location and the menu make up most first messages. The auto reply answers them at once and hands the ones that need a person, such as events and special orders, to an agent."] },
        { title: "Your branches in one inbox", paragraphs: ["You add branches with their locations, and the auto reply shows them to the customer before any order. Each branch's conversations go to its team, while management sees the whole picture and compares reply speed between branches."] },
        { title: "Weekend offers", paragraphs: ["Send an offer or a new dish to your customers with Meta-approved templates and see who read it and who replied. Campaigns are available from the Regular plan upward."] },
        { title: "Start with a small test", paragraphs: ["Connect the busiest branch's number first and measure one week: conversation volume and first-reply time, then extend to the other branches."] }
      ],
      checklist: ["A WhatsApp Business number per branch or one shared number", "Opening hours and branch locations ready", "Replies for outside working hours", "Agents assigned to each branch", "First-reply time measured before expanding"]
    }
  },
  {
    slug: "clinics-whatsapp-inbox",
    ar: {
      title: "واتساب للعيادات والمراكز الصحية: استقبال منظّم للاستفسارات",
      description: "كيف تنظم عيادتك استفسارات المرضى على واتساب: صندوق مشترك لفريق الاستقبال، رد آلي خارج الدوام، وصلاحيات تحدد من يرى ماذا. جرّب Linkly مجانًا.",
      sections: [
        { title: "فريق الاستقبال في صندوق واحد", paragraphs: ["يتشارك موظفو الاستقبال رقمًا واحدًا، وتُسنَد كل محادثة إلى موظف، فلا يرد اثنان على المريض نفسه ولا يضيع استفسار بين الورديات."] },
        { title: "ردود خارج الدوام", paragraphs: ["رسالة آلية تؤكد استلام الاستفسار وتذكر ساعات الدوام وأيام عمل الأطباء وطريقة الوصول، ثم يتابعه الفريق عند بدء الدوام."] },
        { title: "الصلاحيات وخصوصية البيانات", paragraphs: ["تُدار الصلاحيات حسب الدور فلا يرى الموظف إلا ما يخصه. اطلع على سياسة الخصوصية لمعرفة كيف تُعالج البيانات، ولا تُرسل معلومات طبية حساسة عبر الرد الآلي."] },
        { title: "ما لا يفعله Linkly", paragraphs: ["لا يحل محل نظام حجز المواعيد أو الملف الطبي؛ بل يدير المحادثات والاستفسارات ويكمل نظامك الحالي."] }
      ],
      checklist: ["رقم واتساب للأعمال للعيادة", "ساعات الدوام وأيام عمل الأطباء", "موظفون للاستقبال بصلاحيات محددة", "رسالة خارج الدوام", "مراجعة سياسة الخصوصية مع الإدارة"]
    },
    en: {
      title: "WhatsApp for clinics and health centers: organized patient inquiries",
      description: "How your clinic can organize patient inquiries on WhatsApp: a shared inbox for the reception team, an auto reply outside hours, and permissions that decide who sees what. Try Linkly free.",
      sections: [
        { title: "The reception team in one inbox", paragraphs: ["Reception staff share one number and each conversation is assigned to a person, so two people never answer the same patient and no inquiry gets lost between shifts."] },
        { title: "Replies outside working hours", paragraphs: ["An automatic message confirms the inquiry was received and gives working hours, the doctors' working days and how to get there; the team follows up when the day starts."] },
        { title: "Permissions and data privacy", paragraphs: ["Permissions follow roles, so staff see only what concerns them. Read the privacy policy to see how data is processed, and do not send sensitive medical details through the auto reply."] },
        { title: "What Linkly does not do", paragraphs: ["It does not replace an appointment system or a medical record; it manages conversations and inquiries and complements the system you already use."] }
      ],
      checklist: ["A WhatsApp Business number for the clinic", "Working hours and the doctors' working days", "Reception staff with defined permissions", "An outside-hours message", "The privacy policy reviewed with management"]
    }
  }
];

export function solutionPath(slug: string, lang: "ar" | "en") {
  return `${lang === "en" ? "/en" : ""}/solutions/${slug}`;
}

export function solutionMetadata(solution: Solution, lang: "ar" | "en"): Metadata {
  const content = solution[lang];
  const path = solutionPath(solution.slug, lang);
  const title = `${content.title} | Linkly`;
  return {
    title: { absolute: title }, description: content.description,
    alternates: { canonical: path, languages: { "ar-SA": solutionPath(solution.slug, "ar"), en: solutionPath(solution.slug, "en"), "x-default": solutionPath(solution.slug, "ar") } },
    openGraph: { title, description: content.description, url: path, type: "website", locale: lang === "ar" ? "ar_SA" : "en_US", images: ["/opengraph-image?v=3"] },
    twitter: { card: "summary_large_image", title, description: content.description, images: ["/opengraph-image?v=3"] }
  };
}

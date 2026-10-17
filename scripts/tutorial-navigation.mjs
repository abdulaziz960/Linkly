// Human-visible navigation: the same sidebar entries and tabs used by customers.
const labels={inbox:'المحادثات',quickReplies:'الردود السريعة',contacts:'العملاء والوسوم',bot:'الرد الآلي',automations:'الأتمتة',campaigns:'الحملات',emailPromotions:'العروض البريدية',segments:'تقسيم العملاء',pipeline:'العملاء المحتملون',templates:'القوالب',reports:'التقارير والعمليات',catalog:'الكتالوج والفروع',branding:'العلامة التجارية'};
export function tutorialNavigation(view){
 if(['settings','integrations','developers'].includes(view))return {sidebar:'الإعدادات والربط',tab:{settings:'القنوات',integrations:'التكاملات',developers:'المطورون'}[view]};
 if(['employees','workHours'].includes(view))return {sidebar:'الموظفون والفرق وساعات العمل',tab:view==='employees'?'الموظفون والصلاحيات':'ساعات العمل'};
 if(view==='knowledgeBase')return {sidebar:'مساعد AI وقاعدة المعرفة',tab:'قاعدة المعرفة'};
 if(!labels[view])throw Error('Unknown tutorial navigation: '+view);
 return {sidebar:labels[view]};
}
export function navigationStep(view){const n=tutorialNavigation(view);return {kind:'navigation',title:'اختر الصفحة من القائمة الجانبية',body:`من القائمة الجانبية اختر «${n.sidebar}»${n.tab?`، ثم افتح تبويب «${n.tab}»`:''}.`,start:0};}
export async function openTutorialPage({page,view,click,focus}){
 const n=tutorialNavigation(view);const entry=page.locator('.dashboard-sidebar nav').getByRole('button',{name:n.sidebar,exact:true});
 await entry.scrollIntoViewIfNeeded();await entry.hover();await focus(await entry.boundingBox());await page.waitForTimeout(1000);await click(entry);
 if(n.tab){const tab=page.getByRole('tab',{name:n.tab,exact:true});await tab.waitFor({state:'visible'});await click(tab);}
 await page.locator('.dashboard-main').waitFor();
}

import { LANG, tr, trx } from './tutorial-i18n.mjs';
// Human-visible navigation: the same sidebar entries and tabs used by customers.
const labels={inbox:tr('المحادثات'),quickReplies:tr('الردود السريعة'),contacts:tr('العملاء والوسوم'),bot:tr('الرد الآلي'),automations:tr('الأتمتة'),campaigns:tr('الحملات'),emailPromotions:tr('العروض البريدية'),segments:tr('تقسيم العملاء'),pipeline:tr('العملاء المحتملون'),templates:tr('القوالب'),reports:tr('التقارير والعمليات'),catalog:tr('الكتالوج والفروع'),branding:tr('العلامة التجارية')};
const sidebarEn={inbox:'Conversations',quickReplies:'Quick replies',contacts:'Customers, leads & tags',pipeline:'Customers, leads & tags',bot:'Auto-reply',automations:'Automations',campaigns:'Campaigns',emailPromotions:'Email Promotions',segments:'Customer Segments',templates:'Templates',reports:'Reports & operations',catalog:'Catalog & branches',branding:'Branding'};
export function tutorialNavigation(view){
 if(LANG==='en'){
  if(['settings','integrations','developers'].includes(view))return {sidebar:'Settings & channels',tab:{settings:'Channels',integrations:'Integrations',developers:'Developers'}[view]};
  if(['employees','workHours'].includes(view))return {sidebar:'Team, permissions & hours',tab:view==='employees'?'Employees & permissions':'Work hours'};
  if(view==='knowledgeBase')return {sidebar:'AI assistant & knowledge base',tab:'Knowledge Base'};
  if(view==='pipeline')return {sidebar:sidebarEn.pipeline,tab:'Leads'};
  if(!sidebarEn[view])throw Error('Unknown tutorial navigation: '+view);
  return {sidebar:sidebarEn[view]};
 }
 if(['settings','integrations','developers'].includes(view))return {sidebar:'الإعدادات والربط',tab:{settings:'القنوات',integrations:'التكاملات',developers:'المطورون'}[view]};
 if(['employees','workHours'].includes(view))return {sidebar:'الموظفون والفرق وساعات العمل',tab:view==='employees'?'الموظفون والصلاحيات':'ساعات العمل'};
 if(view==='knowledgeBase')return {sidebar:'مساعد AI وقاعدة المعرفة',tab:'قاعدة المعرفة'};
 if(!labels[view])throw Error('Unknown tutorial navigation: '+view);
 return {sidebar:labels[view]};
}
export function navigationStep(view){const n=tutorialNavigation(view);if(LANG==='en')return {kind:'navigation',title:'Choose the page from the sidebar',body:`From the sidebar choose “${n.sidebar}”${n.tab?`, then open the “${n.tab}” tab`:''}.`,start:0};return {kind:'navigation',title:'اختر الصفحة من القائمة الجانبية',body:`من القائمة الجانبية اختر «${n.sidebar}»${n.tab?`، ثم افتح تبويب «${n.tab}»`:''}.`,start:0};}
export async function openTutorialPage({page,view,click,focus}){
 const n=tutorialNavigation(view);const entry=page.locator('.dashboard-sidebar nav').getByRole('button',{name:n.sidebar,exact:true});
 await entry.scrollIntoViewIfNeeded();await entry.hover();await focus(await entry.boundingBox());await page.waitForTimeout(1000);await click(entry);
 if(n.tab){const tab=page.getByRole('tab',{name:n.tab,exact:true});await tab.waitFor({state:'visible'});await click(tab);}
 await page.locator('.dashboard-main').waitFor();
}

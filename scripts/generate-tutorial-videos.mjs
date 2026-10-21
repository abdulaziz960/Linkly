/** Real continuous screen recordings with visual arrows and short Arabic instructions, without any audio.
 * Requires the isolated browser-test server. Never records a customer workspace.
 * node scripts/generate-tutorial-videos.mjs [--only salla,zid]
 */
import { chromium } from '@playwright/test';
import ffmpeg from 'ffmpeg-static';
import { readFile, writeFile, mkdir, mkdtemp, rm, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { performDemo } from './tutorial-demo-actions.mjs';
import { navigationStep, openTutorialPage } from './tutorial-navigation.mjs';
import { LANG, tr } from './tutorial-i18n.mjs';
const run=promisify(execFile);
const base=process.env.TUTORIAL_BASE_URL||'http://localhost:3217';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Only localhost recording is supported');
const arabicPath='app/dashboard/tutorials/guides.json';
// English recordings (TUTORIAL_LANG=en) read the English texts and write their own metadata and files (*.en.mp4 / *.en.vtt).
const dataPath=LANG==='en'?'app/dashboard/tutorials/guides.en.json':arabicPath;
const SUFFIX=LANG==='en'?'.en':'';
const arabicGuides=JSON.parse(await readFile(arabicPath,'utf8'));
const guides=JSON.parse(await readFile(dataPath,'utf8')).map(g=>{const a=arabicGuides.find(x=>x.id===g.id);return LANG==='en'?{...a,...g,steps:g.steps.map((step,i)=>({...a.steps[i],...step}))}:g;});
const onlyIndex=process.argv.indexOf('--only');
const only=onlyIndex<0?null:process.argv[onlyIndex+1].split(',');
const output=path.resolve('public/tutorials');
const temp=await mkdtemp(path.join(tmpdir(),'linkly-arrows-'));
const browser=await chromium.launch();
async function configure(context){
 await context.route('**/*',async(route)=>{const url=new URL(route.request().url());if(url.origin===new URL(base).origin||['data:','blob:'].includes(url.protocol))await route.continue();else await route.abort();});
 await context.addInitScript((LANG)=>{localStorage.setItem('linkly-analytics-consent','rejected');localStorage.setItem('audiencew-language',LANG);sessionStorage.setItem('linkly-pwa-install-popup-dismissed','1');window.open=()=>null;},LANG);
}
const auth=await browser.newContext();await configure(auth);
const login=await auth.newPage();
await login.goto(base+'/login');await login.locator('input[name="email"]').fill('owner@browser.test');await login.locator('input[name="password"]').fill('Browser-only-Password-927!');await login.getByRole('button',{name:tr('تسجيل الدخول'),exact:true}).click();await login.waitForURL(url=>url.pathname==='/dashboard');
const identity=await (await auth.request.get(base+'/api/auth/me')).json();
if(identity.user?.id!=='browser-owner'||identity.user?.tenantId!=='browser-workspace')throw Error('Not the isolated browser-test account');
const storageState=await auth.storageState();
const keyResult=await (await auth.request.post(base+'/api/developer/keys',{data:{name:'silent-tutorial-only'}})).json();
if(!keyResult.data?.rawKey)throw Error('Cannot create test API key');
const api={base,key:keyResult.data.rawKey};
// The bot guides pick a team: make sure the isolated workspace has one (named like the demo expects).
try{const teams=await (await auth.request.get(base+'/api/teams')).json();const wanted=tr('خدمة العملاء');if(!(teams.data??[]).some(t=>t.name===wanted)){let staff=(await (await auth.request.get(base+'/api/employees')).json()).data??[];if(!staff.length){await auth.request.post(base+'/api/employees',{data:{name:'Support Agent',email:'support-agent@browser.test',role:'موظف دعم',status:'متصل',permissions:'المحادثات فقط'}});staff=(await (await auth.request.get(base+'/api/employees')).json()).data??[];}const member=staff[0];if(member)await auth.request.post(base+'/api/teams',{data:{name:wanted,lead:member.name,routing:'يدوي',memberIds:[member.id]}});}}catch(error){console.error('Team setup skipped: '+error.message);}
const stamp=s=>{const ms=Math.round(s*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;};
async function caption(guide,step,index){
 await page.evaluate(({title,index,total,dir})=>{
  document.querySelector('#tutorial-caption')?.remove();const el=document.createElement('div');el.id='tutorial-caption';el.dir=dir;
  el.style.cssText='position:fixed;bottom:16px;left:16px;max-width:calc(100vw - 140px);padding:10px 16px;border-radius:12px;background:#103e34ed;color:white;font:600 19px/1.7 Arial,sans-serif;pointer-events:none;z-index:2147483645;box-shadow:0 3px 12px #0002';
  el.textContent=`${index+1} / ${total} • ${title}`;document.body.append(el);
 },{title:step.title,index,total:guide.steps.length,dir:LANG==='en'?'ltr':'rtl'});
}
let page,lastTarget;
async function capture(target){
 if(target)lastTarget=target;
 if(!target)return;
 await page.evaluate(target=>{
  document.querySelector('#tutorial-focus')?.remove();
  const el=document.createElement('div');el.id='tutorial-focus';el.dataset.tutorialArrow='true';
  el.style.cssText=`position:fixed;pointer-events:none;z-index:2147483647;left:${target.x-4}px;top:${target.y-4}px;width:${target.width+8}px;height:${target.height+8}px;border:3px solid #ed4937;border-radius:8px;box-shadow:0 0 0 3px #ffffffbb;`;
  const above=target.y>145;
  const arrow=document.createElementNS('http://www.w3.org/2000/svg','svg');
  arrow.setAttribute('width','110');arrow.setAttribute('height','120');arrow.setAttribute('viewBox','0 0 110 120');
  arrow.style.cssText=`position:absolute;left:${target.width/2-52}px;${above?'bottom:100%':'top:100%'};overflow:visible;${above?'':'transform:rotate(180deg)'};filter:drop-shadow(0 2px 3px #0008)`;
  arrow.innerHTML='<path d="M20 8 Q75 10 57 82 L40 70 L52 114 L82 80 L65 86 Q88 6 20 8Z" fill="#ed4937" stroke="white" stroke-width="3" stroke-linejoin="round"/>';
  el.append(arrow);document.body.append(el);
 },target);
 await page.waitForTimeout(300);
}
async function click(locator){
 await locator.waitFor({state:'visible'});await locator.evaluate(el=>el.scrollIntoView({block:'center',inline:'center'}));
 const box=await locator.boundingBox();await capture(box);
 if(box)await page.mouse.move(box.x+box.width/2,box.y+box.height/2,{steps:14});
 await page.waitForTimeout(550);await locator.click();await page.waitForTimeout(400);
 await page.locator('#tutorial-focus').evaluateAll(els=>els.forEach(el=>el.remove()));lastTarget=null;
 const modal=page.getByRole('dialog').filter({visible:true}).first();
 const inside=await locator.count() && await locator.first().isVisible() && await locator.first().evaluate(el=>!!el.closest('[role="dialog"]'));
 if(await modal.count() && !inside){
  const control=modal.locator('[role="tab"][aria-selected="true"],input:not([type=hidden]),textarea').filter({visible:true}).first();
  if(await control.count())await capture(await control.boundingBox());
 }else if(await locator.count() && await locator.first().isVisible())await capture(await locator.first().boundingBox());
}
async function fill(locator,value){await locator.waitFor({state:'visible'});await locator.evaluate(el=>el.scrollIntoView({block:'center'}));await capture(await locator.boundingBox());await locator.fill('');if((await locator.getAttribute('type'))==='number'||(await locator.getAttribute('type'))==='time')await locator.fill(value);else await locator.pressSequentially(value,{delay:12});await capture(await locator.boundingBox());}
async function showResponse(result){await page.evaluate(result=>{document.querySelector('#tutorial-api-result')?.remove();const el=document.createElement('section');el.id='tutorial-api-result';el.style.cssText='position:fixed;inset:65px 45px;z-index:2147483640;background:#153f34;color:#fff;border-radius:20px;padding:25px;overflow:auto;direction:ltr';const h=document.createElement('h2');h.textContent='Local API — actual response';const pre=document.createElement('pre');pre.style.cssText='font:24px/1.7 monospace;white-space:pre-wrap';pre.textContent=JSON.stringify(result,null,2);el.append(h,pre);document.body.append(el);},result);}
const failures=[];
try{
 for(const guide of guides.filter(g=>!only||only.includes(g.id))){
  let context;
  try{
   const contentSteps=guide.steps.filter(step=>step.kind!=='navigation');
   guide.steps=[navigationStep(guide.view),...contentSteps];
   if(guide.view==='bot'){await auth.request.put(base+'/api/bot/nodes?channel=whatsapp',{data:{nodes:[]}});await auth.request.patch(base+'/api/bot/settings?channel=whatsapp',{data:{enabled:false}});}
   context=await browser.newContext({storageState,viewport:{width:1600,height:900},recordVideo:{dir:temp,size:{width:1600,height:900}}});await configure(context);
   const epoch=Date.now();page=await context.newPage();page.setDefaultTimeout(20000);page.on('dialog',async d=>d.type()==='confirm'?await d.accept():await d.dismiss());
   if(guide.id==='api-webhooks'){let webhooks=[];await page.route('**/api/developer/webhooks**',async route=>{const req=route.request();const method=req.method();let data;if(method==='POST'){const body=req.postDataJSON();const w={id:'tutorial-webhook',url:body.url,events:body.events,active:true,createdAt:new Date().toISOString()};webhooks=[w];data={...w,secret:'DEMO_ONLY'};}else if(method==='PATCH'){webhooks=webhooks.map(w=>({...w,active:req.postDataJSON().active}));data=webhooks[0];}else if(method==='DELETE'){webhooks=[];data={};}else data=req.url().endsWith('/deliveries')?[]:webhooks;await route.fulfill({json:{ok:true,data}});});}
   await page.goto(base+'/dashboard?view='+(guide.view==='inbox'?'settings':'inbox'));await page.locator('.dashboard-main').waitFor();await page.addStyleTag({content:'.developer-reveal code{filter:blur(12px)!important}'});await page.waitForTimeout(400);
   const chapters=[];
   for(const [index,step] of guide.steps.entries()){
    await caption(guide,step,index);
    lastTarget=null;const start=(Date.now()-epoch)/1000;
    if(index===0)await openTutorialPage({page,view:guide.view,click,focus:capture});
    else await performDemo({guide:{...guide,steps:contentSteps},index:index-1,page,click,fill,api,showResponse,focus:capture});
    await caption(guide,step,index);
    if(!lastTarget){const region=page.locator('#tutorial-api-result pre, [role=dialog] input, [role=tab][aria-selected=true], .dashboard-main button').filter({visible:true}).first();if(await region.count()){await region.evaluate(el=>el.scrollIntoView({block:'center',inline:'center'}));await capture(await region.boundingBox());}}
    await page.waitForTimeout(900);
    const actual=(Date.now()-epoch)/1000-start;
    const viewport=page.viewportSize();
    chapters.push({start,actual,length:Math.ceil(Math.max(6,actual+1)),crop:{x:0,y:0,width:Math.min(1600,viewport.width),height:Math.min(900,viewport.height)}});
   }
   const raw=await page.video().path();await context.close();context=null;
   const segments=[];let elapsed=0;
   for(const [i,c] of chapters.entries()){
    const segment=path.join(temp,`${guide.id}-${i}.mp4`);const crop=`crop=${c.crop.width}:${c.crop.height}:${c.crop.x}:${c.crop.y}`;
    await run(ffmpeg,['-hide_banner','-loglevel','error','-y','-filter_complex_threads','1','-filter_threads','1','-threads','2','-ss',String(c.start),'-t',String(c.actual),'-i',raw,'-filter_complex',`[0:v]${crop},scale=1920:1080,fps=20,tpad=stop_mode=clone:stop_duration=${c.length}[v]`,'-map','[v]','-t',String(c.length),'-c:v','libx264','-threads','2','-preset','ultrafast','-crf','20','-pix_fmt','yuv420p','-an','-movflags','+faststart',segment]);
    guide.steps[i].start=elapsed;elapsed+=c.length;segments.push(segment);
   }
   const concat=path.join(temp,guide.id+'.txt');await writeFile(concat,segments.map(file=>`file '${file}'`).join('\n'));
   const movie=path.join(temp,guide.id+'-final.mp4');await run(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',concat,'-c','copy','-movflags','+faststart',movie]);
   const delivery=path.join(output,guide.id+'.'+process.pid+'.tmp');await writeFile(delivery,await readFile(movie));await rename(delivery,path.join(output,guide.id+SUFFIX+'.mp4'));await run(ffmpeg,['-hide_banner','-loglevel','error','-y','-filter_complex_threads','1','-filter_threads','1','-threads','2','-ss','1.3','-i',segments[0],'-frames:v','1','-q:v','2',path.join(output,guide.id+SUFFIX+'.jpg')]);
   guide.duration=elapsed;guide.narrated=false;guide.visualArrows=true;guide.frameLayout="full-screen";
   await writeFile(path.join(output,guide.id+SUFFIX+'.vtt'),'WEBVTT\n\n'+guide.steps.map((s,i)=>`${stamp(s.start)} --> ${stamp(guide.steps[i+1]?.start??elapsed)}\n${s.title}\n${s.body}\n`).join('\n'));
   const lock=path.join(tmpdir(),'linkly-tutorial-metadata.lock');
   while(true){try{await mkdir(lock);break;}catch(e){if(e.code!=='EEXIST')throw e;await new Promise(resolve=>setTimeout(resolve,100));}}
   try{const latest=JSON.parse(await readFile(dataPath,'utf8'));const position=latest.findIndex(g=>g.id===guide.id);latest[position]=guide;const staging=dataPath+'.'+process.pid+'.tmp';await writeFile(staging,JSON.stringify(latest,null,2)+'\n');await rename(staging,dataPath);}finally{await rm(lock,{recursive:true,force:true});}
   console.log(`Full-screen sidebar recording: ${guide.id}, ${elapsed}s, ${chapters.length} chapters`);
  }catch(error){failures.push(guide.id);console.error(`FAILED ${guide.id}: ${error.message}`);if(context)await context.close();}
 }
}finally{
 const keys=await (await auth.request.get(base+'/api/developer/keys')).json();for(const key of keys.data??[])if(key.id===keyResult.data.id||key.name===tr('تكامل تدريبي للفيديو'))await auth.request.delete(base+'/api/developer/keys/'+key.id);
 await auth.request.patch(base+'/api/bot/settings?channel=whatsapp',{data:{enabled:false}});await browser.close();if(!failures.length)await rm(temp,{recursive:true,force:true});else console.error('Diagnostics: '+temp);
}
if(failures.length){console.error('Incomplete: '+failures.join(','));process.exitCode=1;}

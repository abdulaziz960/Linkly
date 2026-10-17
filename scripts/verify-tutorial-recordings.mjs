/** Validate delivered media, not just the content manifest. */
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import ffmpeg from 'ffmpeg-static';
const run=promisify(execFile);
const guides=JSON.parse(await readFile('app/dashboard/tutorials/guides.json','utf8'));
const selected=process.argv.includes("--completed")?guides.filter(guide=>guide.frameLayout==="full-screen"):guides;
const failures=[];
async function verify(guide){
 try{
  if(guide.frameLayout!=='full-screen'||guide.steps[0].kind!=='navigation')throw Error('Missing full-screen sidebar introduction');
  if(guide.narrated || !guide.visualArrows)throw Error('Silent arrows recording has not been delivered');
  if(guide.steps[0]?.start!==0||guide.steps.some((step,i)=>i>0&&step.start<=guide.steps[i-1].start)||guide.steps.at(-1).start>=guide.duration)throw Error('Invalid chapter timeline');
  const poster=await sharp(`public/tutorials/${guide.id}.jpg`).metadata();if(poster.width!==1920||poster.height!==1080)throw Error('Poster is not Full HD');
  const {data: pixels, info}=await sharp(`public/tutorials/${guide.id}.jpg`).removeAlpha().raw().toBuffer({resolveWithObject:true});
  let arrowPixels=0;for(let y=0;y<1080;y++)for(let x=0;x<1920;x++){const i=(y*info.width+x)*info.channels;if(Math.abs(pixels[i]-237)<7&&Math.abs(pixels[i+1]-73)<7&&Math.abs(pixels[i+2]-55)<7)arrowPixels++;}
  if(arrowPixels<100)throw Error('No visible red arrow in poster');
  const {stderr}=await run(ffmpeg,['-hide_banner','-i',`public/tutorials/${guide.id}.mp4`,'-t','0.2','-an','-f','null','-']);
  if(!/Video: h264[^\n]*1920x1080/.test(stderr)||/Stream[^\n]*Audio:/.test(stderr))throw Error('Expected Full HD H.264 video with no audio stream');
  const time=stderr.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);const duration=time?+time[1]*3600 + +time[2]*60 + +time[3]:0;
  if(Math.abs(duration-guide.duration)>0.75)throw Error(`Duration mismatch: ${duration} / ${guide.duration}`);
  const captions=await readFile(`public/tutorials/${guide.id}.vtt`,'utf8');if(!captions.startsWith('WEBVTT')||!captions.includes(guide.steps.at(-1).title))throw Error('Missing chapter captions');
 }catch(error){failures.push(`${guide.id}: ${error.message}`);}
}
for(let i=0;i<selected.length;i+=3)await Promise.all(selected.slice(i,i+3).map(verify));
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}else console.log(`Verified ${selected.length} / ${guides.length} Full HD recordings: no audio streams, posters, chapter timings and captions match.`);

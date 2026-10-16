// 구현 단계의 공개 좌표 확인 도구. API 키 없음. 브라우저에서는 이 도구를 실행하지 않는다.
// Wikipedia는 문서와 Wikidata ID 연결에만 사용하며 설명 문장은 가져오지 않는다.
// 좌표는 Wikidata P625(CC0)의 지구 좌표만 사용한다.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const context={window:{}};
vm.runInNewContext(await readFile(path.join(root,'tour-catalog.js'),'utf8'),context);
const catalog=context.window.GonsangTourCatalog;
const additions={
  '도쿄':[['요요기 공원','Yoyogi Park'],['쓰키지 장외시장','Tsukiji fish market']],
  '오사카':[['오사카 역사박물관','Osaka Museum of History'],['쓰텐카쿠','Tsūtenkaku']],
  '교토':[['료안지','Ryōan-ji'],['헤이안 신궁','Heian Shrine']],
  '후쿠오카':[['도초지','Tōchō-ji'],['후쿠오카 아시아미술관','Fukuoka Asian Art Museum']],
  '방콕':[['왓 사켓','Wat Saket'],['왓 트라이밋','Wat Traimit']],
  '다낭':[['다낭 대성당','Da Nang Cathedral'],['한강 다리','Hàn River Bridge']],
  '타이베이':[['화산 1914 문화창의산업원구','Huashan 1914 Creative Park'],['송산 문화창의원구','Songshan Cultural and Creative Park']],
  '싱가포르':[['내셔널 갤러리 싱가포르','National Gallery Singapore'],['주얼 창이','Jewel Changi Airport']],
  '홍콩':[['만모사원','Man Mo Temple'],['홍콩 우주박물관','Hong Kong Space Museum']],
  '파리':[['튈르리 정원','Tuileries Garden'],['팡테옹','Panthéon']],
  '런던':[['세인트 폴 대성당',"St Paul's Cathedral"],['테이트 모던','Tate Modern']],
  '로마':[['캄피돌리오 박물관','Capitoline Museums'],['산탄젤로성',"Castel Sant'Angelo"]],
  '프라하':[['존 레논 벽','Lennon Wall'],['스트라호프 수도원','Strahov Monastery']],
  '바르셀로나':[['카탈루냐 국립미술관',"Museu Nacional d'Art de Catalunya"],['티비다보','Tibidabo']],
  '뉴욕':[['그랜드 센트럴 터미널','Grand Central Terminal'],['구겐하임 미술관','Solomon R. Guggenheim Museum']],
  '샌프란시스코':[['코이트 타워','Coit Tower'],['익스플로라토리움','Exploratorium']],
  '로스앤젤레스':[['게티 빌라','Getty Villa'],['라 브레아 타르 핏츠','La Brea Tar Pits']],
  '밴쿠버':[['사이언스 월드','Science World (Vancouver)'],['밴듀슨 식물원','VanDusen Botanical Garden']],
  '시드니':[['호주 박물관','Australian Museum'],['시드니 타워','Sydney Tower']],
  '괌':[['산타 아게다 요새','Fort Santa Agueda'],['이나라한','Inalåhan, Guam']],
  '퀸스타운':[['킹스턴','Kingston, New Zealand'],['와나카','Wānaka']],
  '두바이':[['에티하드 박물관','Etihad Museum'],['두바이 골드 수크','Dubai Gold Souk']],
  '이스탄불':[['굴하네 공원','Gülhane Park'],['스파이스 바자르','Spice Bazaar']],
  '케이프타운':[['남아프리카 국립미술관','Iziko South African National Gallery'],['시그널 힐','Signal Hill (Cape Town)']],
  '칸쿤':[['푸에르토 모렐로스','Puerto Morelos'],['플라야 델 카르멘','Playa del Carmen']],
  '리마':[['페루 국립박물관','National Museum of Peru'],['산마르틴 광장','Plaza San Martín, Lima']]
};
const places=Object.entries(catalog).flatMap(([city,rows])=>[
  ...rows.map(p=>({...p})),...(additions[city]||[]).map(([name,wiki],i)=>({city,name,wiki,id:`${city}:extra${i}`,category:'명소',description:'도시와 주변의 역사·문화를 살펴보는 추가 여행 후보예요.'}))
]);
let checkpoint={};try{checkpoint=JSON.parse(await readFile(path.join(root,'build','tour-qids.json'),'utf8'));}catch(_){}
await mkdir(path.join(root,'build'),{recursive:true});
async function query(endpoint,params){await new Promise(r=>setTimeout(r,6500));const u=new URL(endpoint);u.search=new URLSearchParams({action:'query',format:'json',formatversion:'2',...params});const r=await fetch(u,{signal:AbortSignal.timeout(20000),headers:{'User-Agent':'GonsangPlan-Prototype/1.0 (public geographic facts; local development)'}});if(!r.ok)throw Error(`Public API HTTP ${r.status}; Retry-After=${r.headers.get('retry-after')||'unspecified'}. 진행 기록을 보존했습니다.`);return r.json();}
for(const city of Object.keys(catalog)){
  const rows=places.filter(p=>p.city===city);
  if(rows.every(p=>Object.hasOwn(checkpoint,p.wiki))){rows.forEach(p=>p.qid=checkpoint[p.wiki]);continue;}
  const d=await query('https://en.wikipedia.org/w/api.php',{titles:[...new Set(rows.map(p=>p.wiki))].join('|'),prop:'pageprops',ppprop:'wikibase_item',redirects:'1'});
  const changes=new Map([...(d.query?.normalized||[]),...(d.query?.redirects||[])].map(x=>[x.from,x.to]));
  for(const p of rows){let title=p.wiki;for(let i=0;i<8&&changes.has(title);i++)title=changes.get(title);p.qid=d.query?.pages?.find(x=>x.title===title)?.pageprops?.wikibase_item||null;}
  rows.forEach(p=>checkpoint[p.wiki]=p.qid);await writeFile(path.join(root,'build','tour-qids.json'),JSON.stringify(checkpoint));
  console.log(city+': '+rows.filter(p=>p.qid).length+'/'+rows.length+'개 문서 연결');
}
const qids=[...new Set(places.map(p=>p.qid).filter(Boolean))], coordinates=new Map();
for(let i=0;i<qids.length;i+=40){
  await new Promise(r=>setTimeout(r,6500));
  const u=new URL('https://www.wikidata.org/w/api.php');u.search=new URLSearchParams({action:'wbgetentities',format:'json',ids:qids.slice(i,i+40).join('|'),props:'claims'});
  const res=await fetch(u,{signal:AbortSignal.timeout(20000)});if(!res.ok)throw Error('Wikidata HTTP '+res.status);const data=await res.json();
  for(const [qid,item] of Object.entries(data.entities||{})){
    const claims=(item.claims?.P625||[]).filter(c=>c.rank!=='deprecated'&&c.mainsnak?.datavalue?.value?.globe==='http://www.wikidata.org/entity/Q2').sort((a,b)=>Number(b.rank==='preferred')-Number(a.rank==='preferred'));
    const point=claims[0]?.mainsnak?.datavalue?.value;
    if(point && Number.isFinite(point.latitude)&&Number.isFinite(point.longitude))coordinates.set(qid,{lat:point.latitude,lng:point.longitude});
  }
}
const result=places.map(p=>({...p,...coordinates.get(p.qid),source:p.qid?'https://www.wikidata.org/wiki/'+p.qid:null}));
await mkdir(path.join(root,'build'),{recursive:true});
await writeFile(path.join(root,'build','tour-place-facts.json'),JSON.stringify(result,null,2));
console.log('좌표 확인 '+result.filter(p=>Number.isFinite(p.lat)).length+'/'+result.length+'개. 누락 좌표는 추정하지 않음.');

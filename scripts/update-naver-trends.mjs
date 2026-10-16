/** NAVER 검색 관심도 스냅샷 생성. Node 22+, 추가 패키지 불필요.
 * HTML은 데이터로만 읽는다. 첨부 HTML의 스크립트를 eval/import하지 않는다.
 * 원본/프로젝트 HTML을 덮어쓰지 않고 build/naver-trends/<실행시각>/ 에 생성한다.
 */
import { readFile, mkdir, writeFile, copyFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
const help = `사용법: node --env-file-if-exists=.env scripts/update-naver-trends.mjs [--cities "도쿄,파리"] [--end YYYY-MM-DD] [--apply]
대상: 현재 프로젝트 trip-conditions.html의 CONTINENTS에 있는 모든 여행지
NAVER_TREND_PROVIDER=hub (기본) 또는 legacy (기존 신청자 전용)
NAVER_TREND_CLIENT_ID / NAVER_TREND_CLIENT_SECRET: 서버 환경변수
NAVER_TREND_FREE_PLAN_CONFIRMED=true: 콘솔에서 무료 요금제임을 확인한 뒤에만 설정
출력: build/naver-trends/<실행시각>/trend-data.json, 미리보기 HTML과 보조 JS
--apply: 조회 성공 후 현재 프로젝트 travel-trends-data.js에만 데이터 반영
API는 상대 검색 추이만 제공하며 SNS 언급량·실제 검색 횟수는 제공하지 않습니다.`;

function fail(message) { throw new Error(message); }
const round = n => Math.round(n * 10) / 10;
const ymd = d => d.toISOString().slice(0, 10);
const shift = (date, days) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return ymd(d); };
const koreanToday = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

// 현재 HTML의 CONTINENTS 리터럴만 해석: 문자열/숫자/배열/객체. 코드 실행 없음.
function literalAt(text, start) {
  let i = start;
  const skip = () => { while (/\s/.test(text[i] || '') && i < text.length) i++; };
  function value() {
    skip(); const c = text[i++];
    if (c === '"' || c === "'") {
      let out = '';
      while (i < text.length) {
        const ch = text[i++]; if (ch === c) return out;
        if (ch !== '\\') { out += ch; continue; }
        const escaped = text[i++];
        if (escaped === 'u') { const hex=text.slice(i,i+4); if(!/^[\da-f]{4}$/i.test(hex)) fail('잘못된 문자열 이스케이프'); out+=String.fromCharCode(parseInt(hex,16)); i+=4; }
        else if ('\\\'"/bfnrt'.includes(escaped)) out += ({b:'\b',f:'\f',n:'\n',r:'\r',t:'\t'})[escaped] ?? escaped;
        else fail('지원하지 않는 문자열 이스케이프');
      }
      fail('닫히지 않은 문자열');
    }
    if (c === '[' || c === '{') {
      const object=c==='{', out=object?Object.create(null):[], end=object?'}':']'; skip();
      if(text[i]===end){i++;return out;}
      while(i<text.length){
        const v=value();
        if(object){ if(typeof v!=='string')fail('객체 키는 문자열이어야 합니다.'); skip(); if(text[i++]!==':')fail('잘못된 객체'); if(Object.hasOwn(out,v))fail('중복된 데이터 키'); out[v]=value(); }
        else out.push(v);
        skip(); const delimiter=text[i++]; if(delimiter===end)return out; if(delimiter!==',')fail('데이터에 지원하지 않는 코드가 있습니다.');
        skip(); if(text[i]===end){i++;return out;}
      }
      fail('닫히지 않은 데이터');
    }
    i--; const number=text.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?/);
    if(number){i+=number[0].length; return Number(number[0]);}
    fail('여행지 목록에는 문자열·숫자·배열·객체만 허용됩니다.');
  }
  const data=value(); return {data,end:i};
}

const safeJSON = data => JSON.stringify(data, null, 2).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');

function daily(result, dates) {
  if (!Array.isArray(result?.data)) return null;
  const map = new Map();
  for(const row of result.data){
    const number=typeof row.ratio==='number'?row.ratio:typeof row.ratio==='string' && /^\d+(?:\.\d+)?$/.test(row.ratio)?Number(row.ratio):NaN;
    if(!Number.isFinite(number) || number<0 || number>100 || map.has(row.period))return null;
    map.set(row.period,number);
  }
  // 누락된 날짜를 검색량 0으로 추정하지 않는다.
  if(dates.some(d=>!map.has(d)))return null;
  return dates.map(d=>map.get(d));
}

async function main() {
  if(args.includes('--help')){console.log(help);return;}
  const config=JSON.parse(await readFile(path.join(ROOT,'scripts/naver-trends.config.json'),'utf8'));
  const html=await readFile(path.join(ROOT,'trip-conditions.html'),'utf8');
  const marker=html.indexOf('const CONTINENTS = '); if(marker<0)fail('현재 프로젝트의 여행지 목록을 찾을 수 없습니다.');
  const continents=literalAt(html,marker+'const CONTINENTS = '.length).data;
  if(!continents || typeof continents!=='object' || Array.isArray(continents))fail('여행지 목록 형식을 확인하세요.');
  const allCities=[...new Set(Object.values(continents).flatMap(rows=>{
    if(!Array.isArray(rows) || rows.some(r=>!Array.isArray(r) || typeof r[1]!=='string'))fail('대륙별 여행지 목록 형식을 확인하세요.');
    return rows.map(r=>r[1]);
  }))];
  const cities=arg('--cities')?[...new Set(arg('--cities').split(',').map(s=>s.trim()).filter(Boolean))]:allCities;
  if(!cities.length || cities.some(c=>!allCities.includes(c)))fail('현재 프로젝트에 있는 여행지만 지정하세요.');
  // 모든 대상의 검색어를 먼저 검사한다. 새 도시가 추가되면 호출 전에 누락을 알린다.
  const catalog=Object.fromEntries(cities.map(city=>{
    const rows=Object.entries(config.keywords).filter(([key])=>key.startsWith(city+'|')).map(([key,keywords])=>({name:key.slice(city.length+1),keywords}));
    if(!rows.length || rows.some(r=>!r.name || !Array.isArray(r.keywords) || !r.keywords.length || r.keywords.length>20 || r.keywords.some(k=>typeof k!=='string' || !k.trim())))fail(`${city}: 검색어 설정이 없습니다. config의 keywords에 추가하세요.`);
    return [city,rows];
  }));
  const end=arg('--end') || shift(koreanToday,-1);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(end) || !Number.isFinite(Date.parse(end)) || ymd(new Date(end))!==end || end>=koreanToday || end<'2016-01-14')fail('--end는 2016-01-14 이후, 한국 시간 어제까지의 실제 날짜여야 합니다.');
  const dates=Array.from({length:14},(_,i)=>shift(end,i-13));
  const provider=process.env.NAVER_TREND_PROVIDER || 'hub';
  if(!['hub','legacy'].includes(provider))fail('지원하는 provider는 hub / legacy입니다.');
  const id=process.env.NAVER_TREND_CLIENT_ID, secret=process.env.NAVER_TREND_CLIENT_SECRET;
  if(!id || !secret || /YOUR_|REPLACE_|여기에/.test(id+secret))fail('API 인증 정보가 없습니다. .env.example의 NAVER 설정을 참고하세요. 실제 조회·파일 생성은 하지 않았습니다.');
  if(process.env.NAVER_TREND_FREE_PLAN_CONFIRMED!=='true')fail('무료 요금제 확인 전에는 호출하지 않습니다. 콘솔에서 요금제를 확인한 뒤 NAVER_TREND_FREE_PLAN_CONFIRMED=true를 설정하세요.');
  const url=provider==='hub'?'https://naverapihub.apigw.ntruss.com/search-trend/v1/search':'https://openapi.naver.com/v1/datalab/search';
  const headers=provider==='hub'?{'X-NCP-APIGW-API-KEY-ID':id,'X-NCP-APIGW-API-KEY':secret}:{'X-Naver-Client-Id':id,'X-Naver-Client-Secret':secret};
  const result={schemaVersion:1,source:'NAVER DataLab Search Trend',provider,fetchedAt:new Date().toISOString(),
    previous:{start:dates[0],end:dates[6]},current:{start:dates[7],end:dates[13]},
    method:'도시별 같은 후보 집합에서 2주간 주평균 최댓값을 100으로 정규화. 변화는 같은 분모로 계산한 전주 대비 점수 차이(p). 요청 간 공통 앵커의 14일 합계로 척도 보정. 절대 검색 횟수나 SNS 언급량 아님.',cities:{}};
  let calls=0;
  for(const city of cities){
    const rows=catalog[city];
    const groups=rows.map(row=>({groupName:row.name,keywords:[...new Set(row.keywords)]}));
    const anchor=groups[0], others=groups.slice(1), batches=[];
    if(!others.length)batches.push([anchor]);
    for(let i=0;i<others.length;i+=4)batches.push([anchor,...others.slice(i,i+4)]);
    let anchorReference=null; const observations=new Map();
    for(const keywordGroups of batches){
      if(++calls>100)fail('실행당 최대 100회 제한을 초과했습니다. 도시 수를 줄이세요.');
      const response=await fetch(url,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({startDate:dates[0],endDate:end,timeUnit:'date',keywordGroups}),signal:AbortSignal.timeout(20000)});
      // 응답 본문/키는 로그에 남기지 않는다. 한도 초과 시 재시도·다른 요금제 전환 없음.
      if(!response.ok)fail(`${city}: NAVER HTTP ${response.status}. 무료 한도·권한·인증을 확인하세요. 추가 호출을 중단했습니다.`);
      const payload=await response.json();
      if(!Array.isArray(payload.results) || payload.startDate!==dates[0] || payload.endDate!==end || payload.timeUnit!=='date')fail(`${city}: 응답 기간/형식이 요청과 다릅니다.`);
      const titles=payload.results.map(r=>r.title);
      if(new Set(titles).size!==titles.length || keywordGroups.some(g=>!titles.includes(g.groupName)))fail(`${city}: 누락·중복된 응답 그룹이 있습니다.`);
      const series=daily(payload.results.find(r=>r.title===anchor.groupName),dates);
      const total=series?.reduce((sum,v)=>sum+v,0);
      if(!total && batches.length>1){observations.clear(); console.log(`${city}: 공통 기준 데이터 부족 · 예시값으로 대체하지 않음`);break;}
      anchorReference ??= total; const scale=batches.length===1?1:anchorReference/total;
      for(const group of keywordGroups){
        if(observations.has(group.groupName))continue;
        const values=daily(payload.results.find(r=>r.title===group.groupName),dates);
        observations.set(group.groupName,values?{previous:values.slice(0,7).reduce((s,v)=>s+v,0)/7*scale,current:values.slice(7).reduce((s,v)=>s+v,0)/7*scale}:null);
      }
    }
    const denominator=Math.max(0,...[...observations.values()].filter(Boolean).flatMap(v=>[v.previous,v.current]));
    result.cities[city]=rows.map(row=>{
      const item=observations.get(row.name); const available=!!item && denominator>0;
      return {name:row.name,keywords:row.keywords,score:available?round(item.current/denominator*100):null,
        deltaPoints:available?round((item.current-item.previous)/denominator*100):null,
        available,reason:available?null:'14일 데이터 부족 또는 기준값 없음'};
    });
    console.log(`${city}: ${result.cities[city].filter(r=>r.available).length}/${rows.length}개 계산`);
  }
  const dataScript='// NAVER 검색 추이 스냅샷 · API 인증 정보 없음\nwindow.GonsangSearchTrends = '+safeJSON(result)+';\n';
  // 원본 HTML과 프로젝트 파일은 그대로 두고, 성공한 실행별 폴더에만 기록한다.
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const folder=path.join(ROOT,'build','naver-trends',stamp);
  await mkdir(folder,{recursive:true});
  await writeFile(path.join(folder,'trend-data.json'),JSON.stringify(result,null,2)+'\n');
  await writeFile(path.join(folder,'trip-conditions.html'),html);
  await writeFile(path.join(folder,'travel-trends-data.js'),dataScript);
  for(const file of ['budget.js','stay.js','travel-trends.js','tour-catalog.js','tour-recommendations.js','flight-budget.js','trip-summary.html'])await copyFile(path.join(ROOT,file),path.join(folder,file));
  if(args.includes('--apply')){
    const temporary=path.join(folder,'apply-data.js'); await writeFile(temporary,dataScript);
    await rename(temporary,path.join(ROOT,'travel-trends-data.js'));
  }
  console.log(`완료: ${folder}\n${calls}회 호출 · ${cities.length}개 도시 · ${args.includes('--apply')?'현재 프로젝트의 검색 추이 데이터만 반영했습니다.':'프로젝트 원본은 그대로입니다. 미리보기 HTML을 열어 확인하세요.'}`);
}
main().catch(error=>{console.error(error instanceof TypeError?'네트워크 요청 또는 데이터 형식을 확인하세요. 원본 파일은 변경하지 않았습니다.':error.message);process.exitCode=1;});

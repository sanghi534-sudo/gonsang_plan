/** NAVER 검색 관심도 스냅샷 생성. Node 22+, 추가 패키지 불필요.
 * HTML은 데이터로만 읽는다. 첨부 HTML의 스크립트를 eval/import하지 않는다.
 * 원본/프로젝트 HTML을 덮어쓰지 않고 build/naver-trends/<실행시각>/ 에 생성한다.
 */
import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
const help = `사용법: node --env-file-if-exists=.env scripts/update-naver-trends.mjs --input "HTML 경로" [--cities "도쿄,파리"] [--end YYYY-MM-DD]
NAVER_TREND_PROVIDER=hub (기본) 또는 legacy (기존 신청자 전용)
NAVER_TREND_CLIENT_ID / NAVER_TREND_CLIENT_SECRET: 서버 환경변수
NAVER_TREND_FREE_PLAN_CONFIRMED=true: 콘솔에서 무료 요금제임을 확인한 뒤에만 설정
출력: build/naver-trends/<실행시각>/trend-data.json, trip-conditions.html, 보조 JS
API는 상대 검색 추이만 제공하며 SNS 언급량·실제 검색 횟수는 제공하지 않습니다.`;

function fail(message) { throw new Error(message); }
const round = n => Math.round(n * 10) / 10;
const ymd = d => d.toISOString().slice(0, 10);
const shift = (date, days) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return ymd(d); };
const koreanToday = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

// HTML 중 T의 제한된 리터럴 문법만 해석: 문자열/숫자/배열/객체. 코드 실행 없음.
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
    fail('T에는 문자열·숫자·배열·객체만 허용됩니다.');
  }
  const data=value(); return {data,end:i};
}

function replaceOnce(source, before, after) {
  if(source.split(before).length!==2)fail(`첨부 HTML 형식이 달라졌습니다. 자동 변경을 중단합니다: ${before.slice(0,60)}`);
  return source.replace(before,after);
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
  const input=arg('--input'); if(!input)fail(help);
  const config=JSON.parse(await readFile(path.join(ROOT,'scripts/naver-trends.config.json'),'utf8'));
  const cities=[...new Set((arg('--cities') || config.cities.join(',')).split(',').map(s=>s.trim()).filter(Boolean))];
  const html=await readFile(path.resolve(input),'utf8');
  const open=html.indexOf('<script id="trend-demo">'), close=html.indexOf('</script>',open);
  if(open<0 || close<0)fail('입력 HTML에 trend-demo 스크립트가 없습니다.');
  let script=html.slice(open,close);
  const marker=script.indexOf('const T = '); if(marker<0)fail('T 데이터를 찾을 수 없습니다.');
  const start=marker+'const T = '.length, parsed=literalAt(script,start), catalog=parsed.data;
  if(Array.isArray(catalog) || !catalog || typeof catalog!=='object')fail('T는 도시별 객체여야 합니다.');
  for(const [city,rows] of Object.entries(catalog)){
    if(!Array.isArray(rows) || !rows.length || rows.some(row=>!Array.isArray(row) || row.length!==8 || typeof row[0]!=='string' || !['명소','핫플','기념품'].includes(row[1]) || ![1,2,3].includes(row[6]) || [4,5,7].some(i=>typeof row[i]!=='string')))fail(`${city}: T 데이터 구조가 올바르지 않습니다.`);
    if(new Set(rows.map(r=>r[0])).size!==rows.length)fail(`${city}: 장소 이름이 중복됩니다.`);
  }
  if(!cities.length || cities.some(c=>!Object.hasOwn(catalog,c)))fail('대상 도시의 장소 목록이 T에 없습니다. 먼저 장소 목록을 추가하세요.');
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
  // 모든 항목의 예시 숫자를 먼저 비운다. 미선택 도시도 실제 데이터로 오인하지 않게 한다.
  for(const rows of Object.values(catalog)) for(const row of rows){row[2]=null;row[3]=null;}
  let calls=0;
  for(const city of cities){
    const rows=catalog[city];
    const groups=rows.map(row=>{
      const key=`${city}|${row[0]}`, keywords=config.keywords[key];
      if(!Array.isArray(keywords) || !keywords.length || keywords.length>20 || keywords.some(k=>typeof k!=='string' || !k.trim()))fail(`${key}: 검색어 설정이 없습니다. config의 keywords에 추가하세요.`);
      return {groupName:row[0],keywords:[...new Set(keywords)]};
    });
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
      if(!total)fail(`${city}: 공통 기준 검색어 데이터가 부족합니다. 숫자를 추정하지 않고 중단합니다.`);
      anchorReference ??= total; const scale=anchorReference/total;
      for(const group of keywordGroups){
        if(observations.has(group.groupName))continue;
        const values=daily(payload.results.find(r=>r.title===group.groupName),dates);
        observations.set(group.groupName,values?{previous:values.slice(0,7).reduce((s,v)=>s+v,0)/7*scale,current:values.slice(7).reduce((s,v)=>s+v,0)/7*scale}:null);
      }
    }
    const denominator=Math.max(0,...[...observations.values()].filter(Boolean).flatMap(v=>[v.previous,v.current]));
    result.cities[city]=rows.map(row=>{
      const item=observations.get(row[0]); const available=!!item && denominator>0;
      row[2]=available?round(item.current/denominator*100):null;
      row[3]=available?round((item.current-item.previous)/denominator*100):null;
      return {name:row[0],keywords:groups.find(g=>g.groupName===row[0]).keywords,score:row[2],deltaPoints:row[3],available,reason:available?null:'14일 데이터 부족 또는 기준값 없음'};
    });
    console.log(`${city}: ${result.cities[city].filter(r=>r.available).length}/${rows.length}개 계산`);
  }
  script=script.slice(0,start)+safeJSON(catalog)+script.slice(parsed.end);
  script=replaceOnce(script,"const BASE_DATE = '2026-10-16';",`const BASE_DATE = '${end}';`);
  script=replaceOnce(script,'DEMO · SNS 화제도 예시','NAVER · 검색 관심도');
  script=replaceOnce(script,'화제도는 시연용 예시 점수예요',`${dates[7]}~${end} 검색 추이 · ▲▼는 전주 대비 점수 차이(p)`);
  script=replaceOnce(script,'const d = delta > 0',`const d = delta == null ? '<span class="tr-flat">비교 불가</span>' : delta > 0`);
  script=replaceOnce(script,'▲${delta}','▲${delta}p');
  script=replaceOnce(script,'▼${-delta}','▼${-delta}p');
  script=replaceOnce(script,'width:${score}%','width:${score ?? 0}%');
  script=replaceOnce(script,'화제도 ${score}${d}','검색 관심도 ${score == null ? "데이터 부족 / 미조회" : score}${d}');
  script=script.replaceAll('b[2] - a[2]','(b[2] ?? -1) - (a[2] ?? -1)');
  script=replaceOnce(script,'화제도 ${it[2]}','검색 관심도 ${it[2] ?? "데이터 부족 / 미조회"}');
  script=replaceOnce(script,'기준 ${BASE_DATE} · 시연용 예시 데이터','기준 ${BASE_DATE} · 네이버 검색 추이 참고 지수');
  const oldCriteria='시연용 예시 점수입니다. 실제 서비스에서는 네이버 데이터랩 검색량 추이와 SNS 언급량(썸트렌드 등)을 0~100으로 정규화하고, 변화는 전주 대비 증감으로 표시합니다.';
  script=replaceOnce(script,oldCriteria,`${result.method} 조회 구간: ${dates[0]}~${end}. 검색어는 후보·별칭을 수동 선정했습니다. 도시 간 점수 비교는 지원하지 않으며 데이터 누락은 0으로 채우지 않습니다.`);
  const commentStart=script.indexOf('/* 시연용 데이터.'), commentEnd=script.indexOf('*/',commentStart);
  if(commentStart<0 || commentEnd<0)fail('T 설명 주석 형식이 변경됐습니다. 원본을 확인하세요.');
  script=script.slice(0,commentStart)+'/* NAVER 상대 검색 추이. null은 데이터 부족/미조회.\n         [이름, 종류, 검색 관심도(0~100), 전주 대비 점수차(p), 촬영 포인트, 해시태그, 걷기, 팁] */'+script.slice(commentEnd+2);
  const output=html.slice(0,open)+script+html.slice(close);
  // 원본 HTML과 프로젝트 파일은 그대로 두고, 성공한 실행별 폴더에만 기록한다.
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const folder=path.join(ROOT,'build','naver-trends',stamp);
  await mkdir(folder,{recursive:true});
  await writeFile(path.join(folder,'trend-data.json'),JSON.stringify(result,null,2)+'\n');
  await writeFile(path.join(folder,'trip-conditions.html'),output);
  for(const file of ['budget.js','stay.js'])await copyFile(path.join(ROOT,file),path.join(folder,file));
  console.log(`완료: ${folder}\n${calls}회 호출 · 원본은 변경하지 않았습니다. 생성한 HTML을 브라우저로 열어 확인하세요.`);
}
main().catch(error=>{console.error(error instanceof TypeError?'네트워크 요청 또는 데이터 형식을 확인하세요. 원본 파일은 변경하지 않았습니다.':error.message);process.exitCode=1;});

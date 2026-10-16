/* 공식 매장과 명시적인 가상 매장 예시로 만드는 방문·식비 계획. 실제 예약을 제공하지 않는다.
 * 공개 지도 추가 조회는 사용자 버튼으로 실행한다. 4km/30개/15초 제한, 실패 시 수동 재시도.
 * 공식 문서: https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL
 * 공개 서버 안내: https://dev.overpass-api.de/overpass-doc/en/preface/commons.html
 */
(() => {
  'use strict';
  const pane = document.getElementById('pane-food');
  if (!pane) return;
  // 큰 사진 풀을 포함한 기본 자료는 한 번만 읽고 수정할 수 없는 모듈 내부 스냅샷으로 둔다.
  const FOOD_DATA=(()=>{
    try {
      const parsed=JSON.parse(document.getElementById('food-place-data')?.textContent||'{}');
      const data=parsed&&typeof parsed==='object'?parsed:{}, pending=[data];
      while (pending.length) {
        const item=pending.pop();
        for (const value of Object.values(item)) if (value&&typeof value==='object') pending.push(value);
        Object.freeze(item);
      }
      return data;
    } catch (_) { return Object.freeze({}); }
  })();
  const $ = (s,r=pane) => r.querySelector(s), $$ = (s,r=pane) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const str = (v,max=500) => typeof v === 'string' ? v.trim().slice(0,max) : '';
  const won = n => '₩' + Math.round(n).toLocaleString('ko-KR');
  const validAmount = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 10000000;
  const validDate = v => {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const d = new Date(v + 'T00:00:00');
    return !Number.isNaN(+d) && [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-') === v;
  };
  const CATS = {'현지 음식':'🍱','해산물':'🦐','고기·구이':'🥩','면·국물':'🍜','카페·디저트':'🍰','길거리 음식':'🌮'};
  const PRICE = {'1만원 이하':[0,10000],'1~3만원':[10001,30000],'3~5만원':[30001,50000],'5만원 이상':[50001,1e9]};
  const MEALS=['아침','점심','저녁'];
  const BREAKFAST=['07:00','07:30','08:00','08:30','09:00','09:30','10:00'];
  const LUNCH = ['11:30','12:00','12:30','13:00','13:30'], DINNER = ['17:30','18:00','18:30','19:00','19:30','20:00','20:30'];
  const STORE = 'gonsang-food-reserve-picks-v5', PREVIOUS = 'gonsang-food-reserve-picks-v4', OLDER = 'gonsang-food-reserve-picks-v3', LEGACY = 'gonsang-food-reserve-picks-v2', LEGACY_V1='gonsang-food-reserve-picks-v1';
  const ctx = () => {
    try {
      const value=window.TripContext?.(), c=value && typeof value==='object'?value:{};
      return {...c,dest:typeof c.dest==='string'?c.dest.trim():'',guests:c.guests && typeof c.guests==='object'?c.guests:{}};
    } catch (_) { return {dest:'',guests:{}}; }
  };
  const keyOf = (city,date,id,meal=ui.meal) => JSON.stringify([city,date,meal,id]);
  const picks = new Map(), drafts = new Map(), cache = new Map(), attempted = new Set(), failedPhotos=new Set(), assignedPhotos=new Map();
  let ownBudget=null, budgetMessage='', budgetBusy=false, manualBudget=false, syncing=false, legacySkipped=false;
  let foods=[], city='', request=null, requestSerial=0, returnFocus=null;
  const ui = {date:'',meal:'아침',sort:'rec',area:'all',query:'',detail:'',loading:false,message:''};

  function validPlanningPlace(p,allowDemo=true) {
    if (!p) return false;
    if (allowDemo && p.source==='demo' && p.sample===true && /^demo-[\w가-힣-]{1,90}$/.test(p.id||'')) return true;
    return !p.sample && ((p.source==='OSM' && /^osm-(node|way|relation)-\d+$/.test(p.id||'')) ||
      (p.source==='official' && /^curated-[\w가-힣-]{1,90}$/.test(p.id||'') && !!safeURL(p.sourceURL||p.place?.sourceURL)));
  }
  function guidesFor(dest) {
    try {
      const data=FOOD_DATA, raw=data.guides?.[dest]||data.cities?.[dest]?.guides||[];
      return Array.isArray(raw)?raw.slice(0,12).filter(g=>g && str(g.name,100)).map(g=>({name:str(g.name,100),kind:Object.hasOwn(CATS,g.kind)?g.kind:'',imageKey:str(g.imageKey,60),description:str(g.description,700),
        venueIds:Array.isArray(g.venueIds)?g.venueIds.filter(id=>typeof id==='string').slice(0,20):[],sourceURL:safeURL(g.sourceURL)})):[];
    } catch (_) { return []; }
  }
  function kindForDish(name) {
    if (/해산|생선|랍스터|새우|크랩|세비체|스시|초밥|굴/.test(name)) return '해산물';
    if (/라멘|우동|소바|쌀국수|포보|국수|수프|락사|우육면|똠얌|파스타/.test(name)) return '면·국물';
    if (/스테이크|바비큐|꼬치|구이|고기|슈바인|케밥|통닭/.test(name)) return '고기·구이';
    if (/커피|디저트|케이크|에그타르트|와플|크루아상|젤라토|빙수|밀크티|차 /.test(name)) return '카페·디저트';
    if (/타코|핫도그|반미|팔라펠|길거리|피시 앤 칩스/.test(name)) return '길거리 음식';
    return '현지 음식';
  }
  function demoFoods(dest,count,actual) {
    const guides=guidesFor(dest);
    if (!guides.length && !actual.length && !centerFor(dest)) return [];
    const dishes=guides.length?guides:[{name:'현지 대표 음식',description:''}];
    let configured=null, names=[];
    try { const data=FOOD_DATA; configured=data.demoPricing?.[dest]||data.pricing?.[dest]; names=Array.isArray(data.demoNames?.[dest])?data.demoNames[dest]:[]; } catch (_) {}
    const amounts=actual.map(p=>p.estimatedPriceKRW).filter(n=>validAmount(n)&&n>0);
    const configuredBase=typeof configured==='number'?configured:configured?.baseKRW;
    const base=validAmount(configuredBase)&&configuredBase>0?configuredBase:Math.min(60000,Math.max(4000,amounts.length?Math.min(...amounts):15000));
    return Array.from({length:count},(_,i)=>{
      const dish=dishes[i%dishes.length], kind=dish.kind||kindForDish(dish.name), multiplier={'현지 음식':1,'해산물':1.5,'고기·구이':1.3,'면·국물':.8,'카페·디저트':.55,'길거리 음식':.65}[kind];
      const estimatedPriceKRW=Math.max(2000,Math.round(base*multiplier*[.9,1,1.1][i%3]/500)*500);
      return {id:'demo-'+dest+'-'+(i+1),city:dest,name:str(names[i],120)||dest+' 테이블 '+(i+1),kind,imageKey:dish.imageKey||'',
        area:['도심','시장 주변','역세권'][i%3],source:'demo',sample:true,score:0,lat:null,lng:null,
        price:estimatedPriceKRW,estimatedPriceKRW,priceSource:'estimate',estimateNote:'도시별 식사 예산 기준과 음식 종류를 고려한 계획용 추정액입니다. 실제 메뉴 가격이 아닙니다.',
        description:dish.name+' 등을 중심으로 한 '+kind+' 메뉴 구성.',dishes:[dish.name],
        address:'',phone:'',website:'',hours:'',closed:'',cuisine:'',menuURL:'',priceRaw:'',sourceURL:'',koMenu:false,vegan:false,waitLow:null,reservable:false};
    });
  }
  function dishesFor(place) {
    if (place.sample) return Array.isArray(place.dishes)?place.dishes:[];
    return guidesFor(place.city).filter(g=>g.venueIds.includes(place.id)).map(g=>g.name);
  }
  function photoKeyFor(f) {
    const guide=guidesFor(f.city).find(g=>g.venueIds.includes(f.id)||(f.sample&&dishesFor(f).includes(g.name)));
    return f.imageKey||guide?.imageKey||'';
  }
  function validatedPhoto(p) {
    try {
      if (!p || !str(p.author,250) || !str(p.license,160)) return null;
      const url=new URL(str(p.url,2048)), source=new URL(str(p.sourceURL,2048));
      const imageHost=['upload.wikimedia.org','thumb.wikimedia.org'].includes(url.hostname)||
        (url.hostname==='commons.wikimedia.org'&&/^\/wiki\/Special(?::|%3A)Redirect\/file\//i.test(url.pathname));
      if (url.protocol!=='https:'||url.username||url.password||!imageHost||source.protocol!=='https:'||source.hostname!=='commons.wikimedia.org'||source.username||source.password||failedPhotos.has(url.href)) return null;
      const licenseLink=safeURL(p.licenseURL);
      let licenseURL=source.href;
      if (licenseLink) { const license=new URL(licenseLink); if (license.protocol==='https:'&&['creativecommons.org','www.gnu.org','commons.wikimedia.org'].includes(license.hostname)) licenseURL=license.href; }
      return {url:url.href,sourceURL:source.href,licenseURL,author:str(p.author,250),license:str(p.license,160),label:str(p.label,160)||'음식 참고사진'};
    } catch (_) { return null; }
  }
  function photoIdentity(photo) {
    // 같은 Commons 원본의 썸네일 크기·호스트·공백/밑줄·인코딩 차이를 중복으로 센다.
    try {
      const source=new URL(photo.sourceURL);
      let name=source.searchParams.get('title')||source.pathname;
      for (let i=0;i<2;i++) { try { const decoded=decodeURIComponent(name); if(decoded===name) break; name=decoded; } catch (_) { break; } }
      const file=name.match(/(?:^|\/)(?:File:|Special:Redirect\/file\/|Special:FilePath\/)(.+)$/i);
      if (file) return 'commons-file:'+file[1].normalize('NFC').replace(/_/g,' ').replace(/\s+/g,' ').trim().toLocaleLowerCase('en-US');
      return source.origin+source.pathname.normalize('NFC').replace(/_/g,' ').toLocaleLowerCase('en-US');
    } catch (_) { return ''; }
  }
  function assignPhotos(dest,list) {
    const data=FOOD_DATA;
    const previous=assignedPhotos.get(dest)||new Map(), next=new Map(), used=new Set(), pools=new Map();
    const poolFor=key=>{
      if (pools.has(key)) return pools.get(key);
      const raw=[data.images?.[key],...(Array.isArray(data.imagePools?.[key])?data.imagePools[key].slice(0,80):[])];
      const unique=new Map();
      for (const entry of raw) { const photo=validatedPhoto(entry), identity=photo&&photoIdentity(photo); if (identity&&!unique.has(identity)) unique.set(identity,{photo,identity}); }
      const pool=[...unique.values()]; pools.set(key,pool); return pool;
    };
    // 실제 장소를 먼저 배정한다. 화면의 정렬·필터·날짜·식사 변경은 이 배정을 바꾸지 않는다.
    for (const place of [...list].sort((a,b)=>Number(a.sample)-Number(b.sample))) {
      const key=photoKeyFor(place);
      if (!key) { next.set(place.id,{key,photo:null}); continue; }
      const pool=poolFor(key), old=previous.get(place.id), oldIdentity=old?.photo&&photoIdentity(old.photo);
      const retained=old?.key===key?pool.find(entry=>entry.identity===oldIdentity&&!used.has(entry.identity)):null;
      const chosen=retained||pool.find(entry=>!used.has(entry.identity));
      next.set(place.id,{key,photo:chosen?.photo||null});
      if (chosen) used.add(chosen.identity);
    }
    assignedPhotos.set(dest,next);
  }
  function photoFor(f) {
    const assigned=assignedPhotos.get(f.city)?.get(f.id), photo=assigned?.photo;
    return photo&&!failedPhotos.has(photo.url)?photo:null;
  }
  function referencePhoto(f,detail=false) {
    const photo=photoFor(f);
    return '<figure class="fd-reference-figure'+(detail?' fd-reference-detail':'')+'"><div class="fd-reference-photo"><span aria-hidden="true">'+(CATS[f.kind]||'🍽')+'</span>'+
      (photo?'<img class="fd-food-image" src="'+esc(photo.url)+'" alt="'+esc(photo.label+' · 음식 참고사진, 실매장 사진 아님')+'" loading="lazy" referrerpolicy="no-referrer">':'')+
      '<small>'+(photo?'음식 참고사진 · 실매장 사진 아님':'음식 종류 일러스트 · 사진 미제공')+'</small></div><figcaption>'+
      (photo?(detail?'<a href="'+esc(photo.sourceURL)+'" target="_blank" rel="noopener noreferrer">'+esc(photo.author)+'</a> · <a href="'+esc(photo.licenseURL)+'" target="_blank" rel="noopener noreferrer">'+esc(photo.license)+'</a> · ':'')+'<a href="'+esc(photo.sourceURL)+'" target="_blank" rel="noopener noreferrer">음식 사진 출처 ↗</a>':'매장 실사진은 제공하지 않아요.')+'</figcaption></figure>';
  }
  function baselineFor(dest) {
    try {
      const data=FOOD_DATA;
      const cities=data.cities||data, cityData=Array.isArray(cities)?cities.filter(p=>p.city===dest):Object.hasOwn(cities,dest)?cities[dest]:[];
      const list=Array.isArray(cityData)?cityData:Array.isArray(cityData?.places)?cityData.places:[];
      return list.slice(0,30).map((raw,index)=>{
        if (!raw || !str(raw.name,180)) return null;
        const sourceURL=safeURL(raw.sourceURL||raw.source?.url||raw.url), id=str(raw.id,100)||'curated-'+dest+'-'+(index+1);
        if (!sourceURL || !/^curated-[\w가-힣-]{1,90}$/.test(id)) return null;
        const place=storedPlace({...raw,source:'official',sourceURL},dest,id,str(raw.name,180));
        return {...place,source:'official',score:0,price:place.estimatedPriceKRW,priceSource:validAmount(place.estimatedPriceKRW)?'estimate':'unknown',website:safeURL(raw.website)||sourceURL};
      }).filter(Boolean);
    } catch (_) { return []; }
  }
  function mergedFoods(dest,additional=[]) {
    const unique=new Map();
    for (const place of [...baselineFor(dest),...additional]) if (!unique.has(place.id)) unique.set(place.id,place);
    const actual=[...unique.values()];
    for (const place of demoFoods(dest,Math.max(0,20-actual.length),actual)) unique.set(place.id,place);
    const result=[...unique.values()];
    assignPhotos(dest,result);
    // 현재 목록의 이름·추정치를 적용하되, 직접 입력한 금액과 공란은 보존한다.
    for (const saved of picks.values()) {
      if (saved.city!==dest) continue;
      const place=unique.get(saved.id);
      if (place&&saved.source==='demo') { saved.name=place.name; saved.place=storedPlace(place,dest,place.id,place.name); }
      if (saved.priceSource==='manual') continue;
      if (place && validAmount(place.estimatedPriceKRW)) {
        saved.price=place.estimatedPriceKRW; saved.priceSource='estimate'; saved.place=storedPlace(place,dest,place.id,place.name);
      }
    }
    return result;
  }
  function importPicks(raw,allowDemo=false) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
    for (const p of Object.values(raw).slice(0,2000)) {
      // city가 없는 예전 기록을 현재 여행지에 임의로 배정하지 않는다.
      if (!validPlanningPlace(p,allowDemo) || !str(p.city,80) || !validDate(p.date) || !str(p.name,180)) { legacySkipped=true; continue; }
      const pCity=str(p.city,80), id=str(p.id,100), meal=MEALS.includes(p.meal)?p.meal:'';
      picks.set(keyOf(pCity,p.date,id,meal),{city:pCity,id,date:p.date,meal,name:str(p.name,180),price:validAmount(p.price)?p.price:null,
        slot:/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(p.slot||'')?p.slot:'',sample:p.source==='demo',source:p.source,sourceURL:p.source==='demo'?'':safeURL(p.sourceURL||p.place?.sourceURL),
        priceSource:['manual','estimate'].includes(p.priceSource)?p.priceSource:'unknown',place:storedPlace({...p,...p.place,source:p.source},pCity,id,str(p.name,180))});
    }
  }
  try {
    const saved=[STORE,PREVIOUS,OLDER,LEGACY].map(key=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch(_){return null;}}).find(value=>[2,3,4,5].includes(value?.version));
    if (saved) {
      if (saved.version===5) manualBudget=saved.manualBudget===true;
      importPicks(saved.picks,saved.version>=4);
      const b=saved.autoBudget;
      if (b && str(b.city,80) && Number.isFinite(b.amount) && b.amount>=0 && b.amount<=1e12 && b.cur==='KRW') ownBudget={city:b.city,amount:b.amount,cur:'KRW'};
    } else importPicks(JSON.parse(localStorage.getItem(LEGACY_V1)||'{}'));
  } catch (_) {}
  const persist = () => { try { localStorage.setItem(STORE,JSON.stringify({version:5,picks:Object.fromEntries(picks),autoBudget:ownBudget,manualBudget:manualBudget===true})); } catch (_) {} };
  function tripDates(c) {
    if (!validDate(c.start)) return [];
    const dates=[], first=new Date(c.start+'T00:00:00'), last=new Date((validDate(c.end)?c.end:c.start)+'T00:00:00');
    for (let d=new Date(first);d<=last && dates.length<366;d.setDate(d.getDate()+1))
      dates.push([d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'));
    return dates;
  }
  const sel = key => $$('.opts[data-key="'+key+'"] .opt.on').map(b=>b.textContent.trim());
  const currentPicks = () => { const c=ctx(), dates=tripDates(c); return [...picks.values()].filter(p=>validPlanningPlace(p) && p.city===c.dest && dates.includes(p.date)); };
  const people = () => { const g=ctx().guests||{}; return Math.max(1,['adult','child'].reduce((a,k)=>a+(Number.isInteger(g[k]) && g[k]>0?g[k]:0),0)); };
  const pickedFor = f => picks.get(keyOf(f.city,ui.date,f.id));
  const referencePick = f => pickedFor(f)||[...picks.values()].find(p=>p.city===f.city&&p.date===ui.date&&p.id===f.id&&!p.meal);
  const estimate = f => {
    const key=keyOf(f.city,ui.date,f.id), selected=referencePick(f);
    if (drafts.has(key)) return drafts.get(key);
    if (selected && (selected.priceSource==='manual'||validAmount(selected.price))) return selected.price;
    return validAmount(f.price)?f.price:null;
  };
  function priceSourceFor(f) {
    if (drafts.has(keyOf(f.city,ui.date,f.id))) return 'manual';
    const selected=referencePick(f);
    if (selected && ['manual','estimate'].includes(selected.priceSource)) return selected.priceSource;
    return validAmount(f.estimatedPriceKRW)?'estimate':'unknown';
  }
  function priceLabel(f) {
    const amount=estimate(f);
    if (!validAmount(amount)) return '가격 확인 필요 · 직접 입력 가능';
    return priceSourceFor(f)==='estimate'?'1인 한 끼 예상 '+won(amount)+' · 직접 수정 가능':'1인 계획액 '+won(amount)+' · 직접 입력';
  }
  function safeURL(value) {
    try {
      const valueStr=str(value,2048), url=new URL(valueStr);
      if (!['https:','http:'].includes(url.protocol) || url.username || url.password || /[\u0000-\u0020]/.test(valueStr) ||
        /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url.hostname)) return '';
      return url.href;
    } catch (_) { return ''; }
  }
  function storedPlace(raw,dest,id,name) {
    const p=raw && typeof raw==='object'?raw:{};
    const source=p.source==='demo'?'demo':p.source==='official'?'official':'OSM', demo=source==='demo';
    const coords=!demo&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180;
    const osm=id.match(/^osm-(node|way|relation)-(\d+)$/);
    return {id,city:dest,name,source,kind:Object.hasOwn(CATS,p.kind)?p.kind:'음식점',area:str(p.area,100)||'지역 미등록',
      lat:coords?p.lat:null,lng:coords?p.lng:null,price:null,sample:demo,score:0,description:str(p.description),address:demo?'':str(p.address),phone:demo?'':str(p.phone,80),
      website:demo?'':safeURL(p.website),hours:demo?'':str(p.hours,800),closed:demo?'':str(p.closed,300)||str(p.closedDays,300),cuisine:str(p.cuisine,160),menuURL:demo?'':safeURL(p.menuURL),priceRaw:demo?'':str(p.priceRaw,160),
      estimatedPriceKRW:validAmount(p.estimatedPriceKRW)?p.estimatedPriceKRW:null,
      imageKey:str(p.imageKey,60),
      estimateNote:str(p.estimateNote,500)||(validAmount(p.estimatedPriceKRW)?'계획용 추정액이며 실제 메뉴 가격이 아닙니다.':''),
      dishes:Array.isArray(p.dishes)?p.dishes.map(v=>str(v,100)).filter(Boolean).slice(0,8):[],
      koMenu:!demo&&p.koMenu===true,vegan:!demo&&p.vegan===true,reservable:!demo&&p.reservable===true,waitLow:null,reservation:demo?'':str(p.reservation,80),wheelchair:demo?'':str(p.wheelchair,80),takeaway:demo?'':str(p.takeaway,80),
      checkedAt:/^\d{4}-\d{2}-\d{2}$/.test(p.checkedAt||'')?p.checkedAt:'',
      sourceURL:demo?'':source==='official'?safeURL(p.sourceURL):osm?'https://www.openstreetmap.org/'+osm[1]+'/'+osm[2]:''};
  }
  const phoneURL = value => { const n=str(value,80).replace(/[\s().-]/g,''); return /^\+?\d{5,18}$/.test(n)?'tel:'+n:''; };
  function maps(f) {
    if (f.sample) return {map:'https://www.openstreetmap.org/search?query='+encodeURIComponent(f.city),route:''};
    if (Number.isFinite(f.lat) && Number.isFinite(f.lng))
      return {map:'https://www.openstreetmap.org/?mlat='+f.lat+'&mlon='+f.lng+'#map=17/'+f.lat+'/'+f.lng,
        route:'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(f.lat+','+f.lng)};
    return {map:'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(f.name+' '+f.city),
      route:'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(f.name+' '+f.city)};
  }
  function embedURL(f) {
    // 실제 OSM 장소 좌표만 사용한다. Web Mercator 범위를 벗어나면 외부 지도 링크를 쓴다.
    if (f.sample || !Number.isFinite(f.lat) || !Number.isFinite(f.lng) || Math.abs(f.lat)>85 || Math.abs(f.lng)>180) return '';
    const south=Math.max(-85,f.lat-.005), north=Math.min(85,f.lat+.005);
    const west=Math.max(-180,f.lng-.008), east=Math.min(180,f.lng+.008);
    const url=new URL('https://www.openstreetmap.org/export/embed.html');
    url.searchParams.set('bbox',[west,south,east,north].map(n=>n.toFixed(6)).join(','));
    url.searchParams.set('layer','mapnik'); url.searchParams.set('marker',f.lat.toFixed(6)+','+f.lng.toFixed(6));
    return url.href;
  }
  function centerFor(dest) {
    try {
      const all=JSON.parse(document.getElementById('course-data')?.textContent||'{}').cities;
      const p=all && Object.hasOwn(all,dest)?all[dest]:null;
      return p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat)<=90 && Math.abs(p.lng)<=180?p:null;
    } catch (_) { return null; }
  }
  function fromOSM(e,dest) {
    if (!e || !['node','way','relation'].includes(e.type) || !Number.isSafeInteger(e.id) || e.id<1) return null;
    const t=e.tags||{}, name=str(t['name:ko'],180)||str(t.name,180), p=e.type==='node'?e:e.center;
    if (!name || !['restaurant','cafe','fast_food'].includes(t.amenity) || !p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat)>90 || Math.abs(p.lon)>180) return null;
    const cuisine=str(t.cuisine,160), raw=cuisine.toLowerCase();
    const kind=t.amenity==='cafe'?'카페·디저트':/seafood|fish/.test(raw)?'해산물':/steak|barbecue|bbq|grill/.test(raw)?'고기·구이':
      /ramen|noodle|udon|soba|pho/.test(raw)?'면·국물':t.amenity==='fast_food'?'길거리 음식':'현지 음식';
    const area=str(t['addr:suburb'],100)||str(t['addr:neighbourhood'],100)||str(t['addr:district'],100)||'지역 미등록';
    const address=str(t['addr:full'])||['addr:postcode','addr:city','addr:suburb','addr:street','addr:housenumber'].map(k=>str(t[k],140)).filter(Boolean).join(' ');
    const yes=v=>['yes','only','required'].includes(String(v||'').toLowerCase());
    return {id:'osm-'+e.type+'-'+e.id,city:dest,source:'OSM',name,kind,area,price:null,sample:false,score:0,lat:p.lat,lng:p.lon,cuisine,
      koMenu:yes(t['menu:ko'])||/(^|[;, ])ko([;, ]|$)/i.test(str(t['menu:languages'])),
      vegan:yes(t['diet:vegan'])||yes(t['diet:vegetarian']),waitLow:null,reservable:yes(t.reservation),
      description:str(t['description:ko'])||str(t.description)||(cuisine?'음식 종류 태그: '+cuisine:'OpenStreetMap에 등록된 '+(t.amenity==='cafe'?'카페':'음식점')+'이에요.'),
      address,phone:str(t['contact:phone'],80)||str(t.phone,80),website:safeURL(t['contact:website']||t.website),hours:str(t.opening_hours,800),
      menuURL:safeURL(t['website:menu']||t.menu),priceRaw:str(t.charge,160),reservation:str(t.reservation,80),wheelchair:str(t.wheelchair,80),takeaway:str(t.takeaway,80),
      sourceURL:'https://www.openstreetmap.org/'+e.type+'/'+e.id};
  }
  async function fetchOSM() {
    const dest=ctx().dest, center=centerFor(dest);
    if (ui.loading || !dest) return;
    attempted.add(dest);
    if (!center) { ui.message='이 여행지의 중심 위치를 확인하지 못했어요. 다른 여행지를 선택해 주세요.'; renderResults(); return; }
    const serial=++requestSerial, controller=new AbortController();
    request=controller; ui.loading=true; ui.message=''; renderResults();
    const timer=setTimeout(()=>controller.abort(),15000);
    try {
      const query='[out:json][timeout:12][maxsize:8388608];nwr(around:4000,'+center.lat.toFixed(6)+','+center.lng.toFixed(6)+')["amenity"~"^(restaurant|cafe|fast_food)$"]["name"];out center 30;';
      const response=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
        body:new URLSearchParams({data:query}),signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
      if (!response.ok) throw Error('public service error');
      const data=await response.json();
      if (data.remark || !Array.isArray(data.elements)) throw Error('incomplete public response');
      const seen=new Set(), list=data.elements.slice(0,30).map(e=>fromOSM(e,dest)).filter(f=>f && !seen.has(f.id) && seen.add(f.id));
      cache.set(dest,{foods:list,loadedAt:new Date().toISOString()});
      if (serial!==requestSerial || ctx().dest!==dest) return;
      closeDetail(); foods=mergedFoods(dest,list); ui.area='all';
      ui.message=list.length?'무료 지도 등록 장소 '+list.length+'곳을 불러왔어요. 인기 순위가 아니며 가격·영업 여부는 확인이 필요해요.':'주변 등록 매장을 더 찾지 못했어요. 공식 안내에서 확인한 매장은 계속 볼 수 있어요.';
    } catch (_) {
      if (serial===requestSerial && ctx().dest===dest) ui.message='무료 장소 데이터를 불러오지 못했어요. 현재 목록은 유지했어요. 버튼으로 직접 다시 시도해 주세요.';
    } finally {
      clearTimeout(timer);
      if (serial===requestSerial) { request=null; ui.loading=false; renderResults(); }
    }
  }

  const style=document.createElement('style');
  style.textContent=`
    #pane-food .fd-strip{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 10px;margin:0 -2px}
    #pane-food .fd-day{flex:none;min-width:58px;padding:8px 6px;border-radius:14px;border:1px solid var(--line);background:#fff;text-align:center}
    #pane-food .fd-day small{display:block;font-size:11px;color:var(--sub)}#pane-food .fd-day b{display:block;font-size:17px;margin-top:2px}
    #pane-food .fd-day.on{background:var(--teal-d);border-color:var(--teal-d);color:#fff}#pane-food .fd-day.on small{color:#fff}
    #pane-food .fd-meal{display:flex;gap:6px;margin:4px 0 14px;flex-wrap:wrap}#pane-food .fd-meal button{padding:8px 16px;border-radius:999px;border:1px solid var(--line);font-size:13px;font-weight:700;background:#fff}#pane-food .fd-meal button.on{background:var(--teal-soft);border-color:var(--teal-d);color:var(--teal-d)}
    #pane-food .fd-cats{display:flex;flex-wrap:nowrap;gap:6px;overflow-x:auto;padding:4px 0 12px;margin-bottom:6px;border-bottom:1px solid var(--soft2)}#pane-food .fd-cats .opt.cat{flex:none;display:flex;flex-direction:column;align-items:center;gap:6px;min-width:76px;padding:10px 8px;border-radius:16px;border:1px solid transparent;background:none;font-size:12px}#pane-food .fd-cats .opt.cat::before{content:attr(data-ic);display:grid;place-items:center;width:52px;height:52px;border-radius:50%;background:var(--gray);font-size:26px}#pane-food .fd-cats .opt.cat.on{background:none;border-color:transparent;color:var(--teal-d)}#pane-food .fd-cats .opt.cat.on::before{background:var(--teal-soft);box-shadow:inset 0 0 0 2px var(--teal-d)}
    #pane-food .fd-filters{display:flex;flex-direction:column;gap:10px;margin:12px 0 4px}#pane-food .fd-filters .opts{margin:0;gap:6px}#pane-food .fd-filters .opt{padding:7px 13px;font-size:13px}#pane-food .fd-filters .lbl{font-size:12px;font-weight:800;color:var(--sub);margin:0 0 5px}
    #pane-food .fd-searchbar{display:grid;grid-template-columns:minmax(130px,.7fr) minmax(150px,1.3fr);gap:10px;margin:18px 0 10px}#pane-food .fd-searchbar label{display:block;font-size:12px;font-weight:750;color:#5c7166}#pane-food .fd-searchbar select,#pane-food .fd-searchbar input{display:block;width:100%;min-width:0;box-sizing:border-box;border:1px solid var(--line);border-radius:12px;background:#fff;padding:11px;margin-top:6px;color:var(--ink);font:inherit;font-size:13px}
    #pane-food .fd-sourcebar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0}#pane-food .fd-sourcebar button,#pane-food .fd-detail-button{border:1px solid #bdd3c7;color:#1d735a;background:#fff;border-radius:10px;padding:8px 11px;font-size:12px;font-weight:750}#pane-food .fd-sourcebar button:disabled{opacity:.5;cursor:default}
    #pane-food .fd-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:18px 0 12px;flex-wrap:wrap}#pane-food .fd-bar strong{font-size:16px}#pane-food .fd-sort{display:flex;gap:4px;flex-wrap:wrap}#pane-food .fd-sort button{padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;color:var(--sub)}#pane-food .fd-sort button.on{color:var(--ink);background:var(--soft2)}
    #pane-food .fd-note{padding:10px 12px;border-radius:12px;background:#fff4df;color:#805510;font-size:12px;line-height:1.7;margin:10px 0}#pane-food .fd-small{font-size:11px;line-height:1.7;color:var(--sub);margin:6px 0}
    #pane-food .fd-list{display:flex;flex-direction:column}#pane-food .fd-card{display:grid;grid-template-columns:152px minmax(0,1fr);gap:16px;padding:19px 0;border-bottom:1px solid var(--soft2)}#pane-food .fd-card:last-child{border-bottom:0}
    #pane-food .fd-photo{position:relative;aspect-ratio:1/1;border-radius:16px;display:grid;place-items:center;font-size:54px;background:linear-gradient(135deg,var(--teal-soft),#d9f17c55);align-content:center;gap:8px}#pane-food .fd-photo small{font-size:10px;color:#527161;text-align:center;padding:0 8px}#pane-food .fd-badge{position:absolute;left:7px;top:7px;background:#fff;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:800;color:#587664}
    #pane-food .fd-heart{position:absolute;right:5px;top:4px;font-size:21px;color:#65856d;background:#fff;border-radius:50%;width:30px;height:30px}#pane-food .fd-heart.on{color:#e0245e}#pane-food .fd-heart:disabled,#pane-food .fd-slot:disabled{opacity:.4;cursor:default}
    #pane-food .fd-info{min-width:0;display:flex;flex-direction:column}#pane-food .fd-name{display:flex;justify-content:space-between;gap:8px;align-items:baseline;flex-wrap:wrap}#pane-food .fd-name b{font-size:17px;overflow-wrap:anywhere}#pane-food .fd-rate{font-size:11px;color:var(--sub)}#pane-food .fd-sub{font-size:12px;color:var(--sub);line-height:1.7;margin-top:5px}#pane-food .fd-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}#pane-food .fd-tag{font-size:10px;font-weight:700;padding:3px 7px;border-radius:6px;background:var(--gray);color:#555}
    #pane-food .fd-card-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px}#pane-food .fd-card-actions a{font-size:12px;color:#1d735a;text-underline-offset:3px}
    #pane-food .fd-slots{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}#pane-food .fd-slot{min-width:60px;padding:8px 9px;border-radius:9px;border:1px solid #bcd1c5;color:var(--teal-d);font-weight:750;font-size:12px;background:#fff}#pane-food .fd-slot.on{background:var(--teal-d);color:#fff}
    #pane-food .fd-picks{position:sticky;bottom:12px;margin-top:16px;padding:14px 16px;border-radius:16px;background:#113f34;color:#fff;display:flex;justify-content:space-between;align-items:center;gap:12px;box-shadow:0 8px 24px #0003;z-index:2}#pane-food .fd-picks span{font-size:12px;line-height:1.7}#pane-food .fd-picks strong{font-size:17px}#pane-food .fd-picks button{padding:9px 12px;border-radius:10px;background:#ffffff26;font-weight:700;font-size:12px;color:#fff;flex:none}#pane-food .fd-empty{padding:38px 12px;text-align:center;color:var(--sub);font-size:13px;line-height:1.8}
    #pane-food .fd-dialog{border:1px solid #dce5df;border-radius:22px;width:min(690px,calc(100% - 24px));max-height:90vh;box-sizing:border-box;padding:0;color:#223b2e;background:#fff}#pane-food .fd-dialog::backdrop{background:#102c2499}#pane-food .fd-dialog-inner{padding:22px}
    #pane-food .fd-dialog-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}#pane-food .fd-dialog h3{font-size:23px;line-height:1.5;margin:4px 0 8px;overflow-wrap:anywhere}#pane-food .fd-close{border:1px solid var(--line);background:#fff;border-radius:50%;width:34px;height:34px;flex:none;font-size:17px}
    #pane-food .fd-detail-art{padding:20px;border-radius:15px;background:linear-gradient(120deg,#eef6ed,#e0eedf);display:flex;align-items:center;gap:15px;margin:16px 0;font-size:48px}#pane-food .fd-detail-art span{font-size:12px;line-height:1.8;color:#5b705f}#pane-food .fd-dialog h4{font-size:15px;margin:24px 0 10px}#pane-food .fd-dialog p{font-size:13px;line-height:1.8;overflow-wrap:anywhere}
    #pane-food .fd-meta{display:grid;grid-template-columns:100px minmax(0,1fr);gap:10px 12px;font-size:12px;line-height:1.8}#pane-food .fd-meta dt{color:#718177}#pane-food .fd-meta dd{margin:0;overflow-wrap:anywhere}#pane-food .fd-dialog a{color:#1d735a;text-underline-offset:3px;overflow-wrap:anywhere}
    #pane-food .fd-location{margin:18px 0 10px}#pane-food .fd-map-frame{display:block;width:100%;height:240px;max-width:100%;box-sizing:border-box;border:1px solid #d9e4dc;border-radius:13px;background:#edf3ee}#pane-food .fd-map-caption{margin:7px 0;font-size:11px;line-height:1.8;color:#6d7f71;overflow-wrap:anywhere}
    #pane-food .fd-plan-price{display:block;margin:16px 0 6px;font-size:12px;font-weight:750}#pane-food .fd-plan-price input{display:block;width:100%;box-sizing:border-box;border:1px solid #bed1c4;border-radius:10px;padding:11px;margin-top:7px;font:inherit}
    #pane-food .fd-detail-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}#pane-food .fd-detail-actions button,#pane-food .fd-detail-actions a{padding:11px 14px;border:1px solid #bed1c4;background:#fff;border-radius:10px;font:inherit;font-size:12px;text-decoration:none}#pane-food .fd-detail-actions button[data-fd-pick]{background:#1d735a;color:#fff;border-color:#1d735a}#pane-food .fd-detail-actions button:disabled{opacity:.5}
    #pane-food .fd-picked-details{margin:12px 0;font-size:12px;color:#476650}#pane-food .fd-picked-details summary{cursor:pointer;font-weight:750}#pane-food .fd-picked-row{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:11px 0;border-bottom:1px solid #e4ebe6}#pane-food .fd-picked-row span{min-width:0;overflow-wrap:anywhere}#pane-food .fd-picked-row small{display:block;margin-top:4px;color:#79897e}#pane-food .fd-picked-row button{flex:none;border:1px solid #c4d5c8;border-radius:8px;padding:7px 9px;background:#fff;font-size:11px}
    #pane-food .fd-food-guide{margin:18px 0 24px;padding:18px;background:#f3f8f2;border:1px solid #dce7dc;border-radius:17px}#pane-food .fd-food-guide[hidden]{display:none}#pane-food .fd-food-guide h4{font-size:18px;margin:0 0 8px}#pane-food .fd-guide-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:14px}#pane-food .fd-guide-card{min-width:0;border-radius:12px;padding:14px;background:#fff;border:1px solid #e0e9df}#pane-food .fd-guide-card strong{font-size:15px;color:#22553f}#pane-food .fd-guide-card p{font-size:12px;line-height:1.8;color:#657768;margin:8px 0}#pane-food .fd-guide-card>a{font-size:10px;color:#6c806e}#pane-food .fd-guide-links{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}#pane-food .fd-guide-links button{font-size:11px;line-height:1.6;background:#edf5eb;color:#285b3b;border:1px solid #cbdcc7;border-radius:8px;padding:6px 9px;overflow-wrap:anywhere}#pane-food .fd-guide-card p,#pane-food .fd-guide-card strong{overflow-wrap:anywhere}
    #pane-food .fd-meal-plan{padding:15px;border:1px solid #cdded0;border-radius:16px;background:#f2f8f2;margin:8px 0 18px}#pane-food .fd-meal-plan-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:14px}#pane-food .fd-meal-plan-head>span{font-size:11px;color:#6a806d}#pane-food .fd-meal-plan-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:12px}#pane-food .fd-meal-cell{min-width:0;border:1px solid #d9e6da;background:#fff;border-radius:12px;overflow:hidden}#pane-food .fd-meal-cell.on{border-color:#1d735a;box-shadow:0 0 0 1px #1d735a}#pane-food .fd-meal-choose{width:100%;text-align:left;padding:12px;display:block;background:none}#pane-food .fd-meal-choose b{display:block;color:#225c40;font-size:14px}#pane-food .fd-meal-choose span{display:block;margin-top:7px;font-size:12px;line-height:1.6;overflow-wrap:anywhere}#pane-food .fd-meal-choose small{display:block;font-size:10px;line-height:1.6;margin-top:6px;color:#778b79}#pane-food .fd-meal-cancel{display:block;width:100%;padding:7px;background:#f4f7f3;border-top:1px solid #e2eae0;font-size:10px;color:#6d806e}#pane-food .fd-assign{border:1px solid #1d735a;background:#1d735a;color:#fff;padding:8px 11px;font-size:12px;font-weight:750;border-radius:9px}
    #pane-food .fd-card-media{position:relative;min-width:0}#pane-food .fd-card-media .fd-badge,#pane-food .fd-card-media .fd-heart{z-index:3}#pane-food .fd-reference-figure{margin:0;min-width:0}#pane-food .fd-reference-photo{position:relative;display:grid;place-items:center;height:140px;overflow:hidden;border-radius:15px;background:linear-gradient(135deg,#e5f0df,#d5e5cc);font-size:48px}#pane-food .fd-food-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1}#pane-food .fd-reference-photo>small{position:absolute;bottom:0;left:0;right:0;z-index:2;padding:5px;background:#fffE;color:#536b54;text-align:center;font-size:9px;line-height:1.5}#pane-food .fd-reference-figure figcaption{font-size:9px;line-height:1.6;color:#718474;margin:5px 0;overflow-wrap:anywhere}#pane-food .fd-reference-figure figcaption a{color:inherit;text-underline-offset:2px}#pane-food .fd-reference-detail{margin:17px 0}#pane-food .fd-reference-detail .fd-reference-photo{height:245px}#pane-food .fd-reference-detail figcaption{font-size:10px}
    @media(max-width:560px){#pane-food .fd-reference-photo{height:180px}#pane-food .fd-reference-detail .fd-reference-photo{height:220px}}
    @media(max-width:560px){#pane-food .fd-meal-plan-grid{grid-template-columns:1fr}#pane-food .fd-meal-choose{padding:11px}}
    #pane-food button:focus-visible,#pane-food a:focus-visible,#pane-food input:focus-visible,#pane-food select:focus-visible{outline:3px solid #9ec5ad;outline-offset:3px}
    @media(max-width:560px){#pane-food .fd-guide-grid{grid-template-columns:1fr}#pane-food .fd-food-guide{padding:14px}}
    @media(max-width:560px){#pane-food .fd-card{grid-template-columns:1fr}#pane-food .fd-photo{aspect-ratio:16/8}#pane-food .fd-searchbar{grid-template-columns:1fr}#pane-food .fd-picks{position:static;flex-wrap:wrap}#pane-food .fd-dialog-inner{padding:17px}#pane-food .fd-meta{grid-template-columns:76px minmax(0,1fr)}#pane-food .fd-detail-actions>*{flex:1;text-align:center}}
  `;
  document.head.appendChild(style);
  const dialog=document.createElement('dialog');
  dialog.className='fd-dialog'; dialog.setAttribute('aria-labelledby','fd-detail-title'); pane.appendChild(dialog);
  const guideBox=document.createElement('section'); guideBox.className='fd-food-guide'; guideBox.setAttribute('aria-label','전통 음식과 도시 대표 먹거리');
  pane.insertBefore(guideBox,pane.querySelector('.opts[data-key="foodKind"]')||pane.querySelector('#foodResults'));
  function renderGuide() {
    const guides=guidesFor(city);
    guideBox.hidden=!city||!guides.length;
    if (guideBox.hidden) { guideBox.innerHTML=''; return; }
    guideBox.innerHTML='<h4>전통 음식과 도시 대표 먹거리</h4><p class="fd-small">대표 음식의 특징을 알아보고 연결된 식당과 메뉴를 살펴보세요.</p><div class="fd-guide-grid">'+guides.map(g=>{
      const actual=foods.filter(f=>!f.sample&&g.venueIds.includes(f.id));
      const examples=actual.length?[]:foods.filter(f=>f.sample&&dishesFor(f).includes(g.name)).slice(0,1);
      return '<article class="fd-guide-card"><strong>'+esc(g.name)+'</strong><p>'+esc(g.description)+'</p><div class="fd-guide-links">'+[...actual,...examples].map(f=>'<button type="button" data-fd-guide-place="'+esc(f.id)+'">'+esc(f.sample?'추천 식당 보기':f.name)+' ↗</button>').join('')+'</div>'+(g.sourceURL?'<a href="'+esc(g.sourceURL)+'" target="_blank" rel="noopener noreferrer">먹거리 자료 출처 ↗</a>':'')+'</article>';
    }).join('')+'</div>';
  }
  function closeDetail() {
    const id=ui.detail;
    if (dialog.open) dialog.close();
    ui.detail='';
    const replacement=$$('[data-fd-detail]').find(b=>b.dataset.fdDetail===id);
    (returnFocus?.isConnected?returnFocus:replacement||$('#fd-search'))?.focus({preventScroll:true});
    returnFocus=null;
  }
  function ensureCity() {
    const next=String(ctx().dest||'').trim();
    if (city===next) return;
    requestSerial++; request?.abort(); request=null; ui.loading=false; closeDetail();
    city=next; ui.area='all'; ui.query=''; ui.message=attempted.has(city)&&!cache.has(city)?'이 여행지의 조회를 완료하지 못했어요. 다시 불러오기를 눌러 주세요.':'';
    foods=mergedFoods(city,cache.get(city)?.foods||[]);
  }
  function mealPlanHTML() {
    if (!ui.date) return '';
    const daily=currentPicks().filter(p=>p.date===ui.date), legacy=daily.filter(p=>!p.meal);
    const selectedCount=MEALS.filter(meal=>daily.some(p=>p.meal===meal)).length;
    const unknown=daily.filter(p=>!validAmount(p.price)).length, total=daily.reduce((sum,p)=>sum+(validAmount(p.price)?p.price:0),0)*people();
    return '<section class="fd-meal-plan" aria-label="'+esc(ui.date+' 아침 점심 저녁 식사 계획')+'"><div class="fd-meal-plan-head"><strong>'+esc(ui.date)+' 식사 계획</strong><span>'+selectedCount+'/3끼 지정 · '+people()+'명</span></div><div class="fd-meal-plan-grid">'+MEALS.map(meal=>{
      const p=daily.find(item=>item.meal===meal);
      return '<div class="fd-meal-cell'+(ui.meal===meal?' on':'')+'"><button type="button" class="fd-meal-choose" data-fd-meal="'+meal+'" aria-pressed="'+(ui.meal===meal)+'"><b>'+meal+'</b><span>'+esc(p?p.name:'식당을 지정해 주세요')+'</span><small>'+(p?(validAmount(p.price)?'1인 '+won(p.price)+' · 전체 '+won(p.price*people()):'금액 입력 필요'):'아래 목록에서 '+meal+' 식당 선택')+''+'</small></button>'+(p?'<button type="button" class="fd-meal-cancel" data-fd-cancel-meal="'+meal+'">'+meal+' 지정 취소</button>':'')+'</div>';
    }).join('')+'</div><p class="fd-small">오늘 선택 식비 '+won(total)+(unknown?' · 금액 미정 '+unknown+'건':'')+' · 식당을 지정·교체·취소하면 여행 전체 식비 합계가 오른쪽 예산에 반영돼요.</p>'+(legacy.length?'<p class="fd-small">식사가 지정되지 않은 기존 방문 계획 '+legacy.length+'건도 보존했어요. 같은 식당을 식사에 지정하면 해당 계획을 옮겨요.</p>':'')+'</section>';
  }
  function renderWhen() {
    const dates=tripDates(ctx()), box=$('#foodWhen');
    if (!box) return;
    if (!dates.length) { ui.date=''; box.innerHTML='<div class="fd-note">상단에서 날짜를 선택하면 날짜별 방문 희망 시간을 계획할 수 있어요. 예약 기능이 아닙니다.</div>'; return; }
    if (!dates.includes(ui.date)) ui.date=dates[0];
    box.innerHTML='<div class="fd-strip">'+dates.map(d=>{
      const dt=new Date(d+'T00:00:00');
      return '<button class="fd-day'+(d===ui.date?' on':'')+'" type="button" data-d="'+d+'" aria-pressed="'+(d===ui.date)+'"><small>'+['일','월','화','수','목','금','토'][dt.getDay()]+'</small><b>'+(dt.getMonth()+1)+'/'+dt.getDate()+'</b></button>';
    }).join('')+'</div><div class="fd-meal">'+MEALS.map(m=>'<button type="button" data-m="'+m+'" class="'+(ui.meal===m?'on':'')+'" aria-pressed="'+(ui.meal===m)+'">'+m+' 식당 선택</button>').join('')+'</div>'+mealPlanHTML()+'<p class="fd-small">선택한 식사에 식당 1곳을 지정해요. 시간은 방문 희망 일정이며 예약이 아닙니다. 최대 366일을 표시해요.</p>';
  }
  function filtered() {
    const kinds=sel('foodKind'), range=PRICE[sel('foodBudget')[0]], prefs=sel('foodPref'), query=ui.query.toLocaleLowerCase();
    const list=foods.filter(f=>{
      const price=estimate(f);
      return (!kinds.length||kinds.includes(f.kind)) && (!range||(validAmount(price)&&price>=range[0]&&price<=range[1])) &&
        (!prefs.includes('한국어 메뉴')||f.koMenu) && (!prefs.includes('채식 가능')||f.vegan) && (!prefs.includes('웨이팅 적은 곳')||f.waitLow===true) &&
        (!prefs.includes('예약 가능')||f.reservable) && (ui.area==='all'||f.area===ui.area) &&
        (!query||[f.name,f.area,f.kind,f.cuisine,f.description].join(' ').toLocaleLowerCase().includes(query));
    });
    return list.sort((a,b)=>Number(a.sample)-Number(b.sample)||(ui.sort==='price'?(estimate(a)??Infinity)-(estimate(b)??Infinity)||a.name.localeCompare(b.name,'ko'):
      ui.sort==='name'?a.name.localeCompare(b.name,'ko'):b.score-a.score));
  }
  function slotsHTML(f) {
    const list=ui.meal==='아침'?BREAKFAST:ui.meal==='점심'?LUNCH:DINNER, selected=pickedFor(f);
    return '<p class="fd-small">방문 희망 시간 · 예약 연동 없음</p><div class="fd-slots">'+list.map(t=>'<button type="button" class="fd-slot'+(selected?.slot===t?' on':'')+'" data-id="'+esc(f.id)+'" data-slot="'+t+'" aria-pressed="'+(selected?.slot===t)+'" '+(!ui.date?'disabled':'')+'>'+t+'</button>').join('')+'</div>';
  }
  function cardHTML(f) {
    const selected=pickedFor(f), links=maps(f);
    const tags=[f.kind,...dishesFor(f).map(name=>'메뉴: '+name),f.koMenu&&'한국어 메뉴 태그',f.vegan&&'채식 태그'].filter(Boolean);
    const badge=f.source==='official'?'<span class="fd-badge">공식 확인</span>':'';
    return '<article class="fd-card"><div class="fd-card-media">'+referencePhoto(f)+badge+
      '<button type="button" class="fd-heart'+(selected?' on':'')+'" data-id="'+esc(f.id)+'" aria-label="'+esc(f.name+(selected?' '+ui.meal+' 지정 취소':' '+ui.meal+' 식당 지정'))+'" aria-pressed="'+!!selected+'" '+(!ui.date?'disabled':'')+'>♥</button></div><div class="fd-info">'+
      '<div class="fd-name"><b>'+esc(f.name)+'</b><span class="fd-rate">평점 미제공</span></div><div class="fd-sub">'+esc(f.area)+' · '+esc(priceLabel(f))+'</div><div class="fd-sub">'+esc(f.description)+'</div>'+
      '<div class="fd-tags">'+tags.map(t=>'<span class="fd-tag">'+esc(t)+'</span>').join('')+'</div><div class="fd-card-actions">'+
      '<button type="button" class="fd-assign" data-fd-assign="'+esc(f.id)+'" '+(!ui.date?'disabled':'')+'>'+(selected?ui.meal+' 지정 취소':ui.meal+' 식당으로 지정')+'</button>'+
      '<button type="button" class="fd-detail-button" data-fd-detail="'+esc(f.id)+'">상세 보기 ↗</button><a href="'+esc(links.map)+'" target="_blank" rel="noopener noreferrer">'+(f.sample?'여행지 지도':'지도 보기')+' ↗</a>'+
      (f.sourceURL?'<a href="'+esc(f.sourceURL)+'" target="_blank" rel="noopener noreferrer">'+(f.source==='official'?'공식 출처':'OSM 출처')+' ↗</a>':'')+'</div></div></article>';
  }
  function renderResults() {
    ensureCity();
    renderGuide();
    const box=$('#foodResults'); if (!box) return;
    if (!city) { box.innerHTML='<div class="fd-empty">상단에서 여행지를 선택하면 맛집과 방문 계획을 살펴볼 수 있어요.</div>'; return; }
    const focused=document.activeElement===$('#fd-search'), cursor=focused?$('#fd-search').selectionStart:0;
    const list=filtered(), selected=currentPicks(), missing=selected.filter(p=>!validAmount(p.price)).length;
    const sum=selected.reduce((a,p)=>a+(validAmount(p.price)?p.price:0),0)*people();
    const areas=[...new Set(foods.map(f=>f.area))].sort((a,b)=>a.localeCompare(b,'ko'));
    const demoCount=foods.filter(f=>f.sample).length, actualCount=foods.length-demoCount, shownDemo=list.filter(f=>f.sample).length;
    box.innerHTML='<div class="fd-note">'+'한 끼 예상 가격을 참고해 식사를 계획하세요. 가격은 직접 수정할 수 있고 실제 메뉴·결제 금액과 다를 수 있어요.'+'</div>'+
      '<div class="fd-sourcebar"><button type="button" data-fd-load '+(ui.loading||!centerFor(city)?'disabled':'')+'>'+(ui.loading?'주변 매장 찾는 중…':attempted.has(city)?'다시 불러오기':foods.length?'주변 매장 더 불러오기':'실제 맛집 불러오기')+'</button>'+
      '</div>'+
      '<p class="fd-small">공식 확인 표시가 있는 매장은 출처를 확인할 수 있어요. 영업시간과 메뉴 가격은 방문 전 확인하세요.</p>'+
      (ui.message?'<p class="fd-note" role="status">'+esc(ui.message)+'</p>':'')+
      (legacySkipped?'<p class="fd-small">이전 형식의 방문 계획 일부는 복원하지 않았어요. 필요한 식당을 다시 지정해 주세요.</p>':'')+
      '<div class="fd-searchbar"><label>지역 선택<select id="fd-area" aria-label="맛집 지역 선택"><option value="all">전체 지역</option>'+areas.map(a=>'<option value="'+esc(a)+'" '+(a===ui.area?'selected':'')+'>'+esc(a)+' ('+foods.filter(f=>f.area===a).length+')</option>').join('')+'</select></label><label>식당·음식 검색<input type="search" id="fd-search" maxlength="100" placeholder="식당명, 음식 종류, 지역 검색" value="'+esc(ui.query)+'"></label></div>'+
      '<div class="fd-bar"><strong>'+esc(city)+' 맛집 후보 '+list.length+'곳</strong><div class="fd-sort">'+[['rec','등록 목록순'],['name','이름순'],['price','계획액 낮은순']].map(([key,label])=>'<button type="button" data-s="'+key+'" class="'+(ui.sort===key?'on':'')+'" aria-pressed="'+(ui.sort===key)+'">'+label+'</button>').join('')+'</div></div>'+
      (ui.loading&&!foods.length?'<div class="fd-empty" role="status">실제 매장 정보를 불러오고 있어요…</div>':list.length?'<div class="fd-list">'+list.map(cardHTML).join('')+'</div>':!cache.has(city)&&!foods.length?'<div class="fd-empty">'+(attempted.has(city)?'실제 매장 정보를 아직 불러오지 못했어요. 다시 불러오기를 눌러 주세요.':'맛집 탭을 열면 여행지의 실제 등록 매장을 찾아드려요.')+'</div>':'<div class="fd-empty">조건에 맞는 장소가 없어요.<br>가격·이용 조건이 미등록된 매장은 해당 필터에서 제외돼요. 지역·음식 종류·예산·식사 조건을 완화해 보세요.</div>')+
      ('<p class="fd-small">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap 기여자 · ODbL</a> · Overpass API. 공식 안내와 공개 지도 자료의 출처를 확인할 수 있어요. 공식 확인 매장을 먼저 표시하며 인기 순위가 아닙니다.</p>')+
      (selected.length?'<div class="fd-picks"><div><span>현재 여행지·여행 날짜에 담은 맛집 '+selected.length+'건 · 성인/어린이 '+people()+'명 기준</span><br><strong>'+(missing?'입력된 금액 합계 ':'식비 예상 ')+won(sum)+'</strong>'+(missing?'<br><span>금액 입력 필요 '+missing+'건 · 전체 식비 미확정</span>':'')+'</div><button type="button" data-clear>현재 여행 비우기</button></div><details class="fd-picked-details"><summary>담은 방문 계획 확인 · 선택 취소</summary>'+selected.map(p=>'<div class="fd-picked-row"><span>'+esc(p.date+' '+(p.meal||'기존 방문 계획')+' '+p.slot+' · '+p.name)+'<small>'+(validAmount(p.price)?'1인 '+won(p.price)+(p.priceSource==='estimate'?' · 추정':''):'계획액 미정')+(p.source==='official'?' · 공식 안내':p.source==='OSM'?' · OSM':'')+'</small></span><button type="button" data-fd-remove="'+esc(keyOf(p.city,p.date,p.id,p.meal||''))+'" aria-label="'+esc(p.name+' 방문 계획 선택 취소')+'">선택 취소</button></div>').join('')+'</details>':'')+
      (selected.length&&!missing&&(manualBudget||budgetMessage.includes('직접 수정'))?'<button type="button" class="fd-detail-button" data-fd-apply-budget>식사 선택 금액 '+won(sum)+' 예산에 적용</button>':'')+
      (budgetMessage?'<p class="fd-small" role="status">'+esc(budgetMessage)+'</p>':'');
    if (focused) { const input=$('#fd-search'); input?.focus(); try { input?.setSelectionRange(cursor,cursor); } catch (_) {} }
  }
  function tipsFor(f) {
    if (f.sample) return '방문 정보와 상세 이용 조건은 확인이 필요합니다.';
    return [f.koMenu?'한국어 메뉴 관련 태그 있음 · 현재 제공 여부 확인 필요':'한국어 메뉴 확인 필요',
      f.vegan?'채식 관련 태그 있음 · 비건 여부/알레르기는 매장 확인':'채식 메뉴 확인 필요',
      f.reservable?'예약 태그: '+f.reservation+' · 빈 시간은 매장 확인':'예약 방식 확인 필요',
      f.wheelchair?'휠체어 태그: '+f.wheelchair:'',f.takeaway?'포장 태그: '+f.takeaway:'','대기 시간은 제공하지 않아요.'].filter(Boolean).join(' · ');
  }
  function fillDetail() {
    const f=foods.find(item=>item.id===ui.detail); if (!f) { closeDetail(); return; }
    const selected=pickedFor(f), amount=estimate(f), links=maps(f), phone=phoneURL(f.phone), missing='정보 없음';
    const mapURL=embedURL(f), oldMap=dialog.querySelector('.fd-map-frame');
    const active=dialog.contains(document.activeElement)?document.activeElement:null, focusAttr=active?.matches('[data-fd-price]')?'[data-fd-price]':active?.matches('[data-fd-pick]')?'[data-fd-pick]':active?.matches('[data-slot]')?'[data-slot="'+active.dataset.slot+'"]':active?.matches('[data-fd-close]')?'[data-fd-close]':'';
    const row=(label,value)=>'<dt>'+label+'</dt><dd>'+value+'</dd>';
    dialog.innerHTML='<div class="fd-dialog-inner"><div class="fd-dialog-head"><div><span class="fd-tag">'+(f.source==='official'?'공식 확인':f.source==='OSM'?'OpenStreetMap 등록 정보':'식당 정보')+'</span><h3 id="fd-detail-title">'+esc(f.name)+'</h3><p class="fd-small">'+esc(f.city+' · '+f.area+' · '+f.kind)+'</p></div><button type="button" class="fd-close" data-fd-close aria-label="맛집 상세 닫기">×</button></div>'+referencePhoto(f,true)+'<p>'+esc(f.description)+'</p><h4>기본 정보</h4><dl class="fd-meta">'+
      row('평점·리뷰','미제공')+(f.checkedAt?row('자료 확인일',esc(f.checkedAt)):'')+row('주소',esc(f.address||missing))+
      row('전화',phone?'<a href="'+esc(phone)+'">'+esc(f.phone)+'</a>':esc(f.phone||missing))+
      row('홈페이지',f.website?'<a href="'+esc(f.website)+'" target="_blank" rel="noopener noreferrer">공식 안내·홈페이지 ↗</a>':esc(missing))+
      row('운영시간',esc(f.hours||missing))+row('휴무일',f.closed?esc(f.closed):f.sample?esc(missing):f.source!=='official'&&f.hours?'운영시간 원문의 off/closed 규칙 확인 · 임시 휴무는 매장 문의':'확인 필요')+
      row('메뉴·가격',f.sample?esc(dishesFor(f).join(', ')+' · 메뉴 구성 참고'):f.priceRaw?'등록 가격 원문: '+esc(f.priceRaw)+' · 통화·적용 메뉴 확인 필요':'미등록 · 매장 메뉴 확인 필요')+
      (validAmount(f.estimatedPriceKRW)?row('한 끼 예상액',won(f.estimatedPriceKRW)+' · 계획용 추정액')+row('추정 기준',esc(f.estimateNote)):'')+
      (f.menuURL?row('메뉴 링크','<a href="'+esc(f.menuURL)+'" target="_blank" rel="noopener noreferrer">등록된 메뉴 확인 ↗</a>'):'')+row('이용 팁',esc(tipsFor(f)))+'</dl>'+
      (mapURL?'<section class="fd-location" aria-label="'+esc(f.name+' 위치')+'"><h4>매장 위치</h4><div data-fd-map-mount></div><div class="fd-map-caption">'+esc(f.name)+' · '+esc(f.address||'주소 확인 필요')+'<br>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap 기여자 · ODbL</a> · 등록 좌표 기준이며 건물·관계의 중심점일 수 있어요. 지도가 안 보이면 아래 지도 링크를 이용하세요.</div></section>':'')+
      (f.hours?'<p class="fd-small">'+(f.source==='official'?'운영시간은 공식 안내 기재 내용이며 임시 변경은 매장에 확인하세요.':'운영시간은 OSM opening_hours 원문이며 현지 시간 기준입니다.')+' 선택 시각의 실제 영업 여부를 판정하지 않습니다.</p>':'')+
      '<h4>내 방문 계획</h4><p class="fd-small">'+(ui.date?esc(ui.date)+' · '+esc(ui.meal):'날짜를 먼저 선택해 주세요.')+' · 예약 기능이 아니에요.</p>'+
      '<label class="fd-plan-price">1인 한 끼 계획액 (원)<input type="number" data-fd-price min="0" max="10000000" step="100" inputmode="numeric" placeholder="예: 15000" value="'+(validAmount(amount)?amount:'')+'"></label><p class="fd-small">'+'예상 가격은 실제 결제 금액이 아닙니다. 메뉴 가격을 확인한 뒤 원화 계획액을 직접 수정하세요.'+'</p><p class="fd-small" data-fd-price-error role="status"></p>'+
      slotsHTML(f)+'<div class="fd-detail-actions"><button type="button" data-fd-pick="'+esc(f.id)+'" '+(!ui.date?'disabled':'')+'>'+(selected?ui.meal+' 지정 취소':ui.meal+' 식당으로 지정')+'</button><a href="'+esc(links.map)+'" target="_blank" rel="noopener noreferrer">'+(f.sample?'여행지 지도':'지도 보기')+' ↗</a>'+
      (links.route?'<a href="'+esc(links.route)+'" target="_blank" rel="noopener noreferrer">길찾기 ↗</a>':'')+'</div>'+
      (f.sourceURL?'<p class="fd-small">출처: <a href="'+esc(f.sourceURL)+'" target="_blank" rel="noopener noreferrer">' + (f.source==='official'?'공식 안내 원본':'OpenStreetMap 원본') + ' ↗</a> · 방문 전 최신 정보를 확인하세요.</p>':f.sample?'<p class="fd-small">상세 방문 정보는 확인이 필요해요. 표시 금액은 식사 계획을 위한 예상액입니다.</p>':'<p class="fd-small">출처를 확인하지 못했어요. 방문 전 매장 정보를 다시 확인해 주세요.</p>')+'</div>';
    if (mapURL) {
      const frame=oldMap?.getAttribute('src')===mapURL?oldMap:document.createElement('iframe');
      if (frame!==oldMap) {
        frame.className='fd-map-frame'; frame.width='600'; frame.height='240'; frame.loading='lazy';
        frame.referrerPolicy='no-referrer'; frame.title=f.name+' 위치 · OpenStreetMap';
        frame.setAttribute('allow',"geolocation 'none'"); frame.src=mapURL;
      }
      dialog.querySelector('[data-fd-map-mount]')?.appendChild(frame);
    }
    if (focusAttr) dialog.querySelector(focusAttr)?.focus({preventScroll:true});
  }
  function openDetail(id,trigger) {
    if (!foods.some(f=>f.id===id)) return;
    returnFocus=trigger; ui.detail=id; fillDetail();
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('[data-fd-close]')?.focus();
  }
  function syncBudget() {
    if (syncing) return;
    syncing=true;
    try {
      const B=window.TripBudget, c=ctx(), list=currentPicks();
      let current=null; try { current=B?.get?.().food||null; } catch (_) {}
      const matchesOwned=!!ownBudget && current?.cur===ownBudget.cur && current?.amount===ownBudget.amount;
      if (ownBudget && !matchesOwned) ownBudget=null;
      const allKnown=list.length>0 && list.every(p=>validAmount(p.price));
      const sum=Math.round(list.reduce((a,p)=>a+(validAmount(p.price)?p.price:0),0)*people());
      budgetMessage='';
      if (B && typeof B.set==='function') {
        if (allKnown && !manualBudget && (!current||matchesOwned)) {
          if (!current || current.amount!==sum || current.cur!=='KRW') {
            budgetBusy=true;
            try { if (B.set('food',sum,'KRW')!==false) ownBudget={city:c.dest,amount:sum,cur:'KRW'}; }
            finally { budgetBusy=false; }
          } else ownBudget={city:c.dest,amount:sum,cur:'KRW'};
          budgetMessage='현재 여행지의 담은 식비를 예산에 반영했어요.';
        } else if ((!list.length||!allKnown) && !manualBudget && matchesOwned && typeof B.clear==='function') {
          budgetBusy=true; try { B.clear('food'); ownBudget=null; } finally { budgetBusy=false; }
        } else if ((manualBudget||current&&!matchesOwned) && list.length) budgetMessage='직접 수정한 식비 예산을 유지했어요. 담은 목록의 예상액은 별도로 표시해요.';
      }
      if (list.some(p=>!validAmount(p.price))) budgetMessage+=(budgetMessage?' ':'')+'계획액이 없는 장소가 있어 전체 식비는 아직 확정하지 않았어요.';
      persist();
      document.dispatchEvent(new CustomEvent('tripfood:change',{detail:{city:c.dest,picks:list.map(p=>({...p}))}}));
    } finally { syncing=false; }
  }
  function toggle(id,slot) {
    const f=foods.find(item=>item.id===id); if (!f || !validDate(ui.date) || !MEALS.includes(ui.meal)) return;
    const key=keyOf(f.city,ui.date,id), previous=picks.get(key);
    if (previous && (!slot||previous.slot===slot)) picks.delete(key);
    else {
      if (dialog.open && dialog.querySelector('[data-fd-price][aria-invalid="true"]')) { dialog.querySelector('[data-fd-price]')?.focus(); return; }
      const amount=estimate(f), priceSource=priceSourceFor(f), legacy=referencePick(f);
      currentPicks().filter(p=>p.date===ui.date&&p.meal===ui.meal).forEach(p=>picks.delete(keyOf(p.city,p.date,p.id,p.meal)));
      if (legacy&&!legacy.meal) picks.delete(keyOf(legacy.city,legacy.date,legacy.id,''));
      picks.set(key,{city:f.city,id,date:ui.date,meal:ui.meal,name:f.name,price:amount,slot:slot||'',sample:f.source==='demo',source:f.source,sourceURL:f.sourceURL,place:storedPlace(f,f.city,f.id,f.name),priceSource});
    }
    syncBudget(); renderWhen(); renderResults(); if (dialog.open) fillDetail();
  }
  function render() {
    const previousDate=ui.date;
    ensureCity(); renderWhen();
    if (dialog.open && previousDate!==ui.date) fillDetail();
    syncBudget(); renderWhen(); renderResults(); maybeLoad();
  }
  function maybeLoad() {
    if (!pane.classList.contains('on') || !city || ui.loading || foods.length || attempted.has(city) || cache.has(city)) return;
    fetchOSM();
  }
  pane.addEventListener('click',event=>{
    const target=event.target; if (!(target instanceof Element)) return;
    const day=target.closest('.fd-day'), meal=target.closest('.fd-meal button'), sort=target.closest('.fd-sort button');
    const heart=target.closest('.fd-heart'), slot=target.closest('.fd-slot'), detail=target.closest('[data-fd-detail]');
    if (day) { ui.date=day.dataset.d; render(); return; }
    if (meal) { ui.meal=meal.dataset.m; render(); if (dialog.open) fillDetail(); return; }
    const mealChoice=target.closest('[data-fd-meal]'); if (mealChoice) { ui.meal=mealChoice.dataset.fdMeal; render(); return; }
    const mealCancel=target.closest('[data-fd-cancel-meal]');
    if (mealCancel) {
      const chosen=mealCancel.dataset.fdCancelMeal;
      currentPicks().filter(p=>p.date===ui.date&&p.meal===chosen).forEach(p=>picks.delete(keyOf(p.city,p.date,p.id,p.meal)));
      syncBudget(); renderWhen(); renderResults(); return;
    }
    const assign=target.closest('[data-fd-assign]'); if (assign) { if (!assign.disabled) toggle(assign.dataset.fdAssign); return; }
    if (sort) { ui.sort=sort.dataset.s; renderResults(); return; }
    if (detail) { openDetail(detail.dataset.fdDetail,detail); return; }
    if (target.closest('[data-fd-close]')) { closeDetail(); return; }
    const guidePlace=target.closest('[data-fd-guide-place]'); if (guidePlace) { openDetail(guidePlace.dataset.fdGuidePlace,guidePlace); return; }
    if (heart) { if (!heart.disabled) toggle(heart.dataset.id); return; }
    if (slot) { if (!slot.disabled) toggle(slot.dataset.id,slot.dataset.slot); return; }
    const pick=target.closest('[data-fd-pick]'); if (pick) { if (!pick.disabled) toggle(pick.dataset.fdPick); return; }
    if (target.closest('[data-clear]')) { currentPicks().forEach(p=>picks.delete(keyOf(p.city,p.date,p.id,p.meal||''))); syncBudget(); renderWhen(); renderResults(); return; }
    const remove=target.closest('[data-fd-remove]');
    if (remove) { const key=remove.dataset.fdRemove; if (currentPicks().some(p=>keyOf(p.city,p.date,p.id,p.meal||'')===key)) { picks.delete(key); syncBudget(); renderWhen(); renderResults(); } return; }
    if (target.closest('[data-fd-apply-budget]')) {
      const list=currentPicks(), B=window.TripBudget;
      if (!list.length||!list.every(p=>validAmount(p.price))||!B?.set) return;
      const amount=Math.round(list.reduce((sum,p)=>sum+p.price,0)*people());
      budgetBusy=true;
      try { if (B.set('food',amount,'KRW')!==false) { ownBudget={city,amount,cur:'KRW'}; manualBudget=false; } }
      finally { budgetBusy=false; }
      syncBudget(); renderWhen(); renderResults(); return;
    }
    if (target.closest('[data-fd-load]')) { fetchOSM(); return; }
    if (target.closest('.opts')) setTimeout(renderResults,0);
  });
  pane.addEventListener('input',event=>{
    const input=event.target; if (!(input instanceof HTMLInputElement)) return;
    if (input.id==='fd-search') { ui.query=input.value.slice(0,100); renderResults(); return; }
    if (!input.matches('[data-fd-price]')) return;
    const f=foods.find(item=>item.id===ui.detail); if (!f) return;
    const amount=input.value.trim()===''?null:Number(input.value), error=dialog.querySelector('[data-fd-price-error]');
    if (input.validity.badInput || (amount!==null && !validAmount(amount))) {
      input.setAttribute('aria-invalid','true'); if (error) error.textContent='0~10,000,000원 사이의 숫자를 입력해 주세요.'; return;
    }
    input.removeAttribute('aria-invalid'); if (error) error.textContent='';
    drafts.set(keyOf(f.city,ui.date,f.id),amount);
    const selected=pickedFor(f);
    if (selected) { selected.price=amount; selected.priceSource='manual'; syncBudget(); renderWhen(); renderResults(); }
  });
  pane.addEventListener('change',event=>{ if (event.target.id==='fd-area') { ui.area=event.target.value; renderResults(); } });
  pane.addEventListener('error',event=>{
    const image=event.target;
    if (!(image instanceof HTMLImageElement)||!image.classList.contains('fd-food-image')) return;
    failedPhotos.add(image.src);
    const frame=image.closest('.fd-reference-photo'); image.remove();
    const caption=frame?.querySelector('small'); if (caption) caption.textContent='사진 미표시 · 음식 종류 일러스트';
  },true);
  dialog.addEventListener('cancel',event=>{ event.preventDefault(); closeDetail(); });
  dialog.addEventListener('click',event=>{
    if (event.target!==dialog) return;
    const box=dialog.getBoundingClientRect();
    if (event.clientX<box.left || event.clientX>box.right || event.clientY<box.top || event.clientY>box.bottom) closeDetail();
  });
  document.addEventListener('tripcontext:change',render);
  document.addEventListener('tripbudget:change',()=>{
    if (budgetBusy || !ownBudget) return;
    let current; try { current=window.TripBudget?.get?.().food; } catch (_) { return; }
    if (current?.amount!==ownBudget.amount || current?.cur!==ownBudget.cur) {
      ownBudget=null; manualBudget=true; budgetMessage='직접 수정한 식비 예산을 유지해요.'; persist(); renderResults();
    }
  });
  // 예산 패널의 사용자가 직접 적용/삭제/절약을 고른 경우 같은 금액이어도 소유권을 넘긴다.
  document.addEventListener('click',event=>{
    const button=event.target instanceof Element?event.target.closest('#budget-root [data-k="food"][data-a]'):null;
    if (!button) return;
    if (button.dataset.a==='ok') {
      const input=document.querySelector('#budget-root [data-in="food"]');
      // budget.js는 적용 성공 시 편집 입력을 교체하고, 검증 실패 시 같은 입력을 유지한다.
      // 기존 검증 결과를 따른다. 같은 금액을 직접 확정한 경우에도 소유권을 넘긴다.
      queueMicrotask(()=>{
        if (!input || input.isConnected) return;
        manualBudget=true; ownBudget=null; budgetMessage='직접 수정한 식비 예산을 유지해요.'; persist(); renderResults();
      });
    } else if (['clear','saving'].includes(button.dataset.a)) { manualBudget=true; ownBudget=null; persist(); }
  },true);
  document.addEventListener('triptabs:change',()=>{ if (!pane.classList.contains('on')) closeDetail(); else render(); });
  const tab=document.querySelector('.tab[data-t="food"]');
  if (tab) tab.addEventListener('click',()=>setTimeout(render,0));
  window.TripFood=Object.freeze({
    get:()=>({city:ctx().dest,picks:currentPicks().map(p=>({...p}))}),
    summaryText:()=>{ const n=currentPicks().length; return n?' · 지정한 식사 '+n+'건':''; }
  });
  render();
})();

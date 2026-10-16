/* 독립된 관광 추천 모듈. 수동 선정 후보 + 조건별 정렬, Wikimedia 무료 사진.
 * 별점/리뷰/글로벌 저장 수는 생성하지 않는다. 담기는 이 브라우저의 내 일정에만 저장한다.
 */
(() => {
  const host=document.getElementById('travel-trends-root'); if(!host)return;
  const root=document.createElement('section'); root.id='tour-recommendations'; host.prepend(root);
  const catalog=window.GonsangTourCatalog || {}, extras=window.GonsangTourExtras || {}, giftCatalog=window.GonsangTourGifts || {}, all=[...Object.values(catalog).flat(),...Object.values(extras).flat(),...Object.values(giftCatalog).flat()];
  const known=new Set(all.map(p=>p.id)), STORE='gonsang-tour-picks-v1';
  let picked=[]; try { picked=JSON.parse(localStorage.getItem(STORE)||'[]'); } catch(_) {}
  const picks=new Set(Array.isArray(picked)?picked.filter(id=>known.has(id)):[]);
  let category='전체', onlyPicked=false, previousCity='', previousPreferences='', imageStatus='idle', busy=false, mode='young';
  try { mode=localStorage.getItem('gonsang-tour-mode-v1')==='old'?'old':'young'; } catch(_) {}
  const photos=new Map(), attempted=new Set();
  let courseData={};try{courseData=JSON.parse(document.getElementById('course-data')?.textContent||'{}');}catch(_){}
  const isPicked=p=>picks.has(p.id)||window.TripCourse?.contains?.(p.city,p.name)===true;
  const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const context=()=>window.TripContext?.() || {};
  const cityNow=()=>context().dest?.trim() || '';
  const ownPlaces=()=>Object.hasOwn(catalog,cityNow())?[...catalog[cityNow()],...(extras[cityNow()]||[])]:[];
  const ownGifts=()=>Object.hasOwn(giftCatalog,cityNow())?giftCatalog[cityNow()]:[];
  const ownCandidates=()=>[...ownPlaces(),...ownGifts()];
  const themeMap={'명소·랜드마크':['명소','전망','역사'],'자연·풍경':['자연','산책','전망'],'역사·문화':['역사','박물관'],'쇼핑':['쇼핑'],'테마파크':['테마파크','체험'],'박물관·미술관':['박물관'],'액티비티':['체험','테마파크']};
  const matching=p=>(context().tourThemes || []).some(t=>(themeMap[t] || []).includes(p.category));
  function metaFor(p){return courseData.cities?.[p.city]?.places.find(x=>x.id===p.id)||{};}
  function cityDistance(p){
    const c=courseData.cities?.[p.city],m=metaFor(p);if(![c?.lat,c?.lng,m.lat,m.lng].every(Number.isFinite))return null;
    const rad=n=>n*Math.PI/180,dlat=rad(m.lat-c.lat),dlng=rad(m.lng-c.lng);
    return 6371*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(dlat/2)**2+Math.cos(rad(c.lat))*Math.cos(rad(m.lat))*Math.sin(dlng/2)**2)));
  }
  function preferenceScore(p){
    const ctx=context(),m=metaFor(p),km=cityDistance(p),walk=Number.isFinite(m.walk)?m.walk:2,stay=Number.isFinite(m.stay)?m.stay:60;
    let score=matching(p)?100:0;
    if(ctx.pace==='여유롭게')score+=(4-walk)*7+Math.max(0,120-stay)/20-(m.outside?10:0);
    if(ctx.pace==='빡빡하게')score+=Math.max(0,150-stay)/8-(m.outside?4:0);
    const moves=ctx.tourMove||[],weights=moves.map(move=>{
      if(move==='도보 위주')return (km===null?0:km<=3?20:km<=8?6:-12)+(p.category==='산책'?4:0);
      if(move==='대중교통')return (km===null?0:Math.max(-10,12-km*.8))-(m.outside?6:0);
      if(move==='렌터카')return m.outside?18:km===null?0:Math.min(km,12)/2;
      if(move==='택시')return (km===null?0:km<=15?10:km<=30?3:-5)+(3-walk)*2;
      return 0;
    });
    return score+(weights.length?weights.reduce((a,b)=>a+b,0)/weights.length:0);
  }
  function recommendationReason(p){
    const ctx=context(),m=metaFor(p),km=cityDistance(p),reasons=[];
    if(matching(p))reasons.push('✓ 관심 테마와 어울려요');
    if(ctx.pace==='여유롭게'&&m.walk===1)reasons.push('가벼운 걷기 후보');
    if(ctx.pace==='빡빡하게'&&m.stay<=60)reasons.push('짧게 둘러볼 후보');
    if(ctx.tourMove?.includes('렌터카')&&m.outside)reasons.push('외곽 드라이브 후보');
    if(ctx.tourMove?.some(v=>v==='도보 위주'||v==='대중교통')&&km!==null&&km<=3)reasons.push('도심 주변 후보');
    return reasons.join(' · ')||'도시 대표 여행 후보';
  }
  function setMode(value){if(!['young','old'].includes(value))return;mode=value;try{localStorage.setItem('gonsang-tour-mode-v1',mode);}catch(_){}document.dispatchEvent(new CustomEvent('triptrend:change'));}
  const wikiURL=p=>'https://en.wikipedia.org/wiki/'+encodeURIComponent(p.wiki.replaceAll(' ','_'));
  const mapURL=p=>'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(p.city+' '+p.name+' '+p.wiki);
  const notify=()=>document.dispatchEvent(new CustomEvent('triptour:change'));
  const store=()=>{try{localStorage.setItem(STORE,JSON.stringify([...picks]));}catch(_){}notify();};
  const css=document.createElement('style');
  css.textContent=`
    #tour-recommendations{container-type:inline-size;padding-top:22px;border-top:1px solid #e1e8e3;color:#233b31}
    #tour-recommendations *{box-sizing:border-box}
    #tour-recommendations h3{margin:8px 0;font-size:25px;letter-spacing:-.6px}
    #tour-recommendations .tour-kicker{color:#1d735a;font-size:11px;font-weight:800;letter-spacing:1px}
    #tour-recommendations .tour-sub{font-size:13px;color:#707b74;line-height:1.7;margin:0 0 16px}
    #tour-recommendations .tour-applied{padding:10px 12px;background:#f2f7f3;border-radius:10px;font-size:12px;color:#476653;line-height:1.7;margin:12px 0}
    #tour-recommendations .tour-tools{display:flex;gap:7px;flex-wrap:wrap;margin:16px 0}
    #tour-recommendations button{font:inherit;cursor:pointer}
    #tour-recommendations .tour-filter{padding:7px 12px;border:1px solid #d9e3dc;border-radius:999px;background:#fff;color:#52665a;font-size:12px;font-weight:700}
    #tour-recommendations .tour-filter[aria-pressed="true"]{background:#1d735a;color:#fff;border-color:#1d735a}
    #tour-recommendations .tour-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:28px}
    #tour-recommendations .tour-card{display:grid;grid-template-columns:24px minmax(0,1fr) 112px;gap:10px;padding:22px 0;border-bottom:1px solid #e5eae6;min-width:0}
    #tour-recommendations .tour-rank{color:#3082de;font-size:19px;font-weight:800}
    #tour-recommendations .tour-name{display:block;color:#24382d;font-size:17px;line-height:1.4;text-decoration:none;font-weight:800;word-break:keep-all}
    #tour-recommendations .tour-desc{margin:7px 0;color:#6a746e;font-size:12px;line-height:1.65}
    #tour-recommendations .tour-meta{color:#879087;font-size:11px;line-height:1.7}
    #tour-recommendations .tour-reason{display:block;color:#27735a;font-size:11px;margin-top:4px}
    #tour-recommendations .tour-fee{padding:7px 9px;margin-top:8px;background:#f3f7ee;border-radius:8px;font-size:11px;color:#4b684d;line-height:1.7}
    #tour-recommendations .tour-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;align-items:center}
    #tour-recommendations .tour-pick{border:1px solid #d7e3dc;color:#1d735a;background:#fff;border-radius:8px;padding:7px 9px;font-size:11px;font-weight:800}
    #tour-recommendations .tour-pick[aria-pressed="true"]{background:#e7f3ed;border-color:#86b29c}
    #tour-recommendations .tour-map{font-size:11px;color:#577362;text-underline-offset:3px}
    #tour-recommendations .tour-photo{margin:0;min-width:0}
    #tour-recommendations .tour-photo img{width:112px;height:112px;border-radius:12px;object-fit:cover;display:block}
    #tour-recommendations .tour-placeholder{height:112px;border-radius:12px;background:linear-gradient(135deg,#edf2eb,#dee9e3);display:grid;place-items:center;color:#7b8b7e;font-size:11px;text-align:center;padding:10px;line-height:1.6}
    #tour-recommendations .tour-credit{font-size:9px;line-height:1.5;margin-top:5px;overflow-wrap:anywhere;color:#7a857d}
    #tour-recommendations .tour-credit a{color:inherit}
    #tour-recommendations .tour-tray{padding:13px;background:#f0f6f2;border-radius:12px;font-size:12px;line-height:1.8;margin:14px 0}
    #tour-recommendations .tour-empty{padding:28px 16px;border:1px dashed #cad9cf;border-radius:14px;font-size:13px;line-height:1.8;color:#65776b}
    #tour-recommendations .tour-photo-note{font-size:11px;color:#7c877f;line-height:1.6;margin:14px 0}
    #tour-recommendations .tour-gifts{padding:16px;background:#f7f4eb;border-radius:14px;margin-top:20px;font-size:13px;line-height:1.8}
    #tour-recommendations .tour-gifts p{font-size:11px;color:#7a796f}
    #tour-recommendations .tour-gifts button{margin:4px 8px 4px 0}
    #tour-recommendations button:focus-visible,#tour-recommendations a:focus-visible{outline:3px solid #86b29c;outline-offset:3px}
    @container(max-width:700px){#tour-recommendations .tour-list{grid-template-columns:1fr}}
    @container(max-width:350px){#tour-recommendations .tour-card{grid-template-columns:20px minmax(0,1fr) 82px;gap:8px}#tour-recommendations .tour-photo img{width:82px;height:94px}#tour-recommendations .tour-placeholder{height:94px}#tour-recommendations h3{font-size:21px}}
  `; document.head.appendChild(css);
  function photoHTML(p){
    const photo=photos.get(p.wiki);
    if(!photo)return `<div class="tour-placeholder" aria-label="${e(p.name)} 사진 미표시">${attempted.has(p.wiki)?'사진 준비 중':'사진 불러오는 중'}</div>`;
    return `<img src="${e(photo.url)}" alt="${e(p.name)} 관련 사진 · ${e(photo.article)}" loading="lazy" referrerpolicy="no-referrer"><figcaption class="tour-credit">${e(photo.author)} · <a href="${e(photo.licenseURL)}" target="_blank" rel="noopener noreferrer">${e(photo.license)}</a><br><a href="${e(photo.source)}" target="_blank" rel="noopener noreferrer">Wikimedia Commons 원본</a></figcaption>`;
  }
  function render(){
    const city=cityNow(); if(city!==previousCity){category='전체';onlyPicked=false;previousCity=city;imageStatus='idle';}
    const preferences=JSON.stringify([context().tourThemes||[],context().pace||'보통',context().tourMove||[]]);
    if(preferences!==previousPreferences){category='전체';onlyPicked=false;previousPreferences=preferences;}
    const places=ownPlaces(), selected=ownCandidates().filter(isPicked);
    const gifts=ownGifts().filter(p=>!onlyPicked||isPicked(p));
    const ranked=places.filter(p=>(category==='전체'||p.category===category)&&(!onlyPicked||isPicked(p))).sort((a,b)=>preferenceScore(b)-preferenceScore(a)||a.order-b.order);
    const filtered=onlyPicked?ranked:ranked.slice(0,10),ctx=context();
    const categories=['전체',...new Set(places.map(p=>p.category))];
    root.innerHTML=`<span class="tour-kicker">GONSANG PICKS · 도시별 대표 장소</span><h3>${city?e(city)+' 추천 관광지':'어디로 떠나볼까요?'}${places.length?' TOP 10':''}</h3>
      <p class="tour-sub">${places.length?'위 관광 조건의 관심 테마·여행 속도·이동 수단에 맞춰 추천 장소와 순서를 바꿔요. 실제 인기 순위나 평점이 아닙니다.':'상단에서 여행지를 선택하면 사진과 함께 추천 장소를 살펴볼 수 있어요.'}</p>
      ${places.length?`<div class="tour-applied" aria-live="polite">적용 조건: ${e((ctx.tourThemes||[]).join(', ')||'모든 테마')} · ${e(ctx.pace||'보통')} · ${e((ctx.tourMove||[]).join(', ')||'이동 수단 무관')}<br>대표 후보 ${places.length}곳 중 최대 10곳 추천 · 현재 ${filtered.length}곳 표시</div><div class="tour-tools" role="group" aria-label="관광지 분류">${categories.map(c=>`<button class="tour-filter" type="button" data-category="${e(c)}" aria-pressed="${c===category}">${e(c)}</button>`).join('')}<button class="tour-filter" type="button" data-picked-only aria-pressed="${onlyPicked}">♥ 담은 곳 ${selected.length}</button></div>`:''}
      ${selected.length?`<div class="tour-tray"><b>내 일정에 담은 곳 ${selected.length}개</b><br>${selected.map(p=>e(p.name)).join(' · ')}<br>하단 ‘저장하고 최종 일정 보기’에서 함께 확인하세요.</div>`:''}
      <div class="tour-list">${filtered.map((p,i)=>`<article class="tour-card"><span class="tour-rank">${i+1}</span><div><a class="tour-name" href="${wikiURL(p)}" target="_blank" rel="noopener noreferrer">${e(p.name)}</a><p class="tour-desc">${e(p.description)}</p><span class="tour-meta">${e(p.category)} · ${e(city)} 및 인근</span><span class="tour-reason">${e(recommendationReason(p))}</span>${feeHTML(p)}<div class="tour-actions"><button class="tour-pick" type="button" data-pick="${e(p.id)}" aria-pressed="${isPicked(p)}">${isPicked(p)?'♥ 담음 · 취소':'♡ 내 일정에 담기'}</button><a class="tour-map" href="${mapURL(p)}" target="_blank" rel="noopener noreferrer">지도 보기 ↗</a></div></div><figure class="tour-photo" data-photo="${e(p.wiki)}">${photoHTML(p)}</figure></article>`).join('')}</div>
      ${!filtered.length&&!gifts.length?`<div class="tour-empty">${!city?'여행지를 먼저 선택해 주세요.':!places.length?'이 도시의 추천 장소를 준비 중이에요. 직접 검색한 여행지일 수 있어요.':'선택한 분류에 해당하거나 일정에 담은 장소가 없어요.'}</div>`:''}
      ${gifts.length?`<section class="tour-gifts"><b>🛍 함께 살펴볼 기념품 후보</b><p>담지 않은 기념품은 코스의 쇼핑 구역에 메모로 붙이고, 직접 담으면 별도 쇼핑 슬롯으로 계획해요. 실제 구매 매장은 직접 정해야 합니다.</p>${gifts.map(p=>`<button type="button" class="tour-pick" data-pick="${e(p.id)}" aria-pressed="${isPicked(p)}">${isPicked(p)?'♥':'♡'} ${e(p.name)}</button>`).join('')}</section>`:''}
      ${places.length?'<p class="tour-photo-note">추천에는 걷기·관람 시간의 편집 참고값과 도심에서의 직선거리를 사용해요. 실제 대중교통 접근성이나 경로를 조회한 결과는 아닙니다.</p><p class="tour-photo-note" role="status" data-photo-status>사진은 무료 Wikimedia 자료에서 출처·라이선스를 확인해 불러옵니다. 이미지가 없거나 연결되지 않으면 자리 표시가 나옵니다. 장소별 방문 가능 여부·운영시간·입장료는 공식 사이트에서 확인하세요.</p><button class="tour-filter" type="button" data-photo-retry>사진 다시 불러오기</button>':''}`;
    hydratePhotos();
  }
  function feeHTML(p){
    const f=window.TripCourse?.feeFor?.(p.city,p.name);if(!f)return '';
    const price=f.amt===null?'금액 확인 필요':f.amt===0?'무료로 기재된 장소':`${f.amt.toLocaleString('ko-KR')} ${f.cur} · 약 ${Math.round(f.krw).toLocaleString('ko-KR')}원`;
    return `<div class="tour-fee">🎟 1인 입장료 참고 · ${e(price)}${f.edited?' · 직접 수정':''}${f.note?'<br>'+e(f.note):''}<br>첨부 자료 기준 · 최신 요금은 공식 사이트에서 확인</div>`;
  }
  const plain=html=>{const textarea=document.createElement('textarea');textarea.innerHTML=String(html||'').replace(/<[^>]*>/g,'');return textarea.value;};
  async function getJSON(endpoint,params){
    const url=new URL(endpoint);url.search=new URLSearchParams({action:'query',format:'json',formatversion:'2',origin:'*',...params});
    const res=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)});
    if(!res.ok)throw Error('photo unavailable');return res.json();
  }
  async function hydratePhotos(){
    if(busy || !document.getElementById('pane-tour')?.classList.contains('on'))return;
    const city=cityNow(), todo=ownPlaces().filter(p=>!attempted.has(p.wiki)); if(!todo.length)return;
    busy=true;todo.forEach(p=>attempted.add(p.wiki));
    try{
      const data=await getJSON('https://en.wikipedia.org/w/api.php',{prop:'pageimages',titles:[...new Set(todo.map(p=>p.wiki))].join('|'),redirects:'1',piprop:'name',pilicense:'free'});
      const redirects=new Map([...(data.query?.normalized||[]),...(data.query?.redirects||[])].map(r=>[r.from,r.to]));
      const resolve=title=>{for(let i=0;i<5&&redirects.has(title);i++)title=redirects.get(title);return title;};
      const pages=data.query?.pages||[],fileByName=new Map(todo.map(p=>[p.name,pages.find(page=>page.title===resolve(p.wiki))?.pageimage]));
      // 대표 이미지가 없는 문서는 같은 장소의 Wikidata P18을 살펴본 뒤 Commons의 이용 조건을 확인한다.
      const missing=todo.filter(p=>!fileByName.get(p.name));
      if(missing.length){
        let course={};try{course=JSON.parse(document.getElementById('course-data')?.textContent||'{}');}catch(_){}
        const qids=missing.map(p=>({p,q:(course.cities?.[city]?.places||[]).find(x=>x.name===p.name)?.source?.match(/\/(Q\d+)$/)?.[1]})).filter(x=>x.q);
        if(qids.length)try{
          const url=new URL('https://www.wikidata.org/w/api.php');url.search=new URLSearchParams({action:'wbgetentities',format:'json',origin:'*',ids:[...new Set(qids.map(x=>x.q))].join('|'),props:'claims'});
          const res=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)});
          if(res.ok){const entities=(await res.json()).entities||{};for(const {p,q} of qids){const claim=(entities[q]?.claims?.P18||[]).find(c=>c.rank!=='deprecated'&&typeof c.mainsnak?.datavalue?.value==='string');if(claim)fileByName.set(p.name,claim.mainsnak.datavalue.value);}}
        }catch(_){/* 이미 확인한 Wikipedia 사진은 계속 표시한다. */}
      }
      const files=[...new Set([...fileByName.values()].filter(Boolean))];
      if(files.length){
        const info=await getJSON('https://commons.wikimedia.org/w/api.php',{prop:'imageinfo',titles:files.map(f=>'File:'+f).join('|'),iiprop:'url|extmetadata',iiurlwidth:'320'});
        for(const p of todo){
          const page=pages.find(page=>page.title===resolve(p.wiki)), file=fileByName.get(p.name);
          if(!file)continue;
          const media=info.query?.pages?.find(page=>page.title.replaceAll('_',' ')==='File:'+file.replaceAll('_',' '))?.imageinfo?.[0], meta=media?.extmetadata;
          const license=plain(meta?.LicenseShortName?.value), author=plain(meta?.Attribution?.value || meta?.Artist?.value);
          const url=media?.thumburl, licenseURL=meta?.LicenseUrl?.value;
          if(!url || !author || !/^(?:CC BY(?:-SA)?(?: [\d.]+)?|CC0(?: [\d.]+)?|Public domain)$/i.test(license))continue;
          const imageURL=new URL(url), rightsURL=new URL(licenseURL || (license==='Public domain'?'https://creativecommons.org/publicdomain/mark/1.0/':license.startsWith('CC0')?'https://creativecommons.org/publicdomain/zero/1.0/':''));
          if(imageURL.protocol!=='https:'||!['upload.wikimedia.org','thumb.wikimedia.org'].includes(imageURL.hostname)||rightsURL.protocol!=='https:'||!['creativecommons.org','www.gnu.org','commons.wikimedia.org'].includes(rightsURL.hostname))continue;
          photos.set(p.wiki,{url:imageURL.href,license,licenseURL:rightsURL.href,author,article:page?.title||p.wiki,source:'https://commons.wikimedia.org/wiki/'+encodeURIComponent('File:'+file)});
        }
      }
      imageStatus='done';
    }catch(_){imageStatus='unavailable';}
    finally{
      busy=false;
      if(city===cityNow()){
        root.querySelectorAll('[data-photo]').forEach(slot=>{const p=ownPlaces().find(p=>p.wiki===slot.dataset.photo);if(p)slot.innerHTML=photoHTML(p);});
        if(imageStatus==='unavailable'){const note=root.querySelector('[data-photo-status]');if(note)note.textContent='사진 제공처에 연결하지 못했어요. 장소 정보·지도·일정 담기는 계속 사용할 수 있어요.';}
      }else hydratePhotos();
      document.dispatchEvent(new CustomEvent('triptourphotos:change'));
    }
  }
  root.addEventListener('click',ev=>{
    const b=ev.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-category')){category=b.dataset.category;render();}
    else if(b.hasAttribute('data-picked-only')){onlyPicked=!onlyPicked;render();}
    else if(b.dataset.pick && known.has(b.dataset.pick)){const id=b.dataset.pick,p=all.find(p=>p.id===id);if(isPicked(p)){picks.delete(id);window.TripCourse?.remove?.(p.name);}else picks.add(id);store();render();}
    else if(b.hasAttribute('data-photo-retry') && !busy){ownPlaces().forEach(p=>{attempted.delete(p.wiki);photos.delete(p.wiki);});render();}
  });
  root.addEventListener('error',ev=>{
    const img=ev.target;if(img.tagName!=='IMG'||img.dataset.failed)return;
    img.dataset.failed='true';img.hidden=true;img.parentElement.insertAdjacentHTML('afterbegin','<div class="tour-placeholder">사진 준비 중</div>');
  },true);
  window.TripTour=Object.freeze({
    get:()=>ownCandidates().filter(isPicked).map(p=>({id:p.id,name:p.name,city:p.city,category:p.category,mapURL:mapURL(p),sourceURL:wikiURL(p)})),
    setPicked(city,name,selected){const p=all.find(p=>p.city===city&&p.name===name);if(!p)return;selected?picks.add(p.id):picks.delete(p.id);store();render();},
    clear(city){all.filter(p=>p.city===city).forEach(p=>picks.delete(p.id));store();render();},
    summaryText:()=>{const count=ownCandidates().filter(isPicked).length;return count?` · 담은 후보 ${count}개`:'';}
  });
  window.TripTourPhotos=Object.freeze({get:(city,name)=>{const p=all.find(p=>p.city===city&&p.name===name),photo=p&&photos.get(p.wiki);return photo?{...photo}:null;}});
  // 인계서의 기존 연동 인터페이스와 호환. 추천 모듈의 실제 담기 상태만 읽는다.
  window.TripTrend=Object.freeze({get:()=>({mode,picks:all.filter(p=>picks.has(p.id)).map(p=>p.city+'|'+p.name)}),setMode});
  document.addEventListener('triptour:change',()=>document.dispatchEvent(new CustomEvent('triptrend:change')));
  document.addEventListener('tripcontext:change',render);
  document.addEventListener('tripcourse:change',render);
  document.addEventListener('triptabs:change',hydratePhotos);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});else render();
})();

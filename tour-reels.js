/* 장소 사진과 기존 관광 후보로 만드는 숏폼 탐색 제안.
 * 영상·재생 시간·조회수를 생성하지 않으며, 외부 API를 호출하지 않는다.
 * 실제 영상은 사용자가 YouTube 검색 링크를 열어 찾아본다.
 * 담기는 TripTour.setPicked만 사용하여 기존 일정·예산 저장 흐름을 따른다.
 */
(() => {
  'use strict';
  const root = document.getElementById('tour-reels-root');
  if (!root) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const THEMES = [
    {id:'night', label:'야경·사진', icon:'✦', title:'빛을 따라, 사진 한 장', desc:'전망과 도시 풍경을 담을 장소를 살펴봐요.', query:'야경 사진'},
    {id:'local', label:'로컬 먹거리', icon:'♨', title:'골목에서 만나는 현지의 맛', desc:'시장·상점가와 주변 동네를 영상으로 탐색해요.', query:'시장 로컬 음식'},
    {id:'walk', label:'산책·힐링', icon:'❋', title:'천천히 걸으며 쉬어가는 하루', desc:'공원과 산책길, 여유로운 풍경을 찾아봐요.', query:'산책 힐링'}
  ];
  let courseData = {cities:{}};
  try { courseData = JSON.parse(document.getElementById('course-data')?.textContent || '{}'); } catch (_) {}
  let city = '', filter = 'all', openTheme = '', selected = new Set(), status = '', adding = false, queued = false;

  const contextCity = () => {
    try { return String(window.TripContext?.().dest || '').trim(); } catch (_) { return ''; }
  };
  function poolFor(destination) {
    const catalog = window.GonsangTourCatalog || {}, extras = window.GonsangTourExtras || {};
    if (!Object.hasOwn(catalog, destination)) return [];
    const coursePlaces = courseData.cities?.[destination]?.places;
    if (!Array.isArray(coursePlaces)) return [];
    const eligible = new Set(coursePlaces.filter(p => p && typeof p.name === 'string' && Number.isFinite(p.lat) && Number.isFinite(p.lng)).map(p => p.name));
    const seen = new Set();
    return [...(catalog[destination] || []), ...(extras[destination] || [])].filter(p => {
      if (!p || p.city !== destination || typeof p.name !== 'string' || !eligible.has(p.name) || seen.has(p.name)) return false;
      seen.add(p.name); return true;
    });
  }
  function isPicked(place) {
    try {
      return window.TripCourse?.contains?.(place.city, place.name) === true ||
        (window.TripTour?.get?.() || []).some(p => p.city === place.city && p.name === place.name);
    } catch (_) { return false; }
  }
  function themeScore(place, theme) {
    const category = place.category || '', name = place.name;
    if (theme === 'night') return (category === '전망' ? 9 : category === '명소' ? 5 : category === '산책' ? 3 : 1) + (/타워|스카이|브리지|워터|마리나|하버|피크|베이/.test(name) ? 3 : 0);
    if (theme === 'local') return (category === '쇼핑' ? 8 : category === '산책' ? 4 : category === '명소' ? 2 : 0) + (/시장|마켓|골목|거리|차이나타운|리틀 인디아|바자르|워터프런트|커낼시티|라르코마르|코번트 가든|시먼딩|기온|나카스|도톤보리|신세카이|쓰키지/.test(name) ? 5 : 0);
    return category === '산책' ? 9 : category === '자연' ? 8 : category === '역사' ? 4 : category === '명소' ? 3 : 1;
  }
  const placesFor = theme => poolFor(city).sort((a,b) => themeScore(b,theme.id) - themeScore(a,theme.id) || (Number(a.order) || 0) - (Number(b.order) || 0)).slice(0,3);
  function safeURL(value, hosts) {
    try {
      const url = new URL(String(value || ''));
      return url.protocol === 'https:' && hosts.includes(url.hostname) ? url.href : '';
    } catch (_) { return ''; }
  }
  function photoFor(place) {
    if (!place) return null;
    let photo;
    try { photo = window.TripTourPhotos?.get?.(place.city, place.name); } catch (_) {}
    if (!photo || !photo.author || !photo.license) return null;
    const url = safeURL(photo.url, ['upload.wikimedia.org','thumb.wikimedia.org']);
    const source = safeURL(photo.source, ['commons.wikimedia.org']);
    const licenseURL = safeURL(photo.licenseURL, ['creativecommons.org','www.gnu.org','commons.wikimedia.org']);
    return url && source && licenseURL ? {...photo,url,source,licenseURL} : null;
  }
  function searchURL(theme) {
    const url = new URL('https://www.youtube.com/results');
    url.searchParams.set('search_query', `${city} ${theme.query} YouTube Shorts`);
    return url.href;
  }
  function credit(photo, theme) {
    return photo ? `<p class="tr-credit">사진: ${esc(photo.author)} · <a href="${esc(photo.licenseURL)}" data-tr-focus="license-${theme.id}" target="_blank" rel="noopener noreferrer">${esc(photo.license)}</a> · <a href="${esc(photo.source)}" data-tr-focus="source-${theme.id}" target="_blank" rel="noopener noreferrer">원본</a></p>` : '<p class="tr-credit">장소 사진이 없으면 테마 일러스트로 표시해요.</p>';
  }
  function card(theme) {
    const places = placesFor(theme), photo = places.map(photoFor).find(Boolean), expanded = openTheme === theme.id;
    return `<article class="tr-card tr-${theme.id}"><div class="tr-poster"><div class="tr-art" aria-hidden="true"><span>${theme.icon}</span><i></i><b></b></div>${photo ? `<img class="tr-image" src="${esc(photo.url)}" alt="${esc(photo.article || places[0]?.name || city)} 관련 장소 사진" loading="lazy" referrerpolicy="no-referrer">` : ''}<div class="tr-shade"></div><span class="tr-badge">장소 기반 추천</span><div class="tr-copy"><span class="tr-theme">${esc(theme.label)}</span><h4>${esc(city)}<br>${esc(theme.title)}</h4><p>${esc(theme.desc)}</p><span class="tr-place-count">추천 후보 ${places.length}곳</span><button type="button" class="tr-open" data-tr-open="${theme.id}" data-tr-focus="open-${theme.id}" aria-expanded="${expanded}" aria-controls="tr-place-panel">${expanded ? '추천 장소 닫기 ↑' : '추천 장소 보기 ↗'}</button></div></div>${credit(photo, theme)}<a class="tr-youtube" data-tr-focus="youtube-${theme.id}" href="${esc(searchURL(theme))}" target="_blank" rel="noopener noreferrer" aria-label="${esc(city+' '+theme.label+' YouTube Shorts 검색 · 새 창')}">YouTube에서 영상 찾아보기 ↗</a></article>`;
  }
  function detail(theme) {
    const places = placesFor(theme), selectable = places.filter(p => !isPicked(p));
    const chosen = selectable.filter(p => selected.has(p.name)).length;
    return `<section id="tr-place-panel" class="tr-detail" aria-label="${esc(city+' '+theme.label+' 추천 장소 선택')}"><div class="tr-detail-head"><div><span class="tr-detail-kicker">${esc(city)} · ${esc(theme.label)}</span><h4>영상 탐색과 함께 살펴볼 장소</h4></div><button type="button" class="tr-close" data-tr-close data-tr-focus="close" aria-label="추천 장소 상세 닫기">✕</button></div><p>이 목록은 기존 관광 후보를 테마별로 묶은 제안이며, 특정 영상에 등장하는 장소를 확인한 목록은 아니에요.${theme.id === 'local' ? ' 실제 식당·메뉴 정보 대신 시장·상점가 등 주변 관광지를 출발점으로 제안해요.' : ''}</p><fieldset><legend>일정에 추가할 장소 선택 · 최대 3곳</legend>${places.map((p,i) => {
      const picked = isPicked(p);
      return `<label class="tr-place${picked?' tr-picked':''}"><input type="checkbox" data-tr-place="${esc(p.name)}" data-tr-focus="place-${theme.id}-${i}" ${picked || selected.has(p.name) ? 'checked' : ''} ${picked ? 'disabled' : ''}><span><b>${esc(p.name)}</b><small>${esc(p.category || '관광')} · ${picked ? '이미 내 일정에 담음' : '기존 관광 후보'}</small></span>${picked ? '<em>담음 ✓</em>' : ''}</label>`;
    }).join('')}</fieldset><div class="tr-detail-actions"><button type="button" class="tr-add" data-tr-add data-tr-focus="add" ${!chosen || adding || !window.TripTour?.setPicked ? 'disabled' : ''}>${chosen ? '선택 장소 '+chosen+'곳 내 일정에 담기' : selectable.length ? '장소를 선택해 주세요' : '모두 내 일정에 담았어요 ✓'}</button><button type="button" class="tr-scroll" data-tr-scroll data-tr-focus="scroll">아래 추천 일정 보기 ↓</button></div><p class="tr-footnote">이미 담은 장소는 중복 추가하지 않아요. 담은 장소의 삭제와 날짜 조정은 아래 ‘내 일정’에서 해주세요.</p></section>`;
  }
  function render() {
    const focusKey = root.contains(document.activeElement) ? document.activeElement.dataset?.trFocus : '';
    const listScroll = root.querySelector('.tr-list')?.scrollLeft || 0;
    const nextCity = contextCity();
    if (nextCity !== city) { city = nextCity; filter = 'all'; openTheme = ''; selected.clear(); status = ''; }
    const pool = poolFor(city), visible = THEMES.filter(theme => filter === 'all' || filter === theme.id);
    root.innerHTML = `<div class="tr-heading"><div><span class="tr-kicker">TRAVEL IN SHORTS</span><h3>${city ? esc(city)+' 여행, 짧은 영상으로 미리 보기' : '여행지를 고르고, 영상으로 미리 보기'}</h3></div><span class="tr-kind-label">장소 기반 추천</span></div><p class="tr-intro">카드 이미지는 장소 사진이며 실제 영상은 YouTube에서 찾아볼 수 있어요.</p>${pool.length ? `<div class="tr-filters" role="group" aria-label="여행 영상 탐색 테마"><button type="button" data-tr-filter="all" data-tr-focus="filter-all" aria-pressed="${filter==='all'}">전체</button>${THEMES.map(theme => `<button type="button" data-tr-filter="${theme.id}" data-tr-focus="filter-${theme.id}" aria-pressed="${filter===theme.id}">${esc(theme.label)}</button>`).join('')}</div><div class="tr-list">${visible.map(card).join('')}</div>${openTheme ? detail(THEMES.find(theme => theme.id === openTheme)) : ''}<p class="tr-note">관광 후보를 바탕으로 만든 탐색 제안이에요. 영상·실시간 인기 순위를 제공하는 기능은 아니며, 추천 장소와 실제 영상 내용은 다를 수 있어요.</p>` : `<div class="tr-empty">${city ? '이 여행지의 영상 탐색용 장소 후보를 준비 중이에요.' : '상단에서 여행지를 선택하면 해당 도시의 야경·먹거리·산책 영상을 찾아볼 수 있어요.'}</div>`}<p class="tr-status" role="status" aria-live="polite" aria-atomic="true">${esc(status)}</p>`;
    const list = root.querySelector('.tr-list'); if (list) list.scrollLeft = listScroll;
    if (focusKey) {
      const target = [...root.querySelectorAll('[data-tr-focus]')].find(el => el.dataset.trFocus === focusKey && !el.disabled);
      (target || (focusKey === 'add' ? root.querySelector('[data-tr-scroll]') : null))?.focus({preventScroll:true});
    }
  }
  function schedule() {
    if (adding || queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; render(); });
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || !root.contains(button) || button.disabled) return;
    if (button.hasAttribute('data-tr-filter')) {
      const value = button.dataset.trFilter;
      if (value !== 'all' && !THEMES.some(theme => theme.id === value)) return;
      filter = value; openTheme = ''; selected.clear(); status = ''; render();
    } else if (button.hasAttribute('data-tr-open')) {
      const theme = THEMES.find(item => item.id === button.dataset.trOpen);
      if (!theme) return;
      if (openTheme === theme.id) { openTheme = ''; selected.clear(); }
      else { openTheme = theme.id; selected = new Set(placesFor(theme).filter(p => !isPicked(p)).map(p => p.name)); }
      status = ''; render();
      if (openTheme) root.querySelector('#tr-place-panel')?.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth',block:'nearest'});
    } else if (button.hasAttribute('data-tr-close')) {
      const oldTheme = openTheme; openTheme = ''; selected.clear(); render();
      [...root.querySelectorAll('[data-tr-open]')].find(el => el.dataset.trOpen === oldTheme)?.focus({preventScroll:true});
    } else if (button.hasAttribute('data-tr-scroll')) {
      const course = document.getElementById('course-root');
      if (course) { course.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',block:'start'}); }
    } else if (button.hasAttribute('data-tr-add')) {
      const theme = THEMES.find(item => item.id === openTheme);
      if (!theme || contextCity() !== city || !window.TripTour?.setPicked) { schedule(); return; }
      const names = placesFor(theme).filter(p => selected.has(p.name) && !isPicked(p)).slice(0,3);
      adding = true; let added = 0;
      try {
        for (const place of names) { window.TripTour.setPicked(city,place.name,true); if (isPicked(place)) { added++; selected.delete(place.name); } }
        status = added ? `${added}곳을 내 일정에 담았어요. 아래 추천 일정과 내 일정에서 확인하세요.` : '선택한 장소는 이미 내 일정에 담겨 있어요.';
      } catch (_) { status = added ? `${added}곳을 담았어요. 나머지는 아래 내 일정에서 확인해 주세요.` : '지금은 장소를 담지 못했어요. 위 관광 목록에서 다시 시도해 주세요.'; }
      finally { adding = false; render(); }
    }
  });
  root.addEventListener('change', event => {
    const input = event.target.closest('input[data-tr-place]');
    if (!input || !root.contains(input)) return;
    const theme = THEMES.find(item => item.id === openTheme);
    const place = theme && placesFor(theme).find(p => p.name === input.dataset.trPlace);
    if (!place || isPicked(place)) return;
    if (input.checked && selected.size < 3) selected.add(place.name); else selected.delete(place.name);
    status = ''; render();
  });
  root.addEventListener('error', event => {
    const img = event.target;
    if (img instanceof HTMLImageElement && img.classList.contains('tr-image')) img.remove();
  },true);
  const style = document.createElement('style');
  style.textContent = `
    #tour-reels-root{container-type:inline-size;max-width:100%;min-width:0;margin-top:28px;padding:24px 0 4px;border-top:1px solid #e2e9e4;color:#223a2e}
    #tour-reels-root *{box-sizing:border-box}
    #tour-reels-root .tr-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
    #tour-reels-root .tr-kicker{color:#1d735a;font-size:10px;font-weight:850;letter-spacing:1.3px}
    #tour-reels-root h3{font-size:24px;line-height:1.5;margin:7px 0;letter-spacing:-.7px;word-break:keep-all}
    #tour-reels-root .tr-kind-label{flex:none;background:#e6f1e9;color:#1d735a;padding:6px 9px;border-radius:7px;font-size:10px;font-weight:800;margin-top:3px}
    #tour-reels-root .tr-intro,#tour-reels-root .tr-note{font-size:12px;line-height:1.8;color:#6a786e;margin:6px 0 15px}
    #tour-reels-root .tr-filters{display:flex;gap:7px;flex-wrap:wrap;margin:16px 0}
    #tour-reels-root button{font:inherit;cursor:pointer}
    #tour-reels-root .tr-filters button{padding:8px 12px;border-radius:999px;background:white;border:1px solid #d9e3dc;color:#52665a;font-size:12px;font-weight:700}
    #tour-reels-root .tr-filters button[aria-pressed=true]{background:#1d735a;color:#fff;border-color:#1d735a}
    #tour-reels-root .tr-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px;max-width:100%;min-width:0}
    #tour-reels-root .tr-card{min-width:0}
    #tour-reels-root .tr-poster{position:relative;aspect-ratio:9/16;overflow:hidden;border-radius:17px;background:#1b493b;isolation:isolate}
    #tour-reels-root .tr-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2}
    #tour-reels-root .tr-art{position:absolute;inset:0;overflow:hidden;background:linear-gradient(145deg,#345a70,#173734 60%,#091c27);z-index:-3}
    #tour-reels-root .tr-local .tr-art{background:linear-gradient(145deg,#eeae77,#a96a44 55%,#513e35)}
    #tour-reels-root .tr-walk .tr-art{background:linear-gradient(145deg,#b6d5a7,#62977b 55%,#315a49)}
    #tour-reels-root .tr-art>span{position:absolute;right:15%;top:18%;font-size:70px;color:#ecedb9cc;font-family:Georgia,serif;line-height:1}
    #tour-reels-root .tr-art i,#tour-reels-root .tr-art b{position:absolute;left:-35%;top:38%;width:145%;height:75%;border-radius:48%;background:#ffffff12;transform:rotate(-25deg)}
    #tour-reels-root .tr-art b{left:20%;top:25%;background:#ffffff0c;transform:rotate(35deg)}
    #tour-reels-root .tr-shade{position:absolute;inset:0;background:linear-gradient(180deg,#061d2310 10%,#061d2333 35%,#092a25ed 100%);z-index:-1}
    #tour-reels-root .tr-badge{position:absolute;top:13px;left:12px;background:#ffffffed;color:#285541;border-radius:7px;padding:5px 7px;font-size:9px;font-weight:800}
    #tour-reels-root .tr-copy{position:absolute;left:14px;right:14px;bottom:14px;color:white}
    #tour-reels-root .tr-theme{color:#e1f194;font-size:10px;font-weight:850}
    #tour-reels-root .tr-copy h4{font-size:clamp(16px,1.8vw,22px);line-height:1.45;letter-spacing:-.6px;margin:6px 0 8px;word-break:keep-all}
    #tour-reels-root .tr-copy p{font-size:11px;line-height:1.65;margin:0 0 10px;color:#e7efe8;word-break:keep-all}
    #tour-reels-root .tr-place-count{font-size:10px;color:#d4e5da;display:block;margin-bottom:12px}
    #tour-reels-root .tr-open{display:block;width:100%;text-align:center;border:1px solid #ffffff80;border-radius:9px;background:#fffffff0;color:#174c39;font-size:11px;font-weight:850;padding:10px 5px}
    #tour-reels-root .tr-open[aria-expanded=true]{background:#d9f17c;border-color:#d9f17c}
    #tour-reels-root .tr-credit{font-size:9px;line-height:1.5;color:#78847c;overflow-wrap:anywhere;margin:7px 2px;min-height:27px}
    #tour-reels-root .tr-credit a{color:inherit;text-underline-offset:2px}
    #tour-reels-root .tr-youtube{font-size:11px;font-weight:700;color:#1d735a;line-height:1.7;display:inline-block;margin:2px 0 12px;text-underline-offset:3px}
    #tour-reels-root .tr-detail{border:1px solid #ccded1;border-radius:16px;background:#f5faf6;padding:18px;margin:15px 0}
    #tour-reels-root .tr-detail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
    #tour-reels-root .tr-detail-kicker{font-size:10px;font-weight:800;color:#1d735a}
    #tour-reels-root .tr-detail h4{font-size:17px;margin:6px 0;line-height:1.6}
    #tour-reels-root .tr-detail p{font-size:12px;line-height:1.8;color:#67776a;margin:8px 0}
    #tour-reels-root .tr-close{flex:none;border:1px solid #d4e1d8;background:white;border-radius:50%;width:32px;height:32px;font-size:13px;color:#58705f}
    #tour-reels-root fieldset{border:0;margin:14px 0;padding:0;min-width:0}
    #tour-reels-root legend{font-size:11px;font-weight:700;color:#56705e;margin-bottom:8px}
    #tour-reels-root .tr-place{display:flex;align-items:center;gap:10px;border:1px solid #dce7df;border-radius:10px;background:white;padding:11px;margin:7px 0;cursor:pointer}
    #tour-reels-root .tr-place input{width:17px;height:17px;accent-color:#1d735a;flex:none}
    #tour-reels-root .tr-place>span{min-width:0;flex:1}
    #tour-reels-root .tr-place b{font-size:13px;line-height:1.6;overflow-wrap:anywhere}
    #tour-reels-root .tr-place small{display:block;font-size:10px;color:#758679;line-height:1.6;margin-top:3px}
    #tour-reels-root .tr-place em{font-size:10px;font-style:normal;font-weight:800;color:#1d735a;flex:none}
    #tour-reels-root .tr-picked{background:#edf5ef;cursor:default}
    #tour-reels-root .tr-detail-actions{display:flex;gap:9px;flex-wrap:wrap;align-items:center}
    #tour-reels-root .tr-add{border:0;border-radius:10px;padding:12px 16px;background:#1d735a;color:white;font-size:12px;font-weight:800}
    #tour-reels-root .tr-add:disabled{background:#dde8df;color:#6e8273;cursor:default}
    #tour-reels-root .tr-scroll{border:1px solid #bfd4c5;border-radius:10px;background:white;padding:11px 13px;color:#315d42;font-size:12px;font-weight:700}
    #tour-reels-root .tr-detail p.tr-footnote,#tour-reels-root .tr-note{font-size:10px;color:#7b877e}
    #tour-reels-root .tr-status{font-size:12px;font-weight:750;line-height:1.8;color:#1d735a;margin:8px 0;min-height:0}
    #tour-reels-root .tr-status:empty{display:none}
    #tour-reels-root .tr-empty{padding:24px 18px;border:1px dashed #cadbce;border-radius:14px;color:#6c7d70;font-size:12px;line-height:1.8}
    #tour-reels-root button:focus-visible,#tour-reels-root a:focus-visible,#tour-reels-root input:focus-visible{outline:3px solid #9cc3a8;outline-offset:3px}
    @container(max-width:580px){#tour-reels-root .tr-list{grid-template-columns:repeat(3,minmax(164px,1fr));overflow-x:auto;padding:0 0 9px;scroll-snap-type:x proximity}#tour-reels-root .tr-card{scroll-snap-align:start}#tour-reels-root h3{font-size:20px}#tour-reels-root .tr-copy h4{font-size:17px}#tour-reels-root .tr-copy{left:12px;right:12px}#tour-reels-root .tr-detail{padding:14px}}
    @media(max-width:760px){#tour-reels-root .tr-list{grid-template-columns:repeat(3,minmax(164px,1fr));overflow-x:auto;padding-bottom:9px}#tour-reels-root h3{font-size:20px}#tour-reels-root .tr-copy h4{font-size:17px}#tour-reels-root .tr-detail-actions>*{width:100%;text-align:center}}
  `;
  document.head.appendChild(style);
  ['tripcontext:change','triptour:change','tripcourse:change','triptourphotos:change','triptrend:change'].forEach(name => document.addEventListener(name,schedule));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',render,{once:true}); else render();
})();

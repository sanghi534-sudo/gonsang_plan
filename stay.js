/* 숙소 탭 필터 동작 (숙소 유형 / 가격 범위 / 침실과 침대 / 편의시설 / 건물 유형)
 *
 * 칩(.opts) 선택은 trip-conditions.html 의 공통 로직이 처리하고,
 * 이 파일은 가격 범위와 침실·침대·욕실 스테퍼를 담당한다.
 *
 *   StayFilter.get()          // 현재 숙소 조건 객체
 *   StayFilter.summaryText()  // 조건 요약 문자열
 *   StayFilter.reset()        // 전체 삭제
 *   'tripstay:change' 이벤트  // 값이 바뀔 때 document 로 발생
 */
(() => {
  const pane = document.getElementById('pane-stay');
  if (!pane) return;
  const $ = s => pane.querySelector(s);
  const $$ = s => [...pane.querySelectorAll(s)];

  const PRICE_MAX = 2600000, STEP = 10000, STEP_MAX = 8;
  const st = { min: 0, max: PRICE_MAX, bedrooms: 0, beds: 0, baths: 0 };
  const LABEL = { bedrooms: '침실', beds: '침대', baths: '욕실' };

  const won = n => '₩' + Number(n).toLocaleString('ko-KR');
  const changed = () => document.dispatchEvent(new CustomEvent('tripstay:change', { detail: api.get() }));

  /* ---------- 가격 범위 ---------- */
  const minR = $('#stMin'), maxR = $('#stMax'), minT = $('#stMinTxt'), maxT = $('#stMaxTxt'), fill = $('#stFill');
  function drawPrice() {
    minR.value = st.min; maxR.value = st.max;
    minT.value = won(st.min);
    maxT.value = won(st.max) + (st.max >= PRICE_MAX ? '+' : '');
    fill.style.left = (st.min / PRICE_MAX * 100) + '%';
    fill.style.width = ((st.max - st.min) / PRICE_MAX * 100) + '%';
  }
  minR.addEventListener('input', () => { st.min = Math.min(+minR.value, st.max); drawPrice(); changed(); });
  maxR.addEventListener('input', () => { st.max = Math.max(+maxR.value, st.min); drawPrice(); changed(); });
  const typed = (el, key) => el.addEventListener('change', () => {
    const n = parseInt(el.value.replace(/[^\d]/g, ''), 10);
    if (Number.isFinite(n)) {
      const v = Math.min(PRICE_MAX, Math.max(0, n));
      st[key] = key === 'min' ? Math.min(v, st.max) : Math.max(v, st.min);
    }
    drawPrice(); changed();
  });
  typed(minT, 'min'); typed(maxT, 'max');

  /* ---------- 침실 · 침대 · 욕실 ---------- */
  function drawSteppers() {
    $$('.st-step').forEach(box => {
      const k = box.dataset.st, v = st[k];
      box.querySelector('span').textContent = v ? `${v}${v >= STEP_MAX ? '+' : ''}개` : '상관없음';
      box.querySelector('[data-d="-1"]').disabled = v <= 0;
      box.querySelector('[data-d="1"]').disabled = v >= STEP_MAX;
    });
  }
  pane.addEventListener('click', e => {
    const b = e.target.closest('.st-step button'); if (!b) return;
    const k = b.closest('.st-step').dataset.st;
    st[k] = Math.min(STEP_MAX, Math.max(0, st[k] + +b.dataset.d));
    drawSteppers(); changed();
  });

  /* ---------- 편의시설 더 표시 / 전체 삭제 ---------- */
  const extra = $('#stExtra'), more = $('#stMore');
  more.addEventListener('click', () => {
    extra.hidden = !extra.hidden;
    more.textContent = extra.hidden ? '더 표시 ⌄' : '접기 ⌃';
  });
  const strip = s => s.replace(/^[^\p{L}\p{N}]+/u, '').trim();      // 앞쪽 이모지 제거
  const chips = key => $$(`.opts[data-key="${key}"] .opt.on`).map(b => strip(b.textContent));

  /* ---------- 공개 API ---------- */
  const api = {
    get() {
      return {
        type: chips('stayType')[0] || '모든 유형',
        priceMin: st.min, priceMax: st.max,
        bedrooms: st.bedrooms, beds: st.beds, baths: st.baths,
        amenities: [...chips('stayAmenity'), ...chips('stayAmenityMore')],
        buildings: chips('stayBuilding'),
        plan: planSegments()
      };
    },
    summaryText() {
      const g = api.get(), parts = [g.type];
      if (st.min > 0 || st.max < PRICE_MAX) parts.push(`${won(st.min)}~${won(st.max)}${st.max >= PRICE_MAX ? '+' : ''}`);
      Object.keys(LABEL).forEach(k => { if (st[k]) parts.push(`${LABEL[k]} ${st[k]}${st[k] >= STEP_MAX ? '+' : ''}개 이상`); });
      if (g.amenities.length) parts.push(g.amenities.join(', '));
      if (g.buildings.length) parts.push(g.buildings.join(', '));
      const ps = planSummary(); if (ps) parts.push(ps);
      return parts.join(' · ');
    },
    reset() {
      Object.assign(st, { min: 0, max: PRICE_MAX, bedrooms: 0, beds: 0, baths: 0 });
      // 칩 해제 후 공통 로직(state.opts)이 읽도록 클릭을 흉내 낸다
      $$('.opts[data-key^="stay"] .opt.on').forEach(b => {
        if (b.closest('[data-key="stayType"]')) return;
        b.click();
      });
      const all = $('.opts[data-key="stayType"] .opt'); if (all && !all.classList.contains('on')) all.click();
      drawPrice(); drawSteppers(); changed();
    }
  };
  window.StayFilter = api;
  $('#stReset').addEventListener('click', () => api.reset());

  /* ---------- 숙소 검색 결과 화면 (카드 목록 + 지도) ---------- */
  const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
  const WORLD_BOUNDS = [[-85, -180], [85, 180]];
  const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const OSM_ATTR = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ICON = { 호텔: '🏨', 아파트: '🏢', 펜션: '🏖', '게스트용 별채': '🏡', '단독 주택': '🏠', 리조트: '🌴' };
  const iconOf = t => ICON[Object.keys(ICON).find(k => (t || '').includes(k))] || '🛏';
  const nightsOf = c => (c.start && c.end ? Math.max(1, Math.round((new Date(c.end) - new Date(c.start)) / 864e5)) : 0);

  let overlay, map, layer, markers = {}, leafletReady;
  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (leafletReady) return leafletReady;
    leafletReady = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = LEAFLET + 'leaflet.min.css';
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = LEAFLET + 'leaflet.min.js';
      js.onload = resolve; js.onerror = () => { leafletReady = null; reject(new Error('지도 라이브러리를 불러오지 못했어요.')); };
      document.head.appendChild(js);
    });
    return leafletReady;
  }

  const style = document.createElement('style');
  style.textContent = `
    .sr{margin-top:28px;padding-top:6px;border-top:2px solid #e6e9e7;background:#fff;display:flex;flex-direction:column}
    .sr[hidden]{display:none}
    .sr-bar{display:flex;align-items:center;gap:16px;padding:12px 0;flex:none}
    .sr-back{padding:9px 14px;border-radius:999px;border:1px solid #ccc;font-weight:700;font-size:14px;background:#fff;cursor:pointer}
    .sr-back:hover{background:#f4f4f4}
    .sr-title{font-size:17px;font-weight:800}
    .sr-note{display:block;font-size:12px;color:#717171;margin-top:2px}
    .sr-tog{margin-left:auto;display:none;border:1px solid #ccc;border-radius:999px;overflow:hidden}
    .sr-tog button{padding:8px 14px;font-size:13px;font-weight:700;border:0;background:#fff;cursor:pointer}
    .sr-tog button.on{background:#1d735a;color:#fff}
    .sr-body{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:18px;height:680px}
    .sr-list{overflow:auto;padding:4px 6px 20px 0;display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:22px 18px;align-content:start}
    .sr-map{position:relative;min-height:0;background:#e9ecea;border-radius:16px;overflow:hidden}
    #srMapEl{position:absolute;inset:0}
    .sr-state{grid-column:1/-1;padding:60px 10px;text-align:center;color:#555;font-size:15px;line-height:1.7}
    .sr-spin{width:34px;height:34px;margin:0 auto 14px;border:4px solid #dfe5e2;border-top-color:#1d735a;border-radius:50%;animation:srspin 1s linear infinite}
    @keyframes srspin{to{transform:rotate(360deg)}}
    .sr-card{cursor:pointer;border-radius:16px;transition:box-shadow .15s}
    .sr-card.hl{box-shadow:0 0 0 3px #1d735a}
    .sr-photo{position:relative;overflow:hidden;aspect-ratio:4/3;border-radius:16px;display:grid;place-items:center;font-size:44px;background:linear-gradient(135deg,#e4f3ed,#d9f17c55)}
    .sr-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
    .sr-badge{position:absolute;left:10px;top:10px;background:#fff;border-radius:999px;padding:5px 10px;font-size:12px;font-weight:700;box-shadow:0 1px 4px rgba(0,0,0,.15)}
    .sr-heart{position:absolute;right:10px;top:8px;font-size:22px;color:#fff;text-shadow:0 0 3px #0008;background:none;border:0;cursor:pointer}
    .sr-heart.on{color:#e0245e}
    .sr-row{display:flex;justify-content:space-between;gap:8px;margin-top:10px;font-size:14px}
    .sr-row b{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .sr-row span{white-space:nowrap}
    .sr-sub{font-size:13px;color:#717171;margin-top:2px}
    .sr-price{margin-top:6px;font-size:14px}
    .sr-price u{font-weight:700}
    .sr-tag{display:inline-block;margin-top:6px;font-size:11px;color:#555;background:#f2f2f2;border-radius:4px;padding:2px 6px}
    .sr-link{display:inline-block;margin-top:6px;font-size:12px;color:#1d735a;font-weight:700}
    .sr-pin{background:#fff;border:1px solid #bbb;border-radius:999px;padding:5px 9px;font:700 12px/1 -apple-system,"Segoe UI","Malgun Gothic",sans-serif;box-shadow:0 2px 6px rgba(0,0,0,.25);white-space:nowrap;color:#222;transform:translate(-50%,-50%)}
    .sr-pin.on{background:#1d735a;color:#fff;border-color:#1d735a;z-index:1000!important}
    .leaflet-div-icon.sr-ico{background:none;border:0}
    @media (max-width:900px){
      .sr-tog{display:flex}
      .sr-body{grid-template-columns:1fr;height:560px}
      .sr-body[data-v="list"] .sr-map{display:none}
      .sr-body[data-v="map"] .sr-list{display:none}
    }
  `;
  document.head.appendChild(style);

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'sr'; overlay.hidden = true;
    overlay.setAttribute('aria-label', '숙소 검색 결과');
    overlay.innerHTML = `
      <header class="sr-bar">
        <button class="sr-back" type="button" id="srBack">결과 닫기 ✕</button>
        <div><div class="sr-title" id="srTitle"></div><span class="sr-note" id="srNote"></span></div>
        <div class="sr-tog" id="srTog"><button type="button" data-v="list" class="on">목록</button><button type="button" data-v="map">지도</button></div>
      </header>
      <section class="sr-plan" id="srPlan" hidden></section>
      <div class="sr-body" id="srBody" data-v="list">
        <section class="sr-list" id="srList"></section>
        <div class="sr-map"><div id="srMapEl"></div></div>
      </div>`;
    pane.appendChild(overlay);   // 항공 탭처럼 현재 화면의 숙소 탭 하단에 표시
    overlay.querySelector('#srBack').addEventListener('click', closeResults);
    bindPlanEvents();
    overlay.querySelector('#srTog').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      overlay.querySelectorAll('#srTog button').forEach(x => x.classList.toggle('on', x === b));
      overlay.querySelector('#srBody').dataset.v = b.dataset.v;
      if (map) setTimeout(() => map.invalidateSize(), 50);
    });
    return overlay;
  }
  function openResults() {
    const o = ensureOverlay(); o.hidden = false;
    o.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function closeResults() { overlay.hidden = true; }
  const $o = s => overlay.querySelector(s);

  function showState(html) { $o('#srList').innerHTML = `<div class="sr-state">${html}</div>`; }

  function priceText(s, nights) {
    if (s.priceKRW == null) return '<span class="sr-sub">가격 정보 없음</span>';
    const night = '₩' + Math.round(s.priceKRW).toLocaleString('ko-KR');
    const demo = s.priceDemo ? ' <span class="sr-tag" title="웹에서 가격을 찾지 못해 채운 데모용 가격입니다">가데이터</span>' : '';
    if (!nights) return `<u>${night}</u> <span class="sr-sub">/ 1박</span>${demo}`;
    return `<u>총액 ₩${Math.round(s.priceKRW * nights).toLocaleString('ko-KR')}</u> <span class="sr-sub">(${night} × ${nights}박)</span>${demo}`;
  }
  function cardHTML(s, nights) {
    const spec = [s.bedrooms != null && `침실 ${s.bedrooms}개`, s.beds != null && `침대 ${s.beds}개`, s.baths != null && `욕실 ${s.baths}개`].filter(Boolean).join(' · ');
    const rating = s.rating != null ? `★ ${s.rating.toFixed(2).replace(/0$/, '')}${s.reviews != null ? ` (${s.reviews.toLocaleString('ko-KR')})` : ''}` : '';
    return `<article class="sr-card" data-id="${s.id}">
      <div class="sr-photo">${iconOf(s.type)}${s.imageUrl ? `<img src="${esc(s.imageUrl)}" alt="${esc(s.name)}" loading="lazy" referrerpolicy="no-referrer">` : ''}<span class="sr-badge">${s.lat == null ? '위치 미확인' : esc(s.type || '숙소')}</span><button class="sr-heart" type="button" aria-label="저장">♥</button></div>
      <div class="sr-row"><b>${esc(s.name)}</b><span>${rating}</span></div>
      ${s.area ? `<div class="sr-sub">${esc(s.area)}</div>` : ''}
      ${s.highlight ? `<div class="sr-sub">${esc(s.highlight)}</div>` : ''}
      ${spec ? `<div class="sr-sub">${spec}</div>` : ''}
      <div class="sr-price">${priceText(s, nights)}</div>
      ${s.freeCancel ? '<span class="sr-tag">취소 수수료 없음</span>' : ''}
      ${pickHTML(s)}
      ${s.url ? `<div><a class="sr-link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">출처 보기 ↗</a></div>` : ''}
    </article>`;
  }

  function renderMap(data, dest) {
    const el = $o('#srMapEl');
    if (!window.L) { el.innerHTML = '<div class="sr-state">지도를 불러오지 못했어요.</div>'; return; }
    if (!map) {
      map = L.map(el, { zoomControl: true, scrollWheelZoom: true, minZoom: 2, maxBounds: WORLD_BOUNDS, maxBoundsViscosity: 1 });
      L.control.scale({ imperial: false }).addTo(map);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
      }).addTo(map);
      layer = L.layerGroup().addTo(map);
      addWorldPins();
    }
    paintWorldPins(dest);
    layer.clearLayers(); markers = {};
    const pts = [];
    data.stays.forEach(s => {
      if (s.lat == null || s.lng == null) return;
      const label = s.priceKRW != null ? (s.priceDemo ? '~' : '') + '₩' + Math.round(s.priceKRW).toLocaleString('ko-KR') : esc(s.name).slice(0, 10);
      const m = L.marker([s.lat, s.lng], {
        icon: L.divIcon({ className: 'leaflet-div-icon sr-ico', html: `<div class="sr-pin" data-id="${s.id}">${label}</div>`, iconSize: [0, 0] })
      }).addTo(layer);
      m.bindTooltip(esc(s.name), { direction: 'top', offset: [0, -14] });
      m.on('click', () => focusCard(s.id, true));
      markers[s.id] = m; pts.push([s.lat, s.lng]);
    });
    setTimeout(() => {
      map.invalidateSize();
      if (pts.length) map.fitBounds(pts, { padding: [50, 50], maxZoom: 15 });
      else if (data.center) map.setView([data.center.lat, data.center.lng], 11);
      else map.setView([20, 0], 2);
    }, 60);
  }

  function setActive(id, on) {
    const card = $o(`.sr-card[data-id="${id}"]`); if (card) card.classList.toggle('hl', on);
    const pin = overlay.querySelector(`.sr-pin[data-id="${id}"]`); if (pin) pin.classList.toggle('on', on);
  }
  function focusCard(id, scroll) {
    overlay.querySelectorAll('.sr-card.hl').forEach(c => setActive(c.dataset.id, false));
    setActive(id, true);
    const card = $o(`.sr-card[data-id="${id}"]`);
    if (scroll && card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function renderResults(data, ctx) {
    const nights = nightsOf(ctx);
    setPlanContext(ctx, data);
    $o('#srTitle').textContent = data.stays.length ? `${ctx.dest} 숙소 ${data.stays.length}개` : `${ctx.dest} 숙소를 찾지 못했어요`;
    $o('#srNote').textContent = (data.source === 'sample' ? '샘플 데이터 · ' : 'AI 웹 검색 · ') + (data.note || '');
    if (!data.stays.length) { showState('조건에 맞는 숙소를 찾지 못했어요.<br>가격 범위나 편의시설 조건을 줄여서 다시 검색해 보세요.'); renderMap(data, ctx.dest); return; }
    $o('#srList').innerHTML = data.stays.map(s => cardHTML(s, nights)).join('');
    renderMap(data, ctx.dest);
  }

  async function runSearch() {
    const msg = $('#stMsg'), btn = $('#stSearch');
    const say = t => { msg.textContent = t; msg.hidden = !t; };
    say('');
    const ctx = window.TripContext ? window.TripContext() : null;
    if (!ctx || !ctx.dest) { say('상단에서 여행지를 먼저 선택해 주세요.'); return; }
    if (location.protocol === 'file:') {
      say('숙소 검색은 로컬 서버가 필요해요. 터미널에서 npm start 실행 후 http://localhost:3000/trip-conditions.html 로 열어 주세요.');
      return;
    }
    const query = { dest: ctx.dest, start: ctx.start, end: ctx.end, guests: ctx.guests, filters: api.get() };
    btn.disabled = true; openResults();
    $o('#srTitle').textContent = `${ctx.dest} 숙소 검색 중…`; $o('#srNote').textContent = '';
    showState('<div class="sr-spin"></div>AI가 웹에서 숙소를 찾고 있어요.<br>보통 30초~1분 정도 걸립니다.');
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 170000);
    try {
      await loadLeaflet().catch(() => {});      // 지도 실패해도 목록은 보여 준다
      const res = await fetch('/api/stays', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(query), signal: ctl.signal
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `검색에 실패했어요 (${res.status})`);
      renderResults(data, ctx);
    } catch (err) {
      $o('#srTitle').textContent = '숙소 검색에 실패했어요';
      showState(esc(err.name === 'AbortError' ? '응답 시간이 초과됐어요. 잠시 후 다시 시도해 주세요.' : err.message));
    } finally {
      clearTimeout(timer); btn.disabled = false;
    }
  }
  $('#stSearch').addEventListener('click', runSearch);

  // 이미지 주소가 깨졌으면 이미지를 지우고 아이콘 배경만 보여 준다 (error 는 버블링되지 않아 캡처 단계에서 받는다)
  document.addEventListener('error', e => {
    if (e.target && e.target.tagName === 'IMG' && e.target.closest && e.target.closest('.sr-photo')) e.target.remove();
  }, true);

  // 카드 <-> 지도 핀 연동 (오버레이는 body 아래에 있으므로 document 에서 위임)
  document.addEventListener('mouseover', e => {
    const c = e.target.closest && e.target.closest('.sr-card'); if (c) setActive(c.dataset.id, true);
  });
  document.addEventListener('mouseout', e => {
    const c = e.target.closest && e.target.closest('.sr-card'); if (c) setActive(c.dataset.id, false);
  });
  document.addEventListener('click', e => {
    const heart = e.target.closest && e.target.closest('.sr-heart');
    if (heart) { e.stopPropagation(); heart.classList.toggle('on'); return; }
    const c = e.target.closest && e.target.closest('.sr-card');
    if (c && markers[c.dataset.id] && map) {
      const m = markers[c.dataset.id];
      map.setView(m.getLatLng(), Math.max(map.getZoom(), 14), { animate: true });
    }
  });

  /* ---------- 숙박 일정: 여행 날짜 중 숙소별로 숙박 일자를 나눠 선택 ---------- */
  var plan = { snaps: {}, byDate: {} };      // byDate[YYYY-MM-DD(숙박일)] = snaps 키
  var tripNights = [], planSel = { a: 0, b: -1, pending: null }, planData = null, planCtx = null, budgetOwned = false;
  const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];
  const PALETTE = ['#1d735a', '#3b6fd4', '#d9822b', '#8a4fc7', '#c2413b', '#12a3a3'];
  const pad2 = n => String(n).padStart(2, '0');
  const dstr = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const addDays = (s0, n) => { const d = new Date(s0 + 'T00:00:00'); d.setDate(d.getDate() + n); return dstr(d); };
  const mdOf = s0 => { const d = new Date(s0 + 'T00:00:00'); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const mdwOf = s0 => { const d = new Date(s0 + 'T00:00:00'); return `${d.getMonth() + 1}/${d.getDate()}(${DOW_KO[d.getDay()]})`; };
  const snapKey = s0 => `${s0.name}|${s0.area || ''}`;
  const colorOfKey = k => { const i = Object.keys(plan.snaps).indexOf(k); return PALETTE[(i < 0 ? 0 : i) % PALETTE.length]; };
  const won0 = n => '₩' + Math.round(n).toLocaleString('ko-KR');

  // 연속된 숙박일을 [시작, 체크아웃, 박수] 구간으로 묶는다
  function segmentsOf(dates) {
    const out = [];
    dates.slice().sort().forEach(d => {
      const last = out[out.length - 1];
      if (last && addDays(last.to, 1) === d) { last.to = d; last.n++; } else out.push({ from: d, to: d, n: 1 });
    });
    return out.map(g => ({ from: g.from, out: addDays(g.to, 1), n: g.n }));
  }
  const segLabel = g => `${mdOf(g.from)} → ${mdOf(g.out)} (${g.n}박)`;

  function planSegments() {
    const byKey = {};
    tripNights.forEach(d => { const k = plan.byDate[d]; if (k) (byKey[k] = byKey[k] || []).push(d); });
    return Object.entries(byKey).flatMap(([k, dates]) => segmentsOf(dates).map(g => ({
      name: plan.snaps[k].name, from: g.from, checkOut: g.out, nights: g.n,
      priceKRWPerNight: plan.snaps[k].priceKRW, area: plan.snaps[k].area, url: plan.snaps[k].url
    }))).sort((a, b) => a.from.localeCompare(b.from));
  }
  function planSummary() {
    if (!tripNights.length) return '';
    const got = tripNights.filter(d => plan.byDate[d]).length;
    return got ? `숙박 ${got}/${tripNights.length}박 지정` : '';
  }

  function planTotals() {
    let sum = 0, unknown = 0, assigned = 0;
    tripNights.forEach(d => {
      const k = plan.byDate[d]; if (!k) return;
      assigned++;
      const pr = plan.snaps[k].priceKRW;
      if (pr == null) unknown++; else sum += pr;
    });
    return { sum, unknown, assigned, open: tripNights.length - assigned };
  }

  // 확정된 숙박 합계를 예산 패널의 공개 API 로 전달 (예산 코드는 수정하지 않는다)
  function syncBudget() {
    const B = window.TripBudget; if (!B || typeof B.set !== 'function') return;
    const t = planTotals();
    try {
      if (t.assigned && t.sum > 0) { B.set('stay', Math.round(t.sum), 'KRW'); budgetOwned = true; }
      else if (budgetOwned && typeof B.clear === 'function') { B.clear('stay'); budgetOwned = false; }
    } catch (_) { /* 예산 패널이 없어도 일정 선택은 계속 동작 */ }
  }
  function planChanged() {
    renderPlan(); refreshCards(); syncBudget();
    document.dispatchEvent(new CustomEvent('tripstay:change', { detail: api.get() }));
  }
  function refreshCards() {
    if (!planData || !planData.stays.length) return;
    $o('#srList').innerHTML = planData.stays.map(s0 => cardHTML(s0, nightsOf(planCtx))).join('');
  }

  function setPlanContext(ctx, data) {
    planCtx = ctx; planData = data;
    tripNights = [];
    if (ctx.start && ctx.end) {
      const n = nightsOf(ctx);
      for (let i = 0; i < n; i++) tripNights.push(addDays(ctx.start, i));
    }
    Object.keys(plan.byDate).forEach(d => { if (!tripNights.includes(d)) delete plan.byDate[d]; });   // 날짜가 바뀌면 범위 밖 지정은 정리
    const used = new Set(Object.values(plan.byDate));
    Object.keys(plan.snaps).forEach(k => { if (!used.has(k)) delete plan.snaps[k]; });
    planSel = { a: 0, b: tripNights.length - 1, pending: null };    // 기본값: 전체 기간
    renderPlan(); syncBudget();
  }

  function pickHTML(s0) {
    if (!tripNights.length) return '<button class="sr-pick" type="button" disabled>상단에서 여행 날짜를 먼저 선택하세요</button>';
    const key = snapKey(s0);
    const mine = tripNights.filter(d => plan.byDate[d] === key);
    const tag = mine.length ? `<span class="sr-tag sr-on">선택됨 · ${segmentsOf(mine).map(segLabel).join(', ')}</span>` : '';
    const range = planSel.b >= planSel.a
      ? `${mdOf(tripNights[planSel.a])} → ${mdOf(addDays(tripNights[planSel.b], 1))} (${planSel.b - planSel.a + 1}박)` : '';
    return `${tag}<div><button class="sr-pick" type="button" data-key="${esc(key)}" data-id="${s0.id}">${range ? `이 숙소로 ${esc(range)} 선택` : '기간을 먼저 선택하세요'}</button></div>`;
  }

  function renderPlan() {
    const box = $o('#srPlan'); if (!box) return;
    box.hidden = false;
    if (!tripNights.length) {
      box.innerHTML = '<div class="srp-head"><b>숙박 일정</b><span class="srp-sub">상단에서 여행 날짜(체크인·체크아웃)를 선택하면 숙박 일자별로 숙소를 나눠 고를 수 있어요.</span></div>';
      return;
    }
    const chips = tripNights.map((d, i) => {
      const k = plan.byDate[d], inSel = i >= planSel.a && i <= planSel.b;
      const col = k ? colorOfKey(k) : '#bbb';
      return `<button class="srp-night${inSel ? ' sel' : ''}${k ? ' set' : ''}" type="button" data-i="${i}" style="--c:${col}">
        <b>${mdwOf(d)}</b><small>${k ? esc(plan.snaps[k].name) : '미정'}</small></button>`;
    }).join('');
    const segs = planSegments();
    const t = planTotals();
    const selLabel = planSel.pending !== null ? `${mdOf(tripNights[planSel.a])} 선택됨 · 마지막 숙박일을 눌러 기간을 정하세요`
      : planSel.b >= planSel.a ? `선택 기간 ${mdOf(tripNights[planSel.a])} → ${mdOf(addDays(tripNights[planSel.b], 1))} (${planSel.b - planSel.a + 1}박)` : '';
    box.innerHTML = `
      <div class="srp-head"><b>숙박 일정 · ${tripNights.length}박</b>
        <span class="srp-sub">숙소를 바꾸려면 숙박일을 눌러 기간을 정한 뒤, 숙소 카드에서 "선택"을 누르세요.</span></div>
      <div class="srp-nights">${chips}</div>
      <div class="srp-foot"><span>${esc(selLabel)}</span><button class="srp-all" type="button" data-a="all">전체 기간</button></div>
      ${segs.length ? `<ul class="srp-list">${segs.map(g => `<li><i style="background:${colorOfKey(Object.keys(plan.snaps).find(k => plan.snaps[k].name === g.name))}"></i>
        <span>${esc(segLabel({ from: g.from, out: g.checkOut, n: g.nights }))}</span><b>${esc(g.name)}</b>
        <em>${g.priceKRWPerNight != null ? won0(g.priceKRWPerNight * g.nights) : '가격 미확인'}</em>
        <button type="button" class="srp-rm" data-from="${g.from}" data-n="${g.nights}">삭제</button></li>`).join('')}</ul>` : ''}
      <div class="srp-total">숙박 합계 <strong>${t.assigned ? won0(t.sum) : '미정'}</strong>
        ${t.open ? `<span class="srp-warn">숙소 미정 ${t.open}박</span>` : (t.assigned ? '<span class="srp-ok">모든 숙박일 지정 완료</span>' : '')}
        ${t.unknown ? `<span class="srp-warn">가격 미확인 ${t.unknown}박 제외</span>` : ''}</div>`;
  }

  function bindPlanEvents() {
    overlay.addEventListener('click', e => {
      const night = e.target.closest('.srp-night');
      if (night) {
        e.stopPropagation();
        const i = +night.dataset.i;
        if (planSel.pending === null) planSel = { a: i, b: i, pending: i };
        else planSel = { a: Math.min(planSel.pending, i), b: Math.max(planSel.pending, i), pending: null };
        renderPlan(); refreshCards(); return;
      }
      if (e.target.closest('.srp-all')) {
        e.stopPropagation();
        planSel = { a: 0, b: tripNights.length - 1, pending: null };
        renderPlan(); refreshCards(); return;
      }
      const rm = e.target.closest('.srp-rm');
      if (rm) {
        e.stopPropagation();
        for (let i = 0; i < +rm.dataset.n; i++) delete plan.byDate[addDays(rm.dataset.from, i)];
        planChanged(); return;
      }
      const pick = e.target.closest('.sr-pick');
      if (pick && !pick.disabled) {
        e.stopPropagation();
        const stay = planData.stays.find(x => String(x.id) === pick.dataset.id);
        if (!stay || planSel.b < planSel.a) return;
        const key = snapKey(stay);
        plan.snaps[key] = { name: stay.name, area: stay.area, priceKRW: stay.priceKRW, lat: stay.lat, lng: stay.lng, url: stay.url };
        // 같은 숙소를 같은 기간에 다시 누르면 선택 취소, 아니면 해당 숙박일을 이 숙소로 지정
        const range = tripNights.slice(planSel.a, planSel.b + 1);
        const allSame = range.every(d => plan.byDate[d] === key);
        range.forEach(d => { if (allSame) delete plan.byDate[d]; else plan.byDate[d] = key; });
        planChanged();
      }
    });
  }

  const pcss = document.createElement('style');
  pcss.textContent = `
    .sr-plan{margin:6px 0 14px;padding:14px 16px;border:1px solid #dfe2e0;border-radius:16px;background:#f7f8f6}
    .srp-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;margin-bottom:10px}
    .srp-head b{font-size:16px}
    .srp-sub{font-size:12px;color:#717171}
    .srp-nights{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px}
    .srp-night{flex:none;min-width:96px;padding:8px 10px;border-radius:12px;border:2px solid #ddd;background:#fff;text-align:left;cursor:pointer;border-left:6px solid var(--c)}
    .srp-night b{display:block;font-size:13px}
    .srp-night small{display:block;font-size:11px;color:#717171;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .srp-night.sel{border-color:#1d735a;border-left-color:var(--c);background:#e4f3ed}
    .srp-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px;font-size:13px;color:#444}
    .srp-all{font-size:12px;font-weight:700;text-decoration:underline;color:#1d735a;background:none;border:0;cursor:pointer}
    .srp-list{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:6px}
    .srp-list li{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;background:#fff;font-size:13px}
    .srp-list li i{width:10px;height:10px;border-radius:50%;flex:none}
    .srp-list li b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .srp-list li em{font-style:normal;font-weight:700}
    .srp-rm{font-size:12px;color:#717171;text-decoration:underline;background:none;border:0;cursor:pointer}
    .srp-total{margin-top:10px;font-size:14px;display:flex;flex-wrap:wrap;gap:6px 12px;align-items:baseline}
    .srp-total strong{font-size:18px;color:#1d735a}
    .srp-warn{font-size:12px;color:#b3541e}
    .srp-ok{font-size:12px;color:#1d735a}
    .sr-pick{margin-top:8px;width:100%;padding:9px 10px;border-radius:10px;border:1px solid #1d735a;background:#fff;color:#1d735a;font-weight:700;font-size:13px;cursor:pointer}
    .sr-pick:hover:not(:disabled){background:#e4f3ed}
    .sr-pick:disabled{border-color:#ccc;color:#999;cursor:default}
    .sr-tag.sr-on{background:#e4f3ed;color:#1d735a;font-weight:700}
  `;
  document.head.appendChild(pcss);

  /* ---------- 전 세계 지도 요소 (숙소 검색 결과 지도에 함께 표시) ---------- */
  // 대륙별 색상과 도시 좌표. 이름은 상단 여행지 목록(trip-conditions.html)과 같다.
  const WORLD = {
    '아시아': ['#1d735a', [['도쿄', 35.6762, 139.6503], ['오사카', 34.6937, 135.5023], ['교토', 35.0116, 135.7681], ['후쿠오카', 33.5902, 130.4017],
      ['방콕', 13.7563, 100.5018], ['다낭', 16.0544, 108.2022], ['타이베이', 25.033, 121.5654], ['싱가포르', 1.3521, 103.8198], ['홍콩', 22.3193, 114.1694]]],
    '유럽': ['#3b6fd4', [['파리', 48.8566, 2.3522], ['런던', 51.5072, -0.1276], ['로마', 41.9028, 12.4964], ['프라하', 50.0755, 14.4378], ['바르셀로나', 41.3874, 2.1686]]],
    '북미': ['#d9822b', [['뉴욕', 40.7128, -74.006], ['샌프란시스코', 37.7749, -122.4194], ['로스앤젤레스', 34.0522, -118.2437], ['밴쿠버', 49.2827, -123.1207]]],
    '오세아니아': ['#8a4fc7', [['시드니', -33.8688, 151.2093], ['괌', 13.4443, 144.7937], ['퀸스타운', -45.0312, 168.6626]]],
    '중동·아프리카': ['#c2413b', [['두바이', 25.2048, 55.2708], ['이스탄불', 41.0082, 28.9784], ['케이프타운', -33.9249, 18.4241]]],
    '중남미': ['#12a3a3', [['칸쿤', 21.1619, -86.8515], ['리마', -12.0464, -77.0428]]]
  };

  // 결과 지도 위에 전 세계 도시 핀(대륙별 색상)을 한 번 깔고, 선택한 여행지를 강조한다.
  let worldPins = {}, worldLayer = null;
  function addWorldPins() {
    if (worldLayer) return;
    worldLayer = L.layerGroup().addTo(map);
    Object.entries(WORLD).forEach(([, [color, cities]]) => {
      cities.forEach(([name, lat, lng]) => {
        const m = L.circleMarker([lat, lng], { radius: 6, color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.95 }).addTo(worldLayer);
        m.bindTooltip(name, { direction: 'top', offset: [0, -4] });
        worldPins[name] = m;
      });
    });
  }
  function paintWorldPins(dest) {
    Object.keys(worldPins).forEach(n => {
      const on = n === dest;
      worldPins[n].setStyle({ radius: on ? 10 : 6, weight: on ? 3 : 2, color: on ? '#111' : '#fff' });
      if (on) worldPins[n].bringToFront();
    });
  }

  drawPrice(); drawSteppers();
})();

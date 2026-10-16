/* 맛집 탭 (캐치테이블식 목록: 날짜 스트립 · 식사 시간 · 음식 종류 · 카드 + 예약 가능 시간 칩)
 *
 * 현재는 화면 시안용 샘플 데이터로 동작한다. 실제 검색 연동 시 loadFoods() 만 교체하면 된다.
 * - 선택값(음식 종류·가격대·식사 조건)은 기존 .opts[data-key] 칩을 그대로 쓴다 (요약·저장 코드와 호환).
 * - 담은 맛집의 1인 가격 합계 × 인원을 예산 패널(TripBudget 'food')에 반영한다.
 */
(() => {
  const pane = document.getElementById('pane-food');
  if (!pane) return;
  const $ = (s, r = pane) => r.querySelector(s);
  const $$ = (s, r = pane) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const won = n => '₩' + Math.round(n).toLocaleString('ko-KR');
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];

  const CATS = { '현지 음식': '🍱', '해산물': '🦐', '고기·구이': '🥩', '면·국물': '🍜', '카페·디저트': '🍰', '길거리 음식': '🌮' };
  const KINDS = Object.keys(CATS);
  const BASE = { '현지 음식': [12000, 35000], '해산물': [25000, 60000], '고기·구이': [30000, 70000], '면·국물': [8000, 18000], '카페·디저트': [7000, 15000], '길거리 음식': [3000, 9000] };
  const PRICE = { '1만원 이하': [0, 10000], '1~3만원': [10001, 30000], '3~5만원': [30001, 50000], '5만원 이상': [50001, 1e9] };
  const AREAS = ['중심가', '역 주변', '시장 골목', '해변 근처', '구시가지'];
  const LUNCH = ['11:30', '12:00', '12:30', '13:00', '13:30'];
  const DINNER = ['17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30'];

  const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rng = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  /* ---------- 데이터 (시안용 샘플) ---------- */
  function loadFoods(dest) {
    const r = rng(hash('food|' + dest));
    return Array.from({ length: 14 }, (_, i) => {
      const kind = KINDS[i % KINDS.length], [lo, hi] = BASE[kind];
      return {
        id: `s${i}`, name: `샘플 ${kind.split('·')[0]} 식당 ${i + 1}`, kind,
        area: `${dest || '여행지'} ${AREAS[Math.floor(r() * AREAS.length)]}`,
        price: Math.round((lo + (hi - lo) * r()) / 500) * 500,
        rating: Math.round((3.9 + r() * 1.0) * 10) / 10, reviews: 30 + Math.floor(r() * 900),
        koMenu: r() < 0.4, vegan: r() < 0.25, waitLow: r() < 0.5, reservable: r() < 0.75,
        score: r()
      };
    });
  }
  // 날짜·식사별 예약 가능 시간 (식당·날짜마다 일정하게 같은 값)
  function slotsFor(f, date, meal) {
    if (!f.reservable) return [];
    const r = rng(hash(`${f.id}|${date}|${meal}`));
    const pick = list => list.filter(() => r() < 0.55);
    return meal === '점심' ? pick(LUNCH) : meal === '저녁' ? pick(DINNER) : pick(LUNCH).concat(pick(DINNER));
  }

  /* ---------- 상태 ---------- */
  const PICKS = 'gonsang-food-reserve-picks-v1';
  let picks = {};   // `${date}|${id}` -> { id, date, name, price, slot }
  try { picks = JSON.parse(localStorage.getItem(PICKS) || '{}') || {}; } catch (_) {}
  const ui = { date: '', meal: '전체', sort: 'rec' };
  let ownsBudget = false, foods = [], foodsDest = null;

  const ctx = () => (window.TripContext ? window.TripContext() : { dest: '', start: null, end: null, guests: {} });
  const tripDates = c => {
    if (!c.start) return [];
    const out = [], a = new Date(c.start + 'T00:00:00'), b = new Date((c.end || c.start) + 'T00:00:00');
    for (let d = new Date(a); d <= b && out.length < 31; d.setDate(d.getDate() + 1))
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    return out;
  };
  const sel = key => $$(`.opts[data-key="${key}"] .opt.on`).map(b => b.textContent.trim());

  /* ---------- 스타일 ---------- */
  const style = document.createElement('style');
  style.textContent = `
    #pane-food .fd-strip{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 10px;margin:0 -2px}
    #pane-food .fd-day{flex:none;min-width:58px;padding:8px 6px;border-radius:14px;border:1px solid var(--line);background:#fff;text-align:center}
    #pane-food .fd-day small{display:block;font-size:11px;color:var(--sub);font-weight:700}
    #pane-food .fd-day b{display:block;font-size:17px;margin-top:2px}
    #pane-food .fd-day.on{background:var(--teal-d);border-color:var(--teal-d);color:#fff}
    #pane-food .fd-day.on small{color:rgba(255,255,255,.8)}
    #pane-food .fd-meal{display:flex;gap:6px;margin:4px 0 14px}
    #pane-food .fd-meal button{padding:8px 16px;border-radius:999px;border:1px solid var(--line);font-size:13px;font-weight:700;background:#fff}
    #pane-food .fd-meal button.on{background:var(--teal-soft);border-color:var(--teal-d);color:var(--teal-d)}
    #pane-food .fd-cats{display:flex;flex-wrap:nowrap;gap:6px;overflow-x:auto;padding:4px 0 12px;margin-bottom:6px;border-bottom:1px solid var(--soft2)}
    #pane-food .fd-cats .opt.cat{flex:none;display:flex;flex-direction:column;align-items:center;gap:6px;min-width:76px;padding:10px 8px;border-radius:16px;border:1px solid transparent;background:none;font-size:12px}
    #pane-food .fd-cats .opt.cat::before{content:attr(data-ic);display:grid;place-items:center;width:52px;height:52px;border-radius:50%;background:var(--gray);font-size:26px}
    #pane-food .fd-cats .opt.cat.on{background:none;border-color:transparent;color:var(--teal-d)}
    #pane-food .fd-cats .opt.cat.on::before{background:var(--teal-soft);box-shadow:inset 0 0 0 2px var(--teal-d)}
    #pane-food .fd-filters{display:flex;flex-direction:column;gap:10px;margin:12px 0 4px}
    #pane-food .fd-filters .opts{margin:0;gap:6px}
    #pane-food .fd-filters .opt{padding:7px 13px;font-size:13px}
    #pane-food .fd-filters .lbl{font-size:12px;font-weight:800;color:var(--sub);margin:0 0 5px}
    #pane-food .fd-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:18px 0 12px;flex-wrap:wrap}
    #pane-food .fd-bar strong{font-size:16px}
    #pane-food .fd-sort{display:flex;gap:4px}
    #pane-food .fd-sort button{padding:6px 12px;border-radius:999px;font-size:13px;font-weight:700;color:var(--sub)}
    #pane-food .fd-sort button.on{color:var(--ink);background:var(--soft2)}
    #pane-food .fd-note{padding:10px 12px;border-radius:12px;background:#fff4df;color:#805510;font-size:12px;line-height:1.6;margin-bottom:14px}
    #pane-food .fd-list{display:flex;flex-direction:column}
    #pane-food .fd-card{display:grid;grid-template-columns:168px minmax(0,1fr);gap:16px;padding:16px 0;border-bottom:1px solid var(--soft2)}
    #pane-food .fd-card:last-child{border-bottom:0}
    #pane-food .fd-photo{position:relative;aspect-ratio:1/1;border-radius:16px;display:grid;place-items:center;font-size:54px;background:linear-gradient(135deg,var(--teal-soft),#d9f17c55)}
    #pane-food .fd-badge{position:absolute;left:8px;top:8px;background:#fff;border-radius:999px;padding:4px 9px;font-size:11px;font-weight:800;box-shadow:0 1px 4px rgba(0,0,0,.15)}
    #pane-food .fd-badge.wait{color:#b3541e}
    #pane-food .fd-badge.ok{color:var(--teal-d)}
    #pane-food .fd-heart{position:absolute;right:6px;top:4px;font-size:22px;color:#fff;text-shadow:0 0 3px #0009}
    #pane-food .fd-heart.on{color:#e0245e}
    #pane-food .fd-info{min-width:0;display:flex;flex-direction:column}
    #pane-food .fd-name{display:flex;justify-content:space-between;gap:8px;align-items:baseline}
    #pane-food .fd-name b{font-size:17px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #pane-food .fd-rate{font-size:13px;font-weight:800;white-space:nowrap}
    #pane-food .fd-rate small{font-weight:500;color:var(--sub)}
    #pane-food .fd-sub{font-size:13px;color:var(--sub);margin-top:3px}
    #pane-food .fd-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
    #pane-food .fd-tag{font-size:11px;font-weight:700;padding:3px 8px;border-radius:6px;background:var(--gray);color:#555}
    #pane-food .fd-slots{display:flex;flex-wrap:wrap;gap:6px;margin-top:auto;padding-top:12px}
    #pane-food .fd-slot{min-width:62px;padding:9px 10px;border-radius:10px;border:1px solid var(--teal-d);color:var(--teal-d);font-weight:800;font-size:14px;background:#fff}
    #pane-food .fd-slot:hover{background:var(--teal-soft)}
    #pane-food .fd-slot.on{background:var(--teal-d);color:#fff}
    #pane-food .fd-nos{font-size:13px;color:var(--sub);padding-top:12px;margin-top:auto}
    #pane-food .fd-picks{position:sticky;bottom:12px;margin-top:16px;padding:14px 16px;border-radius:16px;background:#113f34;color:#fff;display:flex;justify-content:space-between;align-items:center;gap:12px;box-shadow:0 8px 24px rgba(0,0,0,.25)}
    #pane-food .fd-picks span{font-size:13px;opacity:.85}
    #pane-food .fd-picks strong{font-size:17px}
    #pane-food .fd-picks button{padding:9px 14px;border-radius:10px;background:rgba(255,255,255,.16);font-weight:700;font-size:13px;color:#fff}
    #pane-food .fd-empty{padding:48px 10px;text-align:center;color:var(--sub);font-size:14px;line-height:1.7}
    @media (max-width:560px){
      #pane-food .fd-card{grid-template-columns:1fr}
      #pane-food .fd-photo{aspect-ratio:16/9}
    }
  `;
  document.head.appendChild(style);

  /* ---------- 렌더 ---------- */
  function renderWhen() {
    const c = ctx(), dates = tripDates(c), box = $('#foodWhen');
    if (!box) return;
    if (!dates.length) {
      ui.date = '';
      box.innerHTML = '<div class="fd-note" style="background:var(--gray);color:var(--sub)">상단에서 여행 날짜를 선택하면 날짜별 예약 가능 시간을 볼 수 있어요.</div>';
      return;
    }
    if (!dates.includes(ui.date)) ui.date = dates[0];
    box.innerHTML = `<div class="fd-strip">${dates.map(d => {
      const dt = new Date(d + 'T00:00:00');
      return `<button class="fd-day${d === ui.date ? ' on' : ''}" type="button" data-d="${d}"><small>${DOW[dt.getDay()]}</small><b>${dt.getMonth() + 1}/${dt.getDate()}</b></button>`;
    }).join('')}</div>
      <div class="fd-meal">${['전체', '점심', '저녁'].map(m => `<button type="button" data-m="${m}" class="${ui.meal === m ? 'on' : ''}">${m === '전체' ? '식사 시간 전체' : m}</button>`).join('')}</div>`;
  }

  function filtered() {
    const kinds = sel('foodKind'), budget = sel('foodBudget')[0], prefs = sel('foodPref');
    const range = PRICE[budget];
    let list = foods.filter(f =>
      (!kinds.length || kinds.includes(f.kind)) &&
      (!range || (f.price >= range[0] && f.price <= range[1])) &&
      (!prefs.includes('한국어 메뉴') || f.koMenu) && (!prefs.includes('채식 가능') || f.vegan) &&
      (!prefs.includes('웨이팅 적은 곳') || f.waitLow));
    if (prefs.includes('예약 가능')) list = list.filter(f => slotsFor(f, ui.date, ui.meal).length);
    return list.sort((a, b) => ui.sort === 'rating' ? b.rating - a.rating : ui.sort === 'price' ? a.price - b.price : b.score - a.score);
  }

  function cardHTML(f) {
    const slots = slotsFor(f, ui.date, ui.meal);
    const dest = ctx().dest;
    const pickedKey = Object.keys(picks).find(k => picks[k].id === f.id && picks[k].date === ui.date && picks[k].dest === dest);
    const picked = pickedKey ? picks[pickedKey] : null;
    const badge = f.reservable ? (slots.length ? '<span class="fd-badge ok">예약 가능</span>' : '<span class="fd-badge">마감</span>') : '<span class="fd-badge wait">웨이팅</span>';
    const tags = [CATS[f.kind] + ' ' + f.kind, f.koMenu && '한국어 메뉴', f.vegan && '채식 가능', f.waitLow && '웨이팅 적음'].filter(Boolean);
    const slotHTML = !f.reservable ? '<div class="fd-nos">예약 없이 방문하는 매장이에요 · 현장 웨이팅</div>'
      : !slots.length ? '<div class="fd-nos">선택한 날짜에는 빈 시간이 없어요</div>'
      : `<div class="fd-slots">${slots.map(t => `<button class="fd-slot${picked && picked.slot === t ? ' on' : ''}" type="button" data-id="${f.id}" data-slot="${t}">${t}</button>`).join('')}</div>`;
    return `<article class="fd-card">
      <div class="fd-photo" aria-label="사진 준비 중">${CATS[f.kind]}${badge}<button class="fd-heart${picked ? ' on' : ''}" type="button" data-id="${f.id}" aria-label="담기" aria-pressed="${!!picked}">♥</button></div>
      <div class="fd-info">
        <div class="fd-name"><b>${esc(f.name)}</b><span class="fd-rate">★ ${f.rating.toFixed(1)} <small>(${f.reviews.toLocaleString('ko-KR')})</small></span></div>
        <div class="fd-sub">${esc(f.area)} · 1인 약 ${won(f.price)}</div>
        <div class="fd-tags">${tags.map(t => `<span class="fd-tag">${esc(t)}</span>`).join('')}</div>
        ${slotHTML}
      </div></article>`;
  }

  function renderResults() {
    const box = $('#foodResults');
    if (!box) return;
    const c = ctx();
    if (!c.dest) { box.innerHTML = '<div class="fd-empty">상단에서 여행지를 선택하면 맛집을 보여드려요.</div>'; return; }
    if (foodsDest !== c.dest) { foods = loadFoods(c.dest); foodsDest = c.dest; }
    const list = filtered(), pickList = Object.values(picks).filter(p => p.dest === c.dest);
    const people = Math.max(1, (c.guests.adult || 0) + (c.guests.child || 0));
    const sum = pickList.reduce((a, p) => a + p.price, 0);
    box.innerHTML = `
      <div class="fd-note">샘플 데이터 화면이에요. 식당·평점·예약 가능 시간은 실제 정보가 아닙니다.</div>
      <div class="fd-bar"><strong>${esc(c.dest)} 맛집 ${list.length}곳</strong>
        <div class="fd-sort">${[['rec', '추천순'], ['rating', '평점순'], ['price', '낮은 가격순']].map(([k, l]) => `<button type="button" data-s="${k}" class="${ui.sort === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      ${list.length ? `<div class="fd-list">${list.map(cardHTML).join('')}</div>`
        : '<div class="fd-empty">조건에 맞는 맛집이 없어요.<br>가격대나 식사 조건을 줄여 보세요.</div>'}
      ${pickList.length ? `<div class="fd-picks"><div><span>담은 맛집 ${pickList.length}곳 · ${people}명 기준</span><br><strong>예상 ${won(sum * people)}</strong></div><button type="button" data-clear>모두 비우기</button></div>` : ''}`;
  }

  function render() { renderWhen(); renderResults(); }

  /* ---------- 예산 연동 ---------- */
  function syncBudget() {
    try { localStorage.setItem(PICKS, JSON.stringify(picks)); } catch (_) {}
    const B = window.TripBudget, c = ctx();
    const list = Object.values(picks).filter(p => p.dest === c.dest), people = Math.max(1, (c.guests.adult || 0) + (c.guests.child || 0));
    const sum = list.reduce((a, p) => a + p.price, 0) * people;
    if (B && typeof B.set === 'function') {
      try {
        if (list.length && sum > 0) { B.set('food', Math.round(sum), 'KRW'); ownsBudget = true; }
        else if (ownsBudget && typeof B.clear === 'function') { B.clear('food'); ownsBudget = false; }
      } catch (_) { /* 예산 패널이 없어도 목록은 동작한다 */ }
    }
    document.dispatchEvent(new CustomEvent('tripfood:change', { detail: { picks: list } }));
  }

  function toggle(id, slot) {
    const f = foods.find(x => x.id === id); if (!f) return;
    const dest = ctx().dest, key = `${dest}|${ui.date}|${id}`, cur = picks[key];
    if (cur && (!slot || cur.slot === slot)) delete picks[key];
    else picks[key] = { id, dest, date: ui.date, meal: ui.meal, name: f.name, price: f.price, slot: slot || '' };
    syncBudget(); renderResults();
  }

  /* ---------- 이벤트 ---------- */
  pane.addEventListener('click', e => {
    const t = e.target;
    const day = t.closest('.fd-day'), meal = t.closest('.fd-meal button'), sort = t.closest('.fd-sort button');
    const heart = t.closest('.fd-heart'), slot = t.closest('.fd-slot');
    if (day) { ui.date = day.dataset.d; render(); return; }
    if (meal) { ui.meal = meal.dataset.m; render(); return; }
    if (sort) { ui.sort = sort.dataset.s; renderResults(); return; }
    if (heart) { toggle(heart.dataset.id); return; }
    if (slot) { toggle(slot.dataset.id, slot.dataset.slot); return; }
    if (t.closest('[data-clear]')) {
      const dest = ctx().dest;
      Object.keys(picks).forEach(k => { if (picks[k].dest === dest) delete picks[k]; });
      syncBudget(); renderResults(); return;
    }
    // 조건 칩: 공통 코드가 상태를 갱신한 뒤 목록을 다시 그린다
    if (t.closest('.opts')) setTimeout(renderResults, 0);
  });
  document.addEventListener('tripcontext:change', render);
  const tab = document.querySelector('.tab[data-t="food"]');
  if (tab) tab.addEventListener('click', () => setTimeout(render, 0));
  render();
  if (Object.keys(picks).length) syncBudget();
})();

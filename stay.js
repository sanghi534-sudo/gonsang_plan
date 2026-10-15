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
        buildings: chips('stayBuilding')
      };
    },
    summaryText() {
      const g = api.get(), parts = [g.type];
      if (st.min > 0 || st.max < PRICE_MAX) parts.push(`${won(st.min)}~${won(st.max)}${st.max >= PRICE_MAX ? '+' : ''}`);
      Object.keys(LABEL).forEach(k => { if (st[k]) parts.push(`${LABEL[k]} ${st[k]}${st[k] >= STEP_MAX ? '+' : ''}개 이상`); });
      if (g.amenities.length) parts.push(g.amenities.join(', '));
      if (g.buildings.length) parts.push(g.buildings.join(', '));
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

  drawPrice(); drawSteppers();
})();

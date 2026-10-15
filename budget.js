/* 예산 패널 (항공·숙소·관광·맛집 금액 + 원화/외화 표시 전환)
 *
 * trip-conditions.html 의 <div id="budget-root"> 안에 스스로 그려진다.
 * 각 탭은 이 파일을 건드리지 않고 아래 API 만 호출하면 된다.
 *
 *   TripBudget.set('air', 450000)          // 원화 금액 확정
 *   TripBudget.set('stay', 300, 'USD')     // 외화 금액 확정
 *   TripBudget.clear('air')                // 금액 취소 → "미정"
 *   TripBudget.get()                       // { air:{amount,cur,krw}, ... , totalKRW }
 *   TripBudget.setDisplay('JPY')           // 표시 통화 변경 ('KRW' 이면 원화)
 *   TripBudget.setContext({dest, guests})  // 상단 여행지·인원을 읽기 전용으로 전달
 *   document.addEventListener('tripbudget:change', e => e.detail)  // 변경 알림
 *
 * 카테고리 키: air | stay | tour | food
 * 환율: open.er-api.com (키 불필요, 일 단위 환율 · 참고용)
 */
(() => {
  const root = document.getElementById('budget-root');
  if (!root) return;

  const CATS = [['air', '✈', '항공'], ['stay', '🏨', '숙소'], ['tour', '📍', '관광'], ['food', '🍽', '맛집']];
  // 통화 코드: [이름, 금액 뒤에 붙는 단위]
  const CUR = {
    KRW: ['원화', '원'], USD: ['미국 달러', '달러'], JPY: ['일본 엔', '엔'], EUR: ['유로', '유로'],
    CNY: ['중국 위안', '위안'], THB: ['태국 바트', '바트'], VND: ['베트남 동', '동'], TWD: ['대만 달러', '대만달러'],
    HKD: ['홍콩 달러', '홍콩달러'], SGD: ['싱가포르 달러', '싱가포르달러'], GBP: ['영국 파운드', '파운드'],
    AUD: ['호주 달러', '호주달러'], CAD: ['캐나다 달러', '캐나다달러'], TRY: ['튀르키예 리라', '리라'], AED: ['UAE 디르함', '디르함'],
    PEN: ['페루 솔', '솔'], MXN: ['멕시코 페소', '멕시코페소'], CZK: ['체코 코루나', '코루나'],
    NZD: ['뉴질랜드 달러', '뉴질랜드달러'], ZAR: ['남아공 랜드', '랜드']
  };
  const API = 'https://open.er-api.com/v6/latest/KRW';
  const validCurrency = c => Object.prototype.hasOwnProperty.call(CUR, c);
  const LOCAL = {
    '도쿄':'JPY', '오사카':'JPY', '교토':'JPY', '후쿠오카':'JPY', '방콕':'THB', '다낭':'VND',
    '타이베이':'TWD', '싱가포르':'SGD', '홍콩':'HKD', '파리':'EUR', '런던':'GBP', '로마':'EUR',
    '프라하':'CZK', '바르셀로나':'EUR', '뉴욕':'USD', '샌프란시스코':'USD', '로스앤젤레스':'USD',
    '밴쿠버':'CAD', '시드니':'AUD', '괌':'USD', '퀸스타운':'NZD', '두바이':'AED',
    '이스탄불':'TRY', '케이프타운':'ZAR', '칸쿤':'MXN', '리마':'PEN'
  };
  const currencyFor = dest => Object.prototype.hasOwnProperty.call(LOCAL, dest) ? LOCAL[dest] : '';
  // 개인 설정만 저장한다. 팀원의 항목별 금액·선택한 여행 조건은 덮어쓰지 않는다.
  const STORE = 'gonsang-budget-planning-v1';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (_) {}
  const bounded = n => typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 1e12;
  const plan = {
    target: bounded(saved.target) ? saved.target : null,
    people: Number.isInteger(saved.people) && saved.people >= 1 && saved.people <= 99 ? saved.people : null,
    local: validCurrency(saved.local) && saved.local !== 'KRW' ? saved.local : '',
    manualCurrency: !!saved.manualCurrency,
    rates: Object.fromEntries(Object.entries(saved.rates || {}).filter(([c, r]) => validCurrency(c) && c !== 'KRW' && bounded(r)))
  };
  const context = { dest: null, people: 0 };
  let lastAdjustment = null;
  const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(plan)); } catch (_) {} };

  const items = {};            // { air: { amount, cur } }  확정된 금액만 존재
  const editing = {};          // { air: true }  입력창이 열린 카테고리
  const fx = { rates: null, updated: null, status: 'loading' };   // rates[c] = 1원 당 c 통화량
  const view = { cur: 'KRW', foreign: 'USD' };   // cur: 지금 표시 통화, foreign: 외화 모드일 때 마지막 외화

  /* ---------- 유틸 ---------- */
  const num = n => Math.round(n).toLocaleString('ko-KR');
  const trim = n => (+n).toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  const unitOf = c => CUR[c][1];
  const money = (amt, cur) => `${cur === 'KRW' ? num(amt) : trim(amt)}${unitOf(cur)}`;
  const krwPer = c => (c === 'KRW' ? 1 : plan.rates[c] || (fx.rates && fx.rates[c] > 0 ? 1 / fx.rates[c] : null)); // 1 외화 = ? 원
  const toKRW = (amt, cur) => { const r = krwPer(cur); return r == null ? null : amt * r; };
  // 금액을 target 통화로 환산 (환율이 없으면 null)
  const convert = (amt, from, to) => {
    if (from === to) return amt;
    const k = toKRW(amt, from), r = krwPer(to);
    return k == null || r == null ? null : k / r;
  };
  const parse = s => { const raw = String(s).replace(/[,\s]/g, ''); const n = raw === '' ? NaN : Number(raw); return Number.isFinite(n) && n >= 0 && n <= 1e12 ? n : null; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rateText = c => { const r = krwPer(c); return r == null ? '' : `1${unitOf(c)} = ${r >= 100 ? num(r) : trim(r)}원${plan.rates[c]?' (직접 입력)':''}`; };
  const curOptions = (sel, skipKRW) => Object.keys(CUR).filter(c => !(skipKRW && c === 'KRW'))
    .map(c => `<option value="${c}"${c === sel ? ' selected' : ''}>${c} · ${CUR[c][0]}</option>`).join('');

  /* ---------- 스타일 ---------- */
  const css = document.createElement('style');
  css.textContent = `
    .bg-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
    #budget-root h3{margin:0 0 4px;font-size:18px}
    #budget-root .hint{margin:0 0 12px;font-size:13px;color:#717171}
    .bg-toggle{display:flex;flex:none;border:1px solid #cfd3d1;border-radius:999px;background:#fff;overflow:hidden}
    .bg-toggle button{padding:6px 12px;font-size:12px;font-weight:700;color:#717171;border:0;background:none;cursor:pointer}
    .bg-toggle button.on{background:#1d735a;color:#fff}
    .bg-cursel{display:flex;justify-content:flex-end;margin:-4px 0 8px}
    .bg-cursel select{border:1px solid #cfd3d1;border-radius:10px;padding:6px 8px;font:inherit;font-size:12px;background:#fff}
    .bg-row{padding:12px 0;border-bottom:1px solid #dfe2e0}
    .bg-top{display:flex;justify-content:space-between;align-items:center;gap:8px}
    .bg-name{font-weight:700;font-size:14px}
    .bg-amt{font-weight:800;font-size:17px;color:#1d735a;text-align:right}
    .bg-amt.none{color:#9a9f9c;font-weight:600;font-size:14px}
    .bg-sub{font-size:11px;color:#8a8f8c;text-align:right;margin-top:2px}
    .bg-edit{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
    .bg-edit input,.bg-edit select{border:1px solid #cfd3d1;border-radius:10px;padding:9px 10px;font:inherit;font-size:14px;background:#fff;min-width:0}
    .bg-edit input{flex:1 1 90px}
    .bg-edit select{flex:1 1 110px}
    .bg-btn{padding:8px 12px;border-radius:10px;font-size:13px;font-weight:700;background:#1d735a;color:#fff;cursor:pointer;border:0}
    .bg-btn.ghost{background:#fff;color:#1d735a;border:1px solid #cfd3d1}
    .bg-link{font-size:12px;color:#717171;text-decoration:underline;cursor:pointer;background:none;border:0;padding:0 0 0 8px}
    .bg-total{display:flex;justify-content:space-between;align-items:baseline;padding:14px 0 4px;margin:0;font-weight:700}
    .bg-total strong{font-size:22px;color:#1d735a}
    .bg-note{font-size:12px;color:#b3541e;margin:6px 0 0}
    .bg-meta{margin-top:10px;font-size:11px;color:#8a8f8c;line-height:1.5;text-align:right}
    .bg-meta .bg-link{padding:0 0 0 6px;font-size:11px}
    #budget-root .bg-box{margin-top:16px;padding:16px;border:1px solid #dfe7e2;border-radius:16px;background:#f7fbf8;min-width:0}
    #budget-root h4{margin:0 0 10px;font-size:14px}
    #budget-root .bg-small{font-size:12px;color:#717171;line-height:1.6;margin:7px 0 0;overflow-wrap:anywhere}
    #budget-root label{font-size:12px;font-weight:700}
    #budget-root .bg-fields{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:8px}
    #budget-root .bg-fields input,#budget-root .bg-fields select{box-sizing:border-box;min-width:0;border:1px solid #cfd3d1;background:#fff;border-radius:9px;padding:9px;font:inherit;font-size:13px;max-width:100%}
    #budget-root .bg-fields input{flex:1;width:100px}
    #budget-root .bg-fields select{width:100%}
    #budget-root button:focus-visible,#budget-root input:focus-visible,#budget-root select:focus-visible{outline:3px solid #a8d7c2;outline-offset:2px}
    #budget-root .bg-status{display:flex;justify-content:space-between;gap:8px;font-size:12px;margin-top:12px}
    #budget-root .bg-track{height:8px;margin-top:8px;background:#e4e9e6;border-radius:20px;overflow:hidden}
    #budget-root .bg-track i{display:block;height:100%;background:#1d735a}
    #budget-root .bg-track.over i{background:#e36b65}
    #budget-root .bg-alert{margin-top:12px;padding:13px;border-radius:12px;background:#eaf4ee;color:#205c48;font-size:13px;line-height:1.6}
    #budget-root .bg-alert.warn{background:#fff4df;color:#805510}
    #budget-root .bg-alert.over{background:#fff0ef;color:#aa3636}
    #budget-root .bg-alert b{display:block;font-size:14px}
    #budget-root .bg-saving{margin-top:9px;padding:12px;border:1px solid #dfe7e2;border-radius:12px;background:white}
    #budget-root .bg-saving strong{display:block;margin-top:4px;color:#1d735a;font-size:15px}
    #budget-root .bg-saving .bg-btn{margin-top:9px;width:100%}
    #budget-root .bg-step{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:10px 0}
    #budget-root .bg-step button{width:32px;height:32px;border-radius:50%;border:1px solid #cfd3d1;background:#fff;color:#1d735a;font-size:18px;cursor:pointer}
    #budget-root .bg-step button:disabled{opacity:.4;cursor:default}
    #budget-root .bg-perperson{display:block;font-size:24px;color:#1d735a;margin:12px 0 4px}
    #budget-root .bg-local-amount{font-size:17px;font-weight:700;color:#496356;overflow-wrap:anywhere}
    #budget-root .bg-error{font-size:12px;color:#b33b36;min-height:0;margin:6px 0 0}
    #budget-root .bg-error:empty{display:none}
    #budget-root details{margin-top:10px;font-size:12px}
    #budget-root summary{cursor:pointer;color:#516b5c;line-height:1.6}
  `;
  document.head.appendChild(css);

  /* ---------- 렌더 ---------- */
  function rowHTML([key, icon, name]) {
    const it = items[key];
    let right = '<div class="bg-amt none">미정</div>';
    if (it) {
      const shown = convert(it.amount, it.cur, view.cur);
      let sub = '';
      if (shown == null) sub = '환율 확인 필요';
      else if (it.cur !== view.cur) {
        // 원본 금액과 환율을 작게 표시 (참고용)
        const rateCur = it.cur !== 'KRW' ? it.cur : view.cur;
        sub = `${esc(money(it.amount, it.cur))} · ${esc(rateText(rateCur))}`;
      }
      right = `<div><div class="bg-amt">${shown == null ? esc(money(it.amount, it.cur)) : (view.cur !== it.cur ? '≈ ' : '') + esc(money(shown, view.cur))}</div>` +
        (sub ? `<div class="bg-sub">${sub}</div>` : '') + '</div>';
    }
    const actions = it
      ? `<button class="bg-link" data-a="edit" data-k="${key}" type="button">수정</button><button class="bg-link" data-a="clear" data-k="${key}" type="button">삭제</button>`
      : `<button class="bg-link" data-a="edit" data-k="${key}" type="button">입력</button>`;
    const form = editing[key] ? `
      <div class="bg-edit">
        <input data-in="${key}" inputmode="decimal" placeholder="금액" value="${it ? esc(it.amount) : ''}">
        <select data-cur="${key}">${curOptions(it ? it.cur : 'KRW')}</select>
        <button class="bg-btn" data-a="ok" data-k="${key}" type="button">확정</button>
        <button class="bg-btn ghost" data-a="cancel" data-k="${key}" type="button">취소</button>
      </div>` : '';
    return `<div class="bg-row"><div class="bg-top"><span class="bg-name">${icon} ${name}${actions}</span>${right}</div>${form}</div>`;
  }

  function totals() {
    let sum = 0, missing = 0, any = false;
    CATS.forEach(([k]) => {
      const it = items[k]; if (!it) return;
      any = true;
      const v = convert(it.amount, it.cur, view.cur);
      if (v == null) missing++; else sum += v;
    });
    return { sum, missing, any };
  }

  function metaText() {
    if (fx.status === 'loading') return '환율을 불러오는 중…';
    if (fx.status === 'error') return fx.rates ? `환율 갱신 실패 · 이전 기준 ${fx.updated}` : '환율 조회 실패 · 아래에서 참고 환율을 직접 입력할 수 있어요.';
    return `환율 기준 ${fx.updated} · 일 단위 참고 환율`;
  }

  function snapshot() {
    let total = 0, entered = 0, missing = 0;
    CATS.forEach(([k]) => {
      if (!items[k]) return;
      entered++;
      const v = toKRW(items[k].amount, items[k].cur);
      if (v == null) missing++; else total += v;
    });
    return { total, entered, missing, ready: entered > 0 && missing === 0 };
  }
  const splitCount = () => plan.people || context.people || 1;

  // 실제 상품 검색이 아닌 사용자 예산 조정안. 각 안의 절감액은 독립적으로 계산한다.
  function savings(s) {
    if (!s.ready || !plan.target || s.total <= plan.target) return [];
    return [['stay', .15, '숙소 예산 15% 낮추기', '위치·객실 조건을 조정하는 계획을 세워 보세요.'],
      ['food', .20, '맛집 예산 20% 낮추기', '일부 식사를 마트·간편식으로 바꿔 보세요.'],
      ['tour', .30, '관광 예산 30% 낮추기', '유료 관광 일부를 무료 명소로 바꿔 보세요.']]
      .flatMap(([key, pct, title, hint]) => {
        const it = items[key]; if (!it || !it.amount) return [];
        const precision = ['KRW','JPY','VND'].includes(it.cur) ? 1 : 100;
        const amount = Math.floor(it.amount * (1 - pct) * precision) / precision;
        const savedKrw = toKRW(it.amount - amount, it.cur);
        return savedKrw >= 1 ? [{ key, amount, cur:it.cur, savedKrw, title, hint }] : [];
      });
  }

  function planningHTML() {
    const s = snapshot(), count = splitCount(), rate = plan.local ? krwPer(plan.local) : null;
    const usage = s.ready && plan.target ? s.total / plan.target * 100 : null;
    const over = usage != null && usage > 100;
    const options = savings(s);
    let alert = '';
    if (usage != null) {
      const headline = over ? '통장이 울고 있어요 😭' : usage >= 90 ? '통장 긴장 중 👀' : '통장도 여행 준비 완료 😎';
      const msg = over ? `목표보다 ${money(s.total - plan.target, 'KRW')} 초과했어요.` : `목표까지 ${money(plan.target - s.total, 'KRW')} 남았어요.`;
      alert = `<div class="bg-status"><span>입력한 비용 / 목표 예산</span><b>${trim(usage)}%</b></div>
        <div class="bg-track ${over?'over':''}" role="progressbar" aria-label="목표 예산 사용률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100,usage)}" aria-valuetext="${trim(usage)}%"><i style="width:${Math.min(100,usage)}%"></i></div>
        <div class="bg-alert ${over?'over':usage>=90?'warn':''}" role="status"><b>${headline}</b>${esc(msg)}</div>`;
    }
    return `<section class="bg-box" aria-label="목표 예산과 절약 제안">
      <h4>🎯 목표 예산</h4><label for="bg-target">여행 전체 인원 합계 · 원화</label>
      <div class="bg-fields"><input id="bg-target" data-draft="target" type="text" inputmode="numeric" value="${plan.target || ''}" placeholder="예: 2000000"><button type="button" class="bg-btn" data-a="target">저장</button></div>
      <p class="bg-error" id="bg-target-error" role="status"></p>
      ${plan.target?`<p class="bg-small">목표 ${money(plan.target,'KRW')} <button type="button" class="bg-link" data-a="target-clear">초기화</button></p>`:'<p class="bg-small">목표를 정하면 초과 경보와 절약 제안을 보여드려요.</p>'}
      ${s.missing?'<p class="bg-small">환율이 없는 항목이 있어 초과 여부와 N빵 계산을 보류했어요.</p>':!s.entered?'<p class="bg-small">항목별 금액을 입력하면 계산이 시작돼요.</p>':''}
      ${alert}
      ${s.entered && s.entered<CATS.length?'<p class="bg-small">미정 항목은 합계에서 제외돼요. 모든 비용 입력 전에는 실제 총액보다 적을 수 있어요.</p>':''}
      ${options.length?`<details data-saving-details><summary>💡 절약 제안 ${options.length}가지 보기</summary><p class="bg-small">입력한 예산에 비율을 적용한 제안입니다. 실제 판매가·예약 변경이 아니며, 적용하면 해당 예산만 바뀝니다.</p>${options.map(o=>`<div class="bg-saving"><b>${o.title}</b><strong>${money(o.savedKrw,'KRW')} 절약 예상</strong><p class="bg-small">${o.hint}<br>${money(items[o.key].amount,o.cur)} → ${money(o.amount,o.cur)}</p><button type="button" class="bg-btn ghost" data-a="saving" data-k="${o.key}">이 예산으로 조정</button></div>`).join('')}</details>`:over?'<p class="bg-small">항공 외 조정 가능한 금액이 없어요. 날짜·좌석 조건을 바꿔 항공편을 비교해 보세요.</p>':''}
      ${lastAdjustment?'<p class="bg-small" role="status">제안한 예산을 적용했어요. <button type="button" class="bg-link" data-a="undo">직전 조정 되돌리기</button></p>':''}
    </section>
    <section class="bg-box" aria-label="N빵 예상 정산">
      <h4>👥 N빵 예상 정산</h4>
      <p class="bg-small">${plan.people?'직접 설정한 분담 인원':context.people?'선택한 여행자 수와 연동 · 유아 포함, 반려동물 제외':'여행자 미선택 · 우선 1명 기준'}</p>
      <div class="bg-step"><span>분담 인원</span><button type="button" data-a="people-minus" aria-label="분담 인원 줄이기" ${count<=1?'disabled':''}>−</button><b>${count}명</b><button type="button" data-a="people-plus" aria-label="분담 인원 늘리기" ${count>=99?'disabled':''}>+</button></div>
      ${plan.people?'<button type="button" class="bg-link" data-a="people-auto">여행자 수에 맞추기</button>':''}
      <span class="bg-small">1인 예상 금액</span><strong class="bg-perperson">${s.ready?money(s.total/count,'KRW'):'미정'}</strong>
      <div class="bg-local-amount">${s.ready && rate?`≈ ${money(s.total/count/rate,plan.local)}`:plan.local?'환율·금액 확인 후 현지화 표시':'여행지 선택 후 현지 통화 표시'}</div>
      <div class="bg-fields"><label for="bg-local">현지 통화</label><select id="bg-local" data-local><option value="">통화 선택</option>${curOptions(plan.local,true)}</select></div>
      <p class="bg-small">${context.dest?`${esc(context.dest)} · `:''}${plan.local?`${plan.local} · ${esc(rateText(plan.local)) || '환율 확인 필요'}`:'여행지 통화를 선택하세요.'}</p>
      <button type="button" class="bg-link" data-a="local-auto">여행지 통화 자동 선택</button>
      <details data-rate-details><summary>환율 직접 입력 · 조회 실패 시에도 사용 가능</summary>
        ${plan.local?`<label for="bg-rate">1 ${plan.local} = 원화 얼마인가요?</label><div class="bg-fields"><input id="bg-rate" data-draft="rate" inputmode="decimal" placeholder="예: 370" value="${plan.rates[plan.local] || ''}"><button type="button" class="bg-btn" data-a="rate">적용</button></div><p class="bg-error" id="bg-rate-error" role="status"></p>${plan.rates[plan.local]?'<button type="button" class="bg-link" data-a="rate-clear">직접 입력 해제</button>':''}`:'<p class="bg-small">현지 통화를 먼저 선택하세요.</p>'}
      </details>
      <p class="bg-small">전체 비용을 균등 분담한 예상액이에요. 원 단위 반올림으로 합계에 차이가 생길 수 있으며 실제 송금 정산이 아닙니다. 현지화는 수수료를 제외한 참고 환산액이에요.</p>
    </section>`;
  }

  function render(resetDraft = '') {
    const t = totals();
    const drafts = [...root.querySelectorAll('[data-in], [data-cur], [data-draft]')].filter(el => !el.dataset.draft || (el.dataset.draft !== resetDraft && !(el.dataset.draft==='rate' && resetDraft==='local'))).map(el => ({ selector: el.dataset.in ? `[data-in="${el.dataset.in}"]` : el.dataset.cur ? `[data-cur="${el.dataset.cur}"]` : `[data-draft="${el.dataset.draft}"]`, value:el.value }));
    const rateOpen = !!root.querySelector('[data-rate-details][open]');
    const savingsOpen = !!root.querySelector('[data-saving-details][open]');
    const a = document.activeElement;
    const keep = a && a.dataset && a.dataset.in ? { k: a.dataset.in, s: a.selectionStart } : null;
    const fxMode = view.cur !== 'KRW';
    root.innerHTML = `
      <div class="bg-head">
        <div><h3>예산</h3></div>
        <div class="bg-toggle" role="group" aria-label="표시 통화">
          <button data-a="mode" data-m="KRW" class="${fxMode ? '' : 'on'}" type="button">원화</button>
          <button data-a="mode" data-m="FX" class="${fxMode ? 'on' : ''}" type="button">외화</button>
        </div>
      </div>
      <p class="hint">각 탭에서 금액이 확정되면 여기에 표시돼요.</p>
      ${fxMode ? `<div class="bg-cursel"><select data-cursel aria-label="표시할 외화">${curOptions(view.cur, true)}</select></div>` : ''}
      ${CATS.map(rowHTML).join('')}
      <div class="bg-total"><span>총 예상액</span><strong>${t.any ? (t.missing?'환율 확인 필요':money(t.sum, view.cur)) : '미정'}</strong></div>
      ${t.missing ? '<p class="bg-note">환율이 없는 항목이 있어 총액을 확정할 수 없어요.</p>' : ''}
      <div class="bg-meta">${esc(metaText())}<button class="bg-link" data-a="refresh" type="button">새로고침</button></div>
      ${planningHTML()}`;
    drafts.forEach(d => { const el = root.querySelector(d.selector); if (el) el.value = d.value; });
    if (rateOpen) root.querySelector('[data-rate-details]').open = true;
    if (savingsOpen && root.querySelector('[data-saving-details]')) root.querySelector('[data-saving-details]').open = true;
    if (keep) {
      const el = root.querySelector(`[data-in="${keep.k}"]`);
      if (el) { el.focus(); try { el.setSelectionRange(keep.s, keep.s); } catch (_) {} }
    }
  }

  /* ---------- 공개 API ---------- */
  const notify = () => document.dispatchEvent(new CustomEvent('tripbudget:change', { detail: api.get() }));
  const valid = k => CATS.some(c => c[0] === k);
  const api = {
    set(key, amount, cur = 'KRW') {
      const a = parse(amount);
      if (!valid(key) || a == null || !validCurrency(cur)) return false;
      lastAdjustment = null;
      items[key] = { amount: a, cur }; delete editing[key]; render(); notify(); return true;
    },
    clear(key) { lastAdjustment = null; delete items[key]; delete editing[key]; render(); notify(); },
    setContext({ dest = '', guests = {} } = {}) {
      const people = ['adult','child','infant'].reduce((sum, k) => sum + (Number.isInteger(guests[k]) && guests[k] >= 0 ? guests[k] : 0), 0);
      if (dest === context.dest && people === context.people) return;
      context.dest = String(dest); context.people = Math.min(99, people);
      if (!plan.manualCurrency) plan.local = currencyFor(context.dest);
      persist(); render('local');
    },
    setDisplay(cur) {
      if (!validCurrency(cur)) return false;
      view.cur = cur; if (cur !== 'KRW') view.foreign = cur;
      render(); notify(); return true;
    },
    get() {
      const out = {}; let totalKRW = 0;
      CATS.forEach(([k]) => {
        const it = items[k];
        if (it) { const krw = toKRW(it.amount, it.cur); out[k] = { amount: it.amount, cur: it.cur, krw }; if (krw != null) totalKRW += krw; }
        else out[k] = null;
      });
      out.totalKRW = Math.round(totalKRW);
      // 기존 카테고리·totalKRW 계약 유지. 새 설정은 planning 아래로만 확장한다.
      const s = snapshot(), count = splitCount(), r = plan.local ? krwPer(plan.local) : null;
      out.planning = { targetKRW:plan.target, splitPeople:count, localCurrency:plan.local || null,
        perPersonKRW:s.ready ? Math.round(s.total/count) : null,
        perPersonLocal:s.ready && r ? s.total/count/r : null,
        exchangeRateKRW:r, manualRate:!!plan.rates[plan.local],
        overKRW:s.ready && plan.target ? Math.max(0,Math.round(s.total-plan.target)) : null,
        incomplete:!s.ready || s.entered<CATS.length };
      return out;
    },
    summaryText() {
      const parts = CATS.filter(([k]) => items[k]).map(([k, , n]) => `${n} ${money(items[k].amount, items[k].cur)}`);
      const t = totals();
      return parts.length ? `${parts.join(' · ')} (합계 ${t.missing?'환율 확인 필요':money(t.sum, view.cur)})` : '미정';
    }
  };
  window.TripBudget = api;

  /* ---------- 이벤트 ---------- */
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    e.stopPropagation();                       // 다시 그리면 대상이 사라져 상단 패널이 닫히는 것을 방지
    const k = b.dataset.k, a = b.dataset.a;
    if (a === 'edit') { editing[k] = true; render(); const i = root.querySelector(`[data-in="${k}"]`); i && i.focus(); }
    else if (a === 'cancel') { delete editing[k]; render(); }
    else if (a === 'clear') api.clear(k);
    else if (a === 'ok') {
      const amt = root.querySelector(`[data-in="${k}"]`).value;
      const cur = root.querySelector(`[data-cur="${k}"]`).value;
      if (!api.set(k, amt, cur)) { const i = root.querySelector(`[data-in="${k}"]`); i.style.borderColor = '#d33'; i.focus(); }
    }
    else if (a === 'mode') api.setDisplay(b.dataset.m === 'KRW' ? 'KRW' : view.foreign);
    else if (a === 'refresh') loadRates();
    else if (a === 'target') {
      const input = root.querySelector('#bg-target'), amount = parse(input.value);
      if (amount == null || amount <= 0) { root.querySelector('#bg-target-error').textContent = '목표 예산은 0보다 큰 숫자로 입력해 주세요 (최대 1조 원).'; input.setAttribute('aria-invalid','true'); return; }
      plan.target=amount; persist(); render('target'); notify();
    }
    else if (a === 'target-clear') { plan.target=null; persist(); render('target'); notify(); }
    else if (a === 'people-minus' || a === 'people-plus') {
      plan.people=Math.max(1,Math.min(99,splitCount()+(a==='people-plus'?1:-1))); persist(); render(); notify();
    }
    else if (a === 'people-auto') { plan.people=null; persist(); render(); notify(); }
    else if (a === 'local-auto') { plan.manualCurrency=false; plan.local=currencyFor(context.dest); persist(); render('local'); notify(); }
    else if (a === 'rate') {
      const input=root.querySelector('#bg-rate'), amount=parse(input.value);
      if (amount == null || amount<=0) { root.querySelector('#bg-rate-error').textContent='0보다 큰 참고 환율을 입력해 주세요.'; input.setAttribute('aria-invalid','true'); return; }
      plan.rates[plan.local]=amount; persist(); render('rate'); notify();
    }
    else if (a === 'rate-clear') { delete plan.rates[plan.local]; persist(); render('rate'); notify(); }
    else if (a === 'saving') {
      const option=savings(snapshot()).find(o=>o.key===k); if(!option) return;
      const previous={...items[k]};
      api.set(k,option.amount,option.cur);
      lastAdjustment={key:k,previous}; render();
    }
    else if (a === 'undo' && lastAdjustment) {
      const {key,previous}=lastAdjustment;
      api.set(key,previous.amount,previous.cur);
    }
  });
  root.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.dataset.in) {
      e.preventDefault();
      root.querySelector(`[data-a="ok"][data-k="${e.target.dataset.in}"]`).click();
    }
    else if (e.key==='Enter' && e.target.dataset.draft) {
      e.preventDefault(); root.querySelector(`[data-a="${e.target.dataset.draft}"]`).click();
    }
  });
  root.addEventListener('change', e => {
    if (e.target.hasAttribute('data-cursel')) api.setDisplay(e.target.value);
    if (e.target.hasAttribute('data-local')) {
      plan.local=e.target.value; plan.manualCurrency=!!plan.local; persist(); render('local'); notify();
    }
  });

  /* ---------- 환율 API ---------- */
  async function loadRates() {
    fx.status = 'loading'; render();
    try {
      const res = await fetch(API, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (data.result !== 'success' || !data.rates) throw new Error('bad payload');
      fx.rates = data.rates;
      fx.updated = new Date((data.time_last_update_unix || Date.now() / 1000) * 1000)
        .toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
      fx.status = 'ok';
    } catch (err) {
      fx.status = 'error';
    }
    render(); notify();
  }

  render();
  loadRates();
})();

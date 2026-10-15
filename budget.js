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
    AUD: ['호주 달러', '호주달러'], CAD: ['캐나다 달러', '캐나다달러'], TRY: ['튀르키예 리라', '리라'], AED: ['UAE 디르함', '디르함']
  };
  const API = 'https://open.er-api.com/v6/latest/KRW';

  const items = {};            // { air: { amount, cur } }  확정된 금액만 존재
  const editing = {};          // { air: true }  입력창이 열린 카테고리
  const fx = { rates: null, updated: null, status: 'loading' };   // rates[c] = 1원 당 c 통화량
  const view = { cur: 'KRW', foreign: 'USD' };   // cur: 지금 표시 통화, foreign: 외화 모드일 때 마지막 외화

  /* ---------- 유틸 ---------- */
  const num = n => Math.round(n).toLocaleString('ko-KR');
  const trim = n => (+n).toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  const unitOf = c => CUR[c][1];
  const money = (amt, cur) => `${cur === 'KRW' ? num(amt) : trim(amt)}${unitOf(cur)}`;
  const krwPer = c => (c === 'KRW' ? 1 : fx.rates && fx.rates[c] ? 1 / fx.rates[c] : null);   // 1 c 통화 = ? 원
  const toKRW = (amt, cur) => { const r = krwPer(cur); return r == null ? null : amt * r; };
  // 금액을 target 통화로 환산 (환율이 없으면 null)
  const convert = (amt, from, to) => {
    if (from === to) return amt;
    const k = toKRW(amt, from), r = krwPer(to);
    return k == null || r == null ? null : k / r;
  };
  const parse = s => { const n = parseFloat(String(s).replace(/[,\s]/g, '')); return Number.isFinite(n) && n >= 0 ? n : null; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rateText = c => { const r = krwPer(c); return r == null ? '' : `1${unitOf(c)} = ${r >= 100 ? num(r) : trim(r)}원`; };
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
    if (fx.status === 'error') return '환율을 불러오지 못했어요. 외화 환산은 표시되지 않습니다.';
    return `환율 기준 ${fx.updated} · 일 단위 참고 환율`;
  }

  function render() {
    const t = totals();
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
      <div class="bg-total"><span>총 예산</span><strong>${t.any ? money(t.sum, view.cur) : '미정'}</strong></div>
      ${t.missing ? '<p class="bg-note">환율을 불러오지 못한 항목은 총액에서 제외됐어요.</p>' : ''}
      <div class="bg-meta">${esc(metaText())}<button class="bg-link" data-a="refresh" type="button">새로고침</button></div>`;
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
      if (!valid(key) || a == null || !CUR[cur]) return false;
      items[key] = { amount: a, cur }; delete editing[key]; render(); notify(); return true;
    },
    clear(key) { delete items[key]; delete editing[key]; render(); notify(); },
    setDisplay(cur) {
      if (!CUR[cur]) return false;
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
      return out;
    },
    summaryText() {
      const parts = CATS.filter(([k]) => items[k]).map(([k, , n]) => `${n} ${money(items[k].amount, items[k].cur)}`);
      const t = totals();
      return parts.length ? `${parts.join(' · ')} (합계 ${money(t.sum, view.cur)})` : '미정';
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
  });
  root.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.dataset.in) {
      e.preventDefault();
      root.querySelector(`[data-a="ok"][data-k="${e.target.dataset.in}"]`).click();
    }
  });
  root.addEventListener('change', e => {
    if (e.target.hasAttribute('data-cursel')) api.setDisplay(e.target.value);
  });

  /* ---------- 환율 API ---------- */
  async function loadRates() {
    fx.status = 'loading'; render();
    try {
      const res = await fetch(API, { cache: 'no-store' });
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

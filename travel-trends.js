/* 현재 관광 탭의 읽기 전용 검색 관심도 패널.
 * NAVER 인증/호출은 갱신 스크립트에서만 수행한다. 예산·항공·숙소 상태를 쓰지 않는다.
 */
(() => {
  const root = document.getElementById('travel-trends-root');
  if (!root) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const style = document.createElement('style');
  style.textContent = `
    #travel-trends-root{margin-top:24px;padding-top:22px;border-top:1px solid #dfe7e2}
    #travel-trends-root h4{margin:10px 0;font-size:20px}
    #travel-trends-root .nt-chip{display:inline-block;border-radius:20px;background:#eaf4ee;color:#1d735a;padding:5px 9px;font-size:11px;font-weight:800}
    #travel-trends-root p,#travel-trends-root details{font-size:12px;line-height:1.7;color:#717171}
    #travel-trends-root .nt-empty{padding:20px;border:1px dashed #bfd1c6;border-radius:14px;background:#f7fbf8;font-size:14px;line-height:1.8}
    #travel-trends-root article{padding:16px 0;border-bottom:1px solid #e5e9e6}
    #travel-trends-root .nt-top{display:flex;justify-content:space-between;align-items:baseline;gap:14px;font-size:14px}
    #travel-trends-root .nt-score{white-space:nowrap;color:#1d735a;font-weight:800}
    #travel-trends-root .nt-track{margin-top:10px;height:6px;background:#e8efea;border-radius:6px;overflow:hidden}
    #travel-trends-root .nt-track i{display:block;height:100%;background:#42967a}
    #travel-trends-root .nt-up{color:#bd5146}#travel-trends-root .nt-down{color:#4e78b3}
    #travel-trends-root summary{cursor:pointer;margin-top:14px}
    @media(max-width:480px){#travel-trends-root .nt-top{flex-wrap:wrap;gap:6px}}
  `;
  document.head.appendChild(style);
  function render() {
    const city = window.TripContext?.().dest?.trim() || '';
    const snapshot = window.GonsangSearchTrends;
    const rows = snapshot?.schemaVersion === 1 && Object.hasOwn(snapshot.cities || {}, city) ? snapshot.cities[city] : null;
    const data = Array.isArray(rows) ? rows.filter(r => r && typeof r.name === 'string') : null;
    const head = `<span class="nt-chip">NAVER · 검색 관심도</span><h4>${city ? esc(city)+' 검색 트렌드' : '여행지 검색 트렌드'}</h4>`;
    if (!city) { root.innerHTML=head+'<div class="nt-empty">상단에서 여행지를 선택하면 해당 도시의 명소·쇼핑 관련 검색 관심도를 보여드려요.</div>'; return; }
    if (!data) { root.innerHTML=head+'<div class="nt-empty">아직 이 도시의 실제 검색 추이를 조회하지 않았어요.<br>예시 점수 대신 데이터를 준비 중이에요.</div>'; return; }
    const comparable = r => r.available && Number.isFinite(r.score) && r.score >= 0 && r.score <= 100 && Number.isFinite(r.deltaPoints);
    root.innerHTML = head+`<p>최근 ${esc(snapshot.current?.start)} ~ ${esc(snapshot.current?.end)}<br>비교 ${esc(snapshot.previous?.start)} ~ ${esc(snapshot.previous?.end)} · 수집 ${esc(snapshot.fetchedAt?.slice(0,10))}</p>`+
      [...data].sort((a,b)=>(comparable(b)?b.score:-1)-(comparable(a)?a.score:-1)).map(r=>{
        if(!comparable(r))return `<article><b>${esc(r.name)}</b><p>검색 데이터 부족 · 점수와 변화를 표시하지 않습니다.</p></article>`;
        const delta=r.deltaPoints, text=delta>0?`▲ ${delta}p`:delta<0?`▼ ${-delta}p`:'변화 없음';
        return `<article><div class="nt-top"><b>${esc(r.name)}</b><span class="nt-score">${r.score} / 100</span></div><div class="nt-track" aria-hidden="true"><i style="width:${r.score}%"></i></div><p><span class="${delta>0?'nt-up':delta<0?'nt-down':''}">${text}</span> · 전주 대비 점수 차이</p></article>`;
      }).join('')+
      '<details><summary>검색 관심도는 어떻게 계산하나요?</summary>네이버 상대 검색 추이를 최근 7일과 직전 7일로 나눠 계산합니다. 같은 도시의 후보·두 기간에서 가장 높은 주평균을 100으로 삼습니다. 요청을 나눌 때는 공통 검색어로 척도를 보정합니다. 절대 검색 횟수나 SNS 언급량이 아니며 도시끼리 점수를 비교할 수 없습니다. 후보와 검색어는 수동 선정했고, 누락 데이터는 0으로 추정하지 않습니다.</details>';
  }
  document.addEventListener('tripcontext:change', render);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, {once:true});
  else render();
})();

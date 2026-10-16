/* 항공 선택 → 예산 어댑터. 항공 데모/팀원 예산 모듈의 내부 상태는 직접 변경하지 않는다. */
(() => {
  let automatic = null;
  const notice = text => { const el=document.getElementById('flight-budget-status');if(el)el.textContent=text; };
  function matches(q) {
    const c=window.TripContext?.(); if(!c || !q)return false;
    const f=c.flight || {};
    return q.city===c.dest && q.start===c.start && (q.type!=='왕복'||q.end===c.end)
      && q.home===f.home && q.type===f.type && q.reverse===f.reverse && q.cabin===f.cabin
      && ['adult','child','infant'].every(k=>(q.guests?.[k]||0)===(c.guests?.[k]||0));
  }
  document.addEventListener('tripflight:select',event=>{
    const selection=event.detail, amount=selection?.amountKrw;
    if(selection?.version!==1 || selection.currency!=='KRW' || !Number.isFinite(amount) || amount<=0 || amount>1e12)return;
    if(!matches(selection.query)){notice('여행 조건이 바뀌었어요. 현재 조건으로 다시 조회한 뒤 항공편을 선택해 주세요.');return;}
    if(!window.TripBudget?.set('air',amount,'KRW')){notice('항공 예산을 반영하지 못했어요. 예산 패널에서 직접 입력해 주세요.');return;}
    automatic={amount,query:selection.query};
    const total=amount.toLocaleString('ko-KR');
    notice(`✓ 선택한 항공편의 전체 여행자 금액 ${total}원을 항공 예산에 반영했어요. 모의 운임이며 예약·결제는 진행되지 않습니다.`);
    const banner=document.getElementById('fd-selection');
    if(banner){const text=document.createElement('p');text.className='fd-sub';text.textContent=`항공 예산 반영 완료 · 전체 여행자 ${total}원`;banner.append(text);}
  });
  document.addEventListener('tripcontext:change',()=>{
    if(!automatic || matches(automatic.query))return;
    const current=window.TripBudget?.get().air;
    // 사용자가 금액/통화를 직접 바꾼 예산은 지우지 않는다.
    if(current?.cur==='KRW' && current.amount===automatic.amount){window.TripBudget.clear('air');notice('여행 조건이 바뀌어 이전 항공편의 자동 예산을 해제했어요. 다시 조회하고 선택해 주세요.');}
    automatic=null;
  });
})();

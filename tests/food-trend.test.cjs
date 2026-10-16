// Synthetic fixtures validate the UI contract. They are never production trend data.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('trip-conditions.html','utf8');
const code=html.match(/<script id="food-trend-ui">([\s\S]*?)<\/script>/)[1];
const fixture={generatedAt:'2026-10-16',period:{start:'2026-07-23',end:'2026-10-15'},method:'테스트 전용 가상 점수 · 실제 수집 데이터 아님',dryRun:true,cities:{'후쿠오카':[
  {rank:1,name:'시연 라멘 A',area:'나카스',kind:'면·국물',budget:'1~3만원',prefs:['한국어 메뉴'],chain:true,score:95,trendPct:12.6,blogTotal:2437,note:'테스트 전용 가상 가게'},
  {rank:2,name:'시연 해산물 B',area:'텐진',kind:'해산물',budget:'1만원 이하',prefs:['예약 가능'],chain:false,score:90,trendPct:25,blogTotal:100,hiddenGem:true,lat:33.59,lng:130.4},
  {rank:3,name:'시연 카페 C',area:'텐진',kind:'카페·디저트',budget:'',prefs:['웨이팅 적은 곳','채식 가능'],score:85,trendPct:-4.6,blogTotal:200},
  {rank:4,name:'시연 구이 D',area:'나카스',kind:'고기·구이',budget:'3~5만원',prefs:['예약 가능'],chain:true,score:80,trendPct:0,blogTotal:500},
  {rank:5,name:'시연 국수 E',area:'텐진',kind:'면·국물',budget:'1만원 이하',prefs:['웨이팅 적은 곳'],score:75,trendPct:2,blogTotal:300},
  {rank:6,name:'시연 간식 F',area:'텐진',kind:'길거리 음식',budget:'1만원 이하',prefs:[],score:70,trendPct:20,blogTotal:100},
  {rank:7,name:'시연 식당 G',area:'텐진',kind:'현지 음식',budget:'1~3만원',prefs:[],score:65,trendPct:0,blogTotal:50},
  {rank:8,name:'시연 미분류 H',area:'하카타',kind:'미등록 종류',budget:'미등록 예산',prefs:[],score:60,trendPct:0,blogTotal:5}
]}};
function harness(data=fixture,storage=new Map(),blockStorage=false){
 const events=new Map(),root={hidden:true,innerHTML:'',addEventListener(k,f){events.set('root:'+k,f);}},state={dest:'',food:{kind:['현지 음식'],budget:[],pref:[]}},trend={mode:'young'};
 const document={getElementById:id=>id==='food-root'?root:null,querySelector:()=>null,addEventListener(k,f){const a=events.get(k)||[];a.push(f);events.set(k,a);},dispatchEvent(e){for(const f of events.get(e.type)||[])f(e);}};
 const localStorage={getItem(k){if(blockStorage)throw Error('storage blocked');return storage.get(k)||null;},setItem(k,v){if(blockStorage)throw Error('storage blocked');storage.set(k,v);}};
 const sandbox={window:{FOOD_TREND_DATA:data,TripContext:()=>state,TripTrend:{get:()=>trend}},document,localStorage,CustomEvent:class{constructor(type,o){this.type=type;this.detail=o?.detail;}},fetch(){throw Error('Network is disabled');},console};
 vm.runInNewContext(code,sandbox,{timeout:1000});
 const emit=(type)=>document.dispatchEvent({type});
 const click=(attr,value)=>events.get('root:click')?.({target:{closest:()=>({dataset:{foodCity:attr==='data-food-city'?value:undefined,foodPick:attr==='data-food-pick'?value:undefined,foodAreaFilter:attr==='data-food-area-filter'?value:undefined},hasAttribute:k=>k===attr})}});
 const rows=()=>[...root.innerHTML.matchAll(/<article class="ft-card[^>]*data-food-name="([^"]+)"[^>]*data-food-area="([^"]+)"[^>]*data-food-kind="([^"]*)"[^>]*data-food-budget="([^"]*)"[^>]*data-food-score="([^"]*)"/g)].map(m=>({name:m[1],area:m[2],kind:m[3],budget:m[4],score:Number(m[5])}));
 return {root,state,trend,events,document,emit,click,rows,api:sandbox.window.FoodTrend};
}
function run(){
 const results=[],test=(n,name,f)=>{try{f();results.push({n,name,status:'PASS'});}catch(e){results.push({n,name,status:'FAIL',error:e.message});}};
 const h=harness();
 test(1,'여행지 미선택: 안내와 도시 버튼, 예외 없음',()=>{assert.match(h.root.innerHTML,/상단에서 여행지를/);assert.match(h.root.innerHTML,/data-food-city="후쿠오카"/);});
 h.document.addEventListener('triptrend:destination',e=>{h.state.dest=e.detail.city;h.emit('tripcontext:change');});
 test(2,'도시 버튼: 목적지 변경 이벤트와 목록',()=>{h.click('data-food-city','후쿠오카');assert.equal(h.state.dest,'후쿠오카');assert.equal(h.rows().length,8);});
 test(3,'점수 내림차순과 블로그 수·추이·배지',()=>{assert.deepEqual(h.rows().map(x=>x.score),[95,90,85,80,75,70,65,60]);assert.match(h.root.innerHTML,/2,437건/);assert.match(h.root.innerHTML,/▲13%/);assert.match(h.root.innerHTML,/▼5%/);assert.match(h.root.innerHTML,/숨은 맛집/);});
 test(4,'면·국물 필터',()=>{h.state.food.kind=['면·국물'];h.emit('tripcontext:change');assert.equal(h.rows().length,2);assert(h.rows().every(p=>p.kind==='면·국물'));});
 test(5,'1만원 이하 및 예산 빈 값',()=>{h.state.food.kind=['현지 음식'];h.state.food.budget=['1만원 이하'];h.emit('tripcontext:change');assert.equal(h.rows().length,4);assert(h.rows().every(p=>!p.budget||p.budget==='1만원 이하'));});
 test(6,'웨이팅 적은 곳 또는 hiddenGem',()=>{h.state.food.pref=['웨이팅 적은 곳'];h.emit('tripcontext:change');assert.deepEqual(h.rows().map(x=>x.name),['시연 해산물 B','시연 카페 C','시연 국수 E']);});
 test(7,'결과 없음과 독립 제외 사유 수',()=>{h.state.food.kind=['고기·구이'];h.state.food.pref=['채식 가능','한국어 메뉴'];h.emit('tripcontext:change');assert.equal(h.rows().length,0);assert.match(h.root.innerHTML,/예산 때문에 4곳 제외/);assert.match(h.root.innerHTML,/음식 종류 때문에 7곳 제외/);assert.match(h.root.innerHTML,/식사 조건 때문에 8곳 제외/);assert.match(h.root.innerHTML,/조건 완화하기/);});
 test(8,'텐진 지역 필터와 5곳 개수',()=>{h.state.food={kind:[],budget:[],pref:[]};h.emit('tripcontext:change');h.click('data-food-area-filter','텐진');assert.equal(h.rows().length,5);assert(h.rows().every(p=>p.area==='텐진'));assert.match(h.root.innerHTML,/텐진 5/);});
 test(9,'지역별 최대 3곳',()=>{h.click('data-food-area-filter','');h.events.get('root:change')({target:{matches:()=>true,checked:true}});assert.equal(h.rows().filter(p=>p.area==='텐진').length,3);h.events.get('root:change')({target:{matches:()=>true,checked:false}});});
 test(10,'모드 이벤트 즉시 반영: 여유 배지와 체인 예외',()=>{h.trend.mode='old';h.emit('triptrend:change');assert.match(h.root.innerHTML,/줄 덜 서고 편하게/);assert.match(h.root.innerHTML,/🪑 여유롭게/);assert.equal(h.rows()[0].name,'시연 해산물 B');assert.equal(h.rows().at(-1).name,'시연 구이 D');assert(h.rows().findIndex(p=>p.name==='시연 라멘 A')<h.rows().length-1);});
 test(11,'담기 저장·재실행·현재 도시 요약과 좌표',()=>{const storage=new Map(),a=harness(fixture,storage);a.state.dest='후쿠오카';a.emit('tripcontext:change');a.click('data-food-pick','후쿠오카|시연 해산물 B');const b=harness(fixture,storage);b.state.dest='후쿠오카';b.emit('tripcontext:change');assert.match(b.root.innerHTML,/담음 ✓/);assert.equal(b.api.summaryText(),' · 담은 맛집 1곳');assert.equal(b.api.get().places[0].lat,33.59);});
 test(12,'dryRun 시연 표시',()=>assert.match(h.root.innerHTML,/DEMO · 시연용 예시 값/));
 test(13,'데이터 없음: 블록만 숨김',()=>{const a=harness(null);assert.equal(a.root.hidden,true);assert.equal(a.api,undefined);});
 results.push({n:14,name:'375px 가로 넘침',status:'BROWSER_REQUIRED'});
 test(15,'budget/stay/fetch 없이 모듈 동작',()=>{const a=harness();a.state.dest='후쿠오카';a.emit('tripcontext:change');assert.equal(a.rows().length,8);assert(a.api);});
 test(16,'알 수 없는 종류·예산: 전체에는 포함, 필터 시 제외',()=>{const a=harness();a.state.dest='후쿠오카';a.emit('tripcontext:change');assert(a.rows().some(p=>p.name==='시연 미분류 H'));a.state.food={kind:['면·국물'],budget:['5만원 이상'],pref:[]};a.emit('tripcontext:change');assert(a.rows().every(p=>p.kind==='면·국물'));assert(!a.rows().some(p=>p.name==='시연 미분류 H'));});
 test('extra','저장 차단·잘못된 저장 값·출력 이스케이프',()=>{const a=harness(fixture,new Map(),true);a.state.dest='후쿠오카';a.emit('tripcontext:change');a.click('data-food-pick','후쿠오카|시연 라멘 A');assert.match(a.root.innerHTML,/저장이 제한/);const bad=JSON.parse(JSON.stringify(fixture));bad.cities['후쿠오카'][0].name='<img src=x onerror=alert(1)>';const b=harness(bad,new Map([['gonsang-food-picks-v1','{bad']]));b.state.dest='후쿠오카';b.emit('tripcontext:change');assert.match(b.root.innerHTML,/&lt;img/);assert(!b.root.innerHTML.includes('<img'));});
 console.log(JSON.stringify(results,null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
 return results;
}
if(require.main===module)run();
module.exports={fixture,harness};

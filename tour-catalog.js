/* 수동 선정한 도시별 대표 장소. 순번은 편집 추천 순서이며 실시간 인기 순위가 아니다.
 * [한국어 이름 | 영문 Wikipedia 문서명 | 분류]. 사진은 무료 Commons 자료만 별도로 조회한다.
 * 주변 여행지는 해당 도시에서 함께 둘러볼 수 있는 후보이며 이동 경로는 지도에서 확인한다.
 */
(() => {
  const raw = {
    '도쿄': `시부야 스카이|Shibuya Scramble Square|전망;센소지|Sensō-ji|역사;도쿄 타워|Tokyo Tower|전망;도쿄 스카이트리|Tokyo Skytree|전망;메이지 신궁|Meiji Shrine|역사;신주쿠 교엔|Shinjuku Gyo-en|자연;우에노 공원|Ueno Park|자연;도쿄 국립박물관|Tokyo National Museum|박물관;긴자|Ginza|쇼핑;오다이바|Odaiba|산책`,
    '오사카': `도톤보리|Dōtonbori|명소;오사카성|Osaka Castle|역사;유니버설 스튜디오 재팬|Universal Studios Japan|테마파크;우메다 스카이 빌딩|Umeda Sky Building|전망;가이유칸|Osaka Aquarium Kaiyukan|체험;신세카이|Shinsekai|산책;구로몬 시장|Kuromon Ichiba Market|쇼핑;스미요시 타이샤|Sumiyoshi-taisha|역사;나카노시마 공원|Nakanoshima Park|자연;시텐노지|Shitennō-ji|역사`,
    '교토': `기요미즈데라|Kiyomizu-dera|역사;후시미 이나리|Fushimi Inari-taisha|역사;금각사|Kinkaku-ji|역사;아라시야마|Arashiyama|자연;기온|Gion|산책;니조성|Nijō Castle|역사;니시키 시장|Nishiki Market|쇼핑;철학의 길|Philosopher's Walk|산책;은각사|Ginkaku-ji|역사;교토 국립박물관|Kyoto National Museum|박물관`,
    '후쿠오카': `오호리 공원|Ōhori Park|자연;후쿠오카 타워|Fukuoka Tower|전망;다자이후 텐만구|Dazaifu Tenman-gū|역사;커낼시티 하카타|Canal City Hakata|쇼핑;구시다 신사|Kushida Shrine|역사;우미노나카미치|Umi no Nakamichi|자연;후쿠오카성 유적|Fukuoka Castle|역사;나카스|Nakasu|산책;후쿠오카 미술관|Fukuoka Art Museum|박물관;노코노시마|Nokonoshima|자연`,
    '방콕': `왓 아룬|Wat Arun|역사;왕궁|Grand Palace|역사;왓 포|Wat Pho|역사;아이콘시암|Iconsiam|쇼핑;짜뚜짝 주말시장|Chatuchak Weekend Market|쇼핑;룸피니 공원|Lumphini Park|자연;짐 톰슨의 집|Jim Thompson House|박물관;에라완 사원|Erawan Shrine|역사;방콕 예술문화센터|Bangkok Art and Culture Centre|박물관;아시아티크|Asiatique|쇼핑`,
    '다낭': `미케 해변|Mỹ Khê Beach|자연;바나힐|Bà Nà Hills|전망;골든브리지|Golden Bridge (Vietnam)|명소;오행산|Marble Mountains (Vietnam)|자연;용다리|Dragon Bridge (Da Nang)|명소;참 조각 박물관|Museum of Cham Sculpture|박물관;선짜반도|Sơn Trà Mountain|자연;호이안 구시가지|Hội An|역사;미선 유적|Mỹ Sơn|역사;하이반 고개|Hải Vân Pass|전망`,
    '타이베이': `타이베이 101|Taipei 101|전망;국립고궁박물원|National Palace Museum|박물관;중정기념당|Chiang Kai-shek Memorial Hall|역사;용산사|Lungshan Temple|역사;시먼딩|Ximending|쇼핑;스린 야시장|Shilin Night Market|쇼핑;베이터우 온천|Beitou District|체험;샹산|Elephant Mountain (Taipei)|자연;다안삼림공원|Daan Forest Park|자연;지우펀|Jiufen|산책`,
    '싱가포르': `가든스 바이 더 베이|Gardens by the Bay|자연;마리나 베이 샌즈|Marina Bay Sands|전망;머라이언 공원|Merlion Park|명소;센토사|Sentosa|체험;싱가포르 식물원|Singapore Botanic Gardens|자연;싱가포르 동물원|Singapore Zoo|체험;아트사이언스 뮤지엄|ArtScience Museum|박물관;차이나타운|Chinatown, Singapore|산책;리틀 인디아|Little India, Singapore|산책;오차드 로드|Orchard Road|쇼핑`,
    '홍콩': `빅토리아 피크|Victoria Peak|전망;스타 페리|Star Ferry|체험;홍콩 디즈니랜드|Hong Kong Disneyland|테마파크;천단대불|Tian Tan Buddha|역사;응옹핑 360|Ngong Ping 360|전망;스타의 거리|Avenue of Stars, Hong Kong|산책;홍콩 역사박물관|Hong Kong Museum of History|박물관;템플 스트리트|Temple Street, Hong Kong|쇼핑;난리안 가든|Nan Lian Garden|자연;오션 파크|Ocean Park Hong Kong|테마파크`,
    '파리': `에펠탑|Eiffel Tower|전망;루브르 박물관|Louvre|박물관;오르세 미술관|Musée d'Orsay|박물관;몽마르트르|Montmartre|산책;개선문|Arc de Triomphe|역사;뤽상부르 공원|Jardin du Luxembourg|자연;노트르담 대성당|Notre-Dame de Paris|역사;생트샤펠|Sainte-Chapelle|역사;퐁피두 센터|Centre Pompidou|박물관;갤러리 라파예트|Galeries Lafayette Haussmann|쇼핑`,
    '런던': `타워 브리지|Tower Bridge|명소;대영박물관|British Museum|박물관;런던 아이|London Eye|전망;버킹엄 궁전|Buckingham Palace|역사;런던탑|Tower of London|역사;웨스트민스터 사원|Westminster Abbey|역사;하이드 파크|Hyde Park, London|자연;내셔널 갤러리|National Gallery|박물관;버러 마켓|Borough Market|쇼핑;코번트 가든|Covent Garden|산책`,
    '로마': `콜로세움|Colosseum|역사;트레비 분수|Trevi Fountain|명소;판테온|Pantheon, Rome|역사;포로 로마노|Roman Forum|역사;바티칸 박물관|Vatican Museums|박물관;성 베드로 대성당|St. Peter's Basilica|역사;스페인 계단|Spanish Steps|산책;나보나 광장|Piazza Navona|산책;보르게세 미술관|Galleria Borghese|박물관;트라스테베레|Trastevere|산책`,
    '프라하': `카를교|Charles Bridge|명소;프라하성|Prague Castle|역사;구시가 광장|Old Town Square|역사;프라하 천문시계|Prague astronomical clock|명소;성 비투스 대성당|St. Vitus Cathedral|역사;페트린 전망탑|Petřín Lookout Tower|전망;바츨라프 광장|Wenceslas Square|산책;댄싱 하우스|Dancing House|명소;국립박물관|National Museum (Prague)|박물관;비셰흐라트|Vyšehrad|역사`,
    '바르셀로나': `사그라다 파밀리아|Sagrada Família|역사;구엘 공원|Park Güell|자연;카사 바트요|Casa Batlló|명소;카사 밀라|Casa Milà|명소;고딕 지구|Gothic Quarter, Barcelona|산책;보케리아 시장|La Boqueria|쇼핑;바르셀로네타 해변|La Barceloneta, Barcelona|자연;몬주익성|Montjuïc Castle|역사;피카소 미술관|Museu Picasso|박물관;카탈루냐 음악당|Palau de la Música Catalana|체험`,
    '뉴욕': `센트럴 파크|Central Park|자연;메트로폴리탄 미술관|Metropolitan Museum of Art|박물관;자유의 여신상|Statue of Liberty|명소;엠파이어 스테이트 빌딩|Empire State Building|전망;타임스 스퀘어|Times Square|산책;브루클린 브리지|Brooklyn Bridge|산책;하이라인|High Line|자연;뉴욕 현대미술관|Museum of Modern Art|박물관;첼시 마켓|Chelsea Market|쇼핑;서밋 원 밴더빌트|One Vanderbilt|전망`,
    '샌프란시스코': `금문교|Golden Gate Bridge|명소;알카트라즈|Alcatraz Island|역사;피어 39|Pier 39|쇼핑;골든 게이트 공원|Golden Gate Park|자연;롬바드 스트리트|Lombard Street (San Francisco)|산책;샌프란시스코 현대미술관|San Francisco Museum of Modern Art|박물관;페리 빌딩|San Francisco Ferry Building|쇼핑;페인티드 레이디스|Painted ladies|명소;팰리스 오브 파인아트|Palace of Fine Arts|명소;트윈 픽스|Twin Peaks (San Francisco)|전망`,
    '로스앤젤레스': `그리피스 천문대|Griffith Observatory|전망;게티 센터|Getty Center|박물관;산타모니카 피어|Santa Monica Pier|산책;할리우드 명예의 거리|Hollywood Walk of Fame|명소;유니버설 스튜디오 할리우드|Universal Studios Hollywood|테마파크;베니스 비치|Venice, Los Angeles|자연;더 브로드|The Broad|박물관;월트 디즈니 콘서트홀|Walt Disney Concert Hall|명소;그랜드 센트럴 마켓|Grand Central Market|쇼핑;LACMA|Los Angeles County Museum of Art|박물관`,
    '밴쿠버': `스탠리 파크|Stanley Park|자연;그랜빌 아일랜드|Granville Island|쇼핑;캐필라노 현수교|Capilano Suspension Bridge|체험;개스타운|Gastown|산책;캐나다 플레이스|Canada Place|명소;그라우스 마운틴|Grouse Mountain|전망;퀸 엘리자베스 공원|Queen Elizabeth Park, Vancouver|자연;밴쿠버 미술관|Vancouver Art Gallery|박물관;키칠라노 해변|Kitsilano Beach|자연;밴쿠버 아쿠아리움|Vancouver Aquarium|체험`,
    '시드니': `오페라하우스|Sydney Opera House|명소;하버 브리지|Sydney Harbour Bridge|명소;본다이 비치|Bondi Beach|자연;로열 보타닉 가든|Royal Botanic Garden, Sydney|자연;더 록스|The Rocks, New South Wales|산책;타롱가 동물원|Taronga Zoo|체험;뉴사우스웨일스 미술관|Art Gallery of New South Wales|박물관;달링 하버|Darling Harbour|산책;퀸 빅토리아 빌딩|Queen Victoria Building|쇼핑;맨리 비치|Manly Beach|자연`,
    '괌': `투몬 해변|Tumon|자연;사랑의 절벽|Two Lovers Point|전망;차모로 빌리지|Chamorro Village|쇼핑;스페인 광장|Plaza de España (Hagåtña)|역사;라테 스톤 공원|Latte Stone Park|역사;괌 박물관|Guam Museum|박물관;탈로포포 폭포|Talofofo Falls|자연;리티디안 포인트|Ritidian Point|자연;태평양 전쟁 국립역사공원|War in the Pacific National Historical Park|역사;아푸간 요새|Fort Apugan|전망`,
    '퀸스타운': `퀸스타운 가든|Queenstown Gardens|자연;와카티푸 호수|Lake Wakatipu|자연;밥스 피크|Bob's Peak|전망;스키퍼스 캐니언|Skippers Canyon|자연;애로타운|Arrowtown|산책;카와라우 협곡|Kawarau Gorge|자연;리마커블스|The Remarkables|자연;코로넷 피크|Coronet Peak|체험;글레노키|Glenorchy, New Zealand|산책;레이크 헤이스|Lake Hayes|자연`,
    '두바이': `부르즈 할리파|Burj Khalifa|전망;두바이 몰|Dubai Mall|쇼핑;미래 박물관|Museum of the Future|박물관;두바이 크리크|Dubai Creek|산책;팜 주메이라|Palm Jumeirah|명소;두바이 프레임|Dubai Frame|전망;알 파히디 역사 지구|Al Fahidi Historical Neighbourhood|역사;주메이라 모스크|Jumeirah Mosque|역사;두바이 마리나|Dubai Marina|산책;두바이 미러클 가든|Dubai Miracle Garden|자연`,
    '이스탄불': `아야 소피아|Hagia Sophia|역사;블루 모스크|Blue Mosque, Istanbul|역사;톱카프 궁전|Topkapı Palace|박물관;예레바탄 사라이|Basilica Cistern|역사;갈라타 타워|Galata Tower|전망;그랜드 바자르|Grand Bazaar, Istanbul|쇼핑;돌마바흐체 궁전|Dolmabahçe Palace|역사;이스티클랄 거리|İstiklal Avenue|산책;쉴레이마니예 모스크|Süleymaniye Mosque|역사;이스탄불 고고학박물관|Istanbul Archaeology Museums|박물관`,
    '케이프타운': `테이블 마운틴|Table Mountain|전망;볼더스 비치|Boulders Beach|자연;케이프 포인트|Cape Point|자연;V&A 워터프런트|Victoria & Alfred Waterfront|쇼핑;커스텐보쉬 식물원|Kirstenbosch National Botanical Garden|자연;로벤섬|Robben Island|역사;보캅|Bo-Kaap|산책;라이언스 헤드|Lion's Head (Cape Town)|자연;자이츠 현대미술관|Zeitz Museum of Contemporary Art Africa|박물관;캠프스 베이|Camps Bay|자연`,
    '칸쿤': `플라야 델피네스|Playa Delfines|자연;이슬라 무헤레스|Isla Mujeres|자연;엘 레이 유적|El Rey (Maya site)|역사;툴룸 유적|Tulum|역사;치첸이트사|Chichen Itza|역사;코수멜|Cozumel|자연;스칼렛 파크|Xcaret Park|테마파크;세노테 이크킬|Ik Kil|자연;플라야 노르테|Playa Norte|자연;칸쿤 수중미술관|Cancún Underwater Museum|박물관`,
    '리마': `미라플로레스 해안 산책로|Miraflores District, Lima|산책;라르코 박물관|Larco Museum|박물관;우아카 푸크야나|Huaca Pucllana|역사;리마 아르마스 광장|Plaza Mayor, Lima|역사;바랑코|Barranco District|산책;산프란시스코 수도원|Basilica and Convent of San Francisco, Lima|역사;매직 워터 서킷|Park of the Reserve|체험;라르코마르|Larcomar|쇼핑;리마 대성당|Cathedral of Lima|역사;아모르 공원|Parque del Amor|자연`
  };
  const descriptions = {전망:'전망을 즐기며 도시와 주변 풍경을 한눈에 담아보세요.',역사:'건축과 유적을 통해 이 지역의 역사를 만나는 코스예요.',자연:'물가와 녹지에서 풍경을 즐기는 야외 여행 후보예요.',박물관:'예술·역사·문화를 실내에서 둘러보는 방문 후보예요.',쇼핑:'상점과 시장을 구경하며 여행의 기념품을 찾아보세요.',산책:'주변 골목과 풍경을 천천히 둘러보기 좋은 코스예요.',명소:'도시를 대표하는 건축과 풍경을 만나보세요.',체험:'관람과 액티비티를 함께 계획해볼 수 있는 장소예요.',테마파크:'놀이시설과 공연을 즐기는 하루 코스로 살펴보세요.'};
  const details={
    '케이프타운':{
      '테이블 마운틴':'도시와 바다를 내려다보는 전망 코스예요. 날씨와 케이블카 운행 여부를 확인하고 시간을 여유 있게 잡으세요.',
      '볼더스 비치':'펭귄과 해안 풍경을 살펴보는 자연 코스예요. 관람 구역과 해변 이용 구역을 구분해 계획하세요.',
      '케이프 포인트':'해안과 절벽 풍경을 만나는 외곽 코스예요. 도심에서의 이동 시간을 넉넉히 잡으세요.',
      'V&A 워터프런트':'항구 산책에 쇼핑과 식사를 함께 묶어보세요. 기념품 예산은 입장료와 별도로 준비하세요.',
      '커스텐보쉬 식물원':'식물과 산자락 풍경을 천천히 즐기는 코스예요. 걷는 거리와 휴식 시간을 함께 정해보세요.',
      '로벤섬':'섬의 역사와 이야기를 살펴보는 방문 후보예요. 투어 예약과 배편 운항 여부를 먼저 확인하세요.',
      '보캅':'색채가 인상적인 거리와 지역 문화를 둘러보는 산책 코스예요. 주민의 일상을 존중하며 촬영하세요.',
      '라이언스 헤드':'도심 주변 풍경을 즐기는 야외 코스예요. 체력·날씨·현지 안전 안내에 맞춰 방문을 결정하세요.',
      '자이츠 현대미술관':'현대미술 감상을 일정에 넣어보세요. 전시와 입장 조건은 공식 안내에서 확인하세요.',
      '캠프스 베이':'해변 주변을 산책하며 쉬어가는 코스로 담아보세요. 교통과 귀가 시간을 미리 정해두세요.'
    }
  };
  window.GonsangTourCatalog = Object.freeze(Object.fromEntries(Object.entries(raw).map(([city,text])=>[city,Object.freeze(text.split(';').map((line,index)=>{
    const [name,wiki,category]=line.split('|');
    return Object.freeze({id:`${city}:${index}`,city,name,wiki,category,description:details[city]?.[name]||descriptions[category],order:index});
  }))])));
})();

// 관광 테마별로 살펴볼 수 있는 추가 후보. 좌표 도구의 additions와 이름·문서를 맞춘다.
(() => {
  const extras={
    '도쿄':[['요요기 공원','Yoyogi Park','자연','도심의 녹지에서 쉬어가는 공원 코스예요.'],['쓰키지 장외시장','Tsukiji fish market','쇼핑','시장 골목의 식료품과 상점을 구경하는 코스예요.']],
    '오사카':[['오사카 역사박물관','Osaka Museum of History','박물관','도시의 역사와 문화를 실내 전시로 살펴보세요.'],['쓰텐카쿠','Tsūtenkaku','전망','신세카이 주변 풍경을 내려다보는 전망 후보예요.']],
    '교토':[['료안지','Ryōan-ji','역사','사찰과 정원을 천천히 둘러보는 역사 코스예요.'],['헤이안 신궁','Heian Shrine','역사','신궁의 건축과 주변 풍경을 함께 살펴보세요.']],
    '후쿠오카':[['도초지','Tōchō-ji','역사','하카타의 사찰 문화를 살펴보는 방문 후보예요.'],['후쿠오카 아시아미술관','Fukuoka Asian Art Museum','박물관','아시아 미술을 실내 전시로 만나는 코스예요.']],
    '방콕':[['왓 사켓','Wat Saket','역사','사찰의 건축과 언덕 주변 풍경을 둘러보세요.'],['왓 트라이밋','Wat Traimit','역사','불교 문화와 사찰의 이야기를 살펴보세요.']],
    '다낭':[['다낭 대성당','Da Nang Cathedral','역사','도심의 성당 건축과 주변 거리를 함께 둘러보세요.'],['한강 다리','Hàn River Bridge','명소','강변 산책에 다리 풍경을 함께 담아보세요.']],
    '타이베이':[['화산 1914 문화창의산업원구','Huashan 1914 Creative Park','체험','전시와 문화 공간을 골라 둘러보는 코스예요.'],['송산 문화창의원구','Songshan Cultural and Creative Park','산책','문화 공간과 주변 산책을 함께 계획해 보세요.']],
    '싱가포르':[['내셔널 갤러리 싱가포르','National Gallery Singapore','박물관','미술 전시와 건축을 실내에서 함께 감상해 보세요.'],['주얼 창이','Jewel Changi Airport','쇼핑','공항 주변의 상업 공간과 실내 풍경을 둘러보세요.']],
    '홍콩':[['만모사원','Man Mo Temple','역사','도심 사원의 건축과 지역 문화를 살펴보세요.'],['홍콩 우주박물관','Hong Kong Space Museum','박물관','우주와 과학을 주제로 전시를 둘러보세요.']],
    '파리':[['튈르리 정원','Tuileries Garden','자연','정원 산책과 휴식을 일정에 넣어보세요.'],['팡테옹','Panthéon','역사','기념 건축물과 프랑스의 역사를 함께 살펴보세요.']],
    '런던':[['세인트 폴 대성당',"St Paul's Cathedral",'역사','대성당의 건축과 주변 거리를 둘러보세요.'],['테이트 모던','Tate Modern','박물관','현대미술을 감상하는 실내 코스로 살펴보세요.']],
    '로마':[['캄피돌리오 박물관','Capitoline Museums','박물관','고대 유물과 미술품을 전시로 살펴보세요.'],['산탄젤로성',"Castel Sant'Angelo",'역사','성의 건축과 강변 풍경을 함께 둘러보세요.']],
    '프라하':[['존 레논 벽','Lennon Wall','명소','거리의 색채와 주변 골목을 함께 둘러보세요.'],['스트라호프 수도원','Strahov Monastery','역사','수도원의 역사와 건축을 살펴보는 코스예요.']],
    '바르셀로나':[['카탈루냐 국립미술관',"Museu Nacional d'Art de Catalunya",'박물관','카탈루냐 미술을 전시로 만나는 코스예요.'],['티비다보','Tibidabo','전망','도시 주변 산자락의 풍경을 즐기는 전망 후보예요.']],
    '뉴욕':[['그랜드 센트럴 터미널','Grand Central Terminal','명소','역사적인 터미널의 건축과 실내 공간을 둘러보세요.'],['구겐하임 미술관','Solomon R. Guggenheim Museum','박물관','미술관의 전시와 독특한 건축을 함께 살펴보세요.']],
    '샌프란시스코':[['코이트 타워','Coit Tower','전망','언덕과 전망대 주변의 도시 풍경을 살펴보세요.'],['익스플로라토리움','Exploratorium','체험','과학 전시와 체험을 일정에 넣어보세요.']],
    '로스앤젤레스':[['게티 빌라','Getty Villa','박물관','고대 미술과 정원 공간을 함께 살펴보세요.'],['라 브레아 타르 핏츠','La Brea Tar Pits','박물관','자연사와 발굴 이야기를 살펴보는 코스예요.']],
    '밴쿠버':[['사이언스 월드','Science World (Vancouver)','체험','과학 전시와 체험을 둘러보는 방문 후보예요.'],['밴듀슨 식물원','VanDusen Botanical Garden','자연','식물과 정원 풍경을 천천히 즐겨보세요.']],
    '시드니':[['호주 박물관','Australian Museum','박물관','자연사와 문화를 실내 전시로 살펴보세요.'],['시드니 타워','Sydney Tower','전망','도심과 주변을 내려다보는 전망 코스예요.']],
    '괌':[['산타 아게다 요새','Fort Santa Agueda','역사','요새의 흔적과 주변 풍경을 함께 살펴보세요.'],['이나라한','Inalåhan, Guam','산책','마을과 해안 주변을 둘러보는 외곽 코스예요.']],
    '퀸스타운':[['킹스턴','Kingston, New Zealand','산책','호숫가 마을의 풍경을 즐기는 외곽 코스예요.'],['와나카','Wānaka','자연','호수와 주변 자연을 만나는 외곽 여행 후보예요.']],
    '두바이':[['에티하드 박물관','Etihad Museum','박물관','지역의 역사와 건국 이야기를 전시로 살펴보세요.'],['두바이 골드 수크','Dubai Gold Souk','쇼핑','시장 골목과 상점을 둘러보는 쇼핑 코스예요.']],
    '이스탄불':[['굴하네 공원','Gülhane Park','자연','도심 공원에서 산책과 휴식을 즐겨보세요.'],['스파이스 바자르','Spice Bazaar','쇼핑','향신료와 식료품 상점을 둘러보는 시장 코스예요.']],
    '케이프타운':[['남아프리카 국립미술관','Iziko South African National Gallery','박물관','남아프리카의 미술을 실내 전시로 살펴보세요.'],['시그널 힐','Signal Hill (Cape Town)','전망','도시와 해안 풍경을 함께 즐기는 전망 후보예요.']],
    '칸쿤':[['푸에르토 모렐로스','Puerto Morelos','산책','해안 마을과 주변 풍경을 둘러보는 외곽 코스예요.'],['플라야 델 카르멘','Playa del Carmen','산책','해변과 상점 거리를 함께 둘러보는 외곽 코스예요.']],
    '리마':[['페루 국립박물관','National Museum of Peru','박물관','페루의 역사와 문화를 전시로 살펴보세요.'],['산마르틴 광장','Plaza San Martín, Lima','역사','광장과 주변 건축을 함께 둘러보는 도심 코스예요.']]
  };
  window.GonsangTourExtras=Object.freeze(Object.fromEntries(Object.entries(extras).map(([city,rows])=>[city,Object.freeze(rows.map(([name,wiki,category,description],i)=>Object.freeze({id:`${city}:extra${i}`,city,name,wiki,category,description,order:10+i})))])));
})();

// 기념품은 실제 판매점·재고·가격을 의미하지 않는 쇼핑 계획 후보다.
(() => {
  const names={
    '도쿄':['도쿄바나나','편의점 한정 과자'],'오사카':['오사카 한정 과자','다코야키 굿즈'],'교토':['말차 과자','교토 기념 엽서'],
    '후쿠오카':['멘타이코(명란)','하카타 토리몬'],'방콕':['야돔','말린 망고'],'다낭':['베트남 커피믹스','라탄 가방'],
    '타이베이':['펑리수','누가 크래커'],'싱가포르':['카야잼','머라이언 기념품'],'홍콩':['제니쿠키','홍콩 기념 엽서'],
    '파리':['약국 화장품','마카롱'],'런던':['홍차','런던 기념 자석'],'로마':['로마 기념 엽서','로마 기념 자석'],
    '프라하':['프라하 기념 엽서','프라하 기념 자석'],'바르셀로나':['바르셀로나 기념 엽서','가우디 모티브 굿즈'],
    '뉴욕':['트레이더조 에코백','뉴욕 굿즈 머그'],'샌프란시스코':['금문교 기념 자석','샌프란시스코 기념 엽서'],
    '로스앤젤레스':['할리우드 기념 자석','LA 기념 엽서'],'밴쿠버':['메이플 시럽','밴쿠버 기념 엽서'],'시드니':['호주 과자','오페라하우스 기념 엽서'],
    '괌':['괌 기념 자석','괌 기념 엽서'],'퀸스타운':['뉴질랜드 기념 엽서','퀸스타운 기념 자석'],'두바이':['대추야자','두바이 기념 엽서'],
    '이스탄불':['로쿰','이스탄불 기념 자석'],'케이프타운':['케이프타운 기념 엽서','테이블 마운틴 기념 자석'],
    '칸쿤':['칸쿤 기념 엽서','칸쿤 기념 자석'],'리마':['페루 직물 소품','리마 기념 엽서']
  };
  window.GonsangTourGifts=Object.freeze(Object.fromEntries(Object.entries(names).map(([city,list])=>[city,Object.freeze(list.map((name,i)=>Object.freeze({id:`${city}:gift${i}`,city,name,category:'기념품',wiki:'Souvenir',description:'실제 매장·재고·가격과 구매·반입 조건을 직접 확인하는 쇼핑 후보예요.'})))])));
})();

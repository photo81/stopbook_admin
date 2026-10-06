// 주문 데이터 (주문 리스트 / 주문 상세 공유)
// member-data.js, member-type-store.js 다음에 로드
// 회원 상세 > 주문 내역과 같은 데이터(member-data.js의 m.orders)를 펼쳐 사용 → 회원 상세·엑셀·회원등급 산정과 숫자가 같음
// 결제금액(amount)·주문번호·상품·결제수단·결제상태·제작상태(status)는 기존 값 그대로,
// 주문 화면에만 필요한 값(주문시각·할인·수취인·배송방법 등)은 주문번호별 별도 난수로 덧붙임 (기존 샘플 값은 바뀌지 않음)
// TODO: 실서비스에서는 GET /api/admin/orders, GET /api/admin/orders/{orderNo} 로 조회
(function () {
  'use strict';

  const pad = n => String(n).padStart(2, '0');
  const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const TODAY = new Date(2026, 9, 1);   // 샘플 데이터 기준일 (member-data.js base와 동일). TODO: 실서비스에서는 new Date()
  const DAY = 86400000;
  // 결제정보 금액 기준 (paymentOf): 택배비, 무료배송 기준(할인 후), 퀵서비스비, 적립률
  const SHIP_FEE = 2500, FREE_SHIP_MIN = 15000, QUICK_FEE = 8000, REMOTE_FEE = 3000, POINT_RATE = 0.01;
  // 관리자 주문취소 내역 (주문 상세 > 주문정보 > 주문취소). 샘플 주문은 화면을 열 때마다 새로 만들어지므로 localStorage에 보관해 덮어씀
  // { [orderNo]: { items: { [상품 index]: { amount, reason, refund, memo, at, by } } } }
  // TODO: 실서비스에서는 POST /api/admin/orders/{orderNo}/cancel (PG 취소·환불 처리 포함)
  const CANCEL_KEY = 'stopbook.orderCancels.v1';
  let CANCELS = {};
  try { CANCELS = JSON.parse(localStorage.getItem(CANCEL_KEY)) || {}; } catch (e) { /* 저장소 사용 불가 시 취소 내역 없음 */ }
  // 관리자가 생성한 추가결제 요청 (주문 상세 > 결제정보 > 추가결제 생성)
  // { [orderNo]: [{ amount, reason, method, memo, at, by, status: '결제대기' }] }
  // 결제대기 요청은 총 결제금액에 넣지 않고 목록으로만 보여줌 (고객 결제가 끝나면 반영)
  // TODO: 실서비스에서는 POST /api/admin/orders/{orderNo}/extra-payments (결제 링크 발송·결제 완료 웹훅)
  const EXTRA_KEY = 'stopbook.orderExtraPayments.v1';
  let EXTRAS = {};
  try { EXTRAS = JSON.parse(localStorage.getItem(EXTRA_KEY)) || {}; } catch (e) { /* 저장소 사용 불가 시 요청 없음 */ }
  // 관리자 메모·변경 이력 (주문 상세 > 관리정보 탭)
  // 관리자가 수정·추가한 배송지 (주문 상세 > 배송정보)
  // { [orderNo]: { base: { recipient, phone, zip, address, detail, request }, extras: [{ id, ...같은 항목, items: [상품 index] }] } }
  // TODO: 실서비스에서는 PUT /api/admin/orders/{orderNo}/addresses
  const ADDR_KEY = 'stopbook.orderAddresses.v1';
  const ADDRESS_FIELDS = [['recipient', '수취인명'], ['phone', '연락처'], ['zip', '우편번호'], ['address', '주소'], ['detail', '상세주소'], ['request', '배송 요청사항']];
  let ADDRS = {};
  try { ADDRS = JSON.parse(localStorage.getItem(ADDR_KEY)) || {}; } catch (e) { /* 저장소 사용 불가 시 변경 없음 */ }
  const LOG_KEY = 'stopbook.orderAdminLog.v1';
  let LOGS = {};
  try { LOGS = JSON.parse(localStorage.getItem(LOG_KEY)) || {}; } catch (e) { /* 저장소 사용 불가 시 기록 없음 */ }
  // 관리자 입금 내역 (미입금 주문 리스트 > 입금처리 / 후결제 주문 리스트 > 입금관리 / 주문 상세)
  //   미입금(무통장입금 입금대기): 입금 1건 → 결제완료·주문 접수
  //   후결제: 분할 입금 가능. 입금 합계가 총 결제금액 이상이면 결제완료, 일부면 부분결제
  // { [orderNo]: { payments: [{ at(입금일시), method(입금받은 결제수단, 별도결제 포함), amount(입금액), memo(관리자 메모), by, processedAt }] } }
  // TODO: 실서비스에서는 GET/POST /api/admin/orders/{orderNo}/deposits
  const DEPOSIT_KEY = 'stopbook.orderDeposits.v2';   // v1: 입금 1건 { method, amount, at, by } / v2: 분할 입금 payments[] + memo
  let DEPOSITS = {};
  try { DEPOSITS = JSON.parse(localStorage.getItem(DEPOSIT_KEY)) || {}; } catch (e) { /* 저장소 사용 불가 시 입금 내역 없음 */ }
  // 결제수단 선택지: 주문 시 고객이 고르는 수단 + 후결제(후불 결제 회원, 상품 수령 후 결제) + 별도결제(관리자 입금처리에서 계좌 외 방법으로 받은 경우)
  // DEPOSIT_METHODS: 입금처리 모달에서 고르는 '입금받은 수단' (후결제는 받는 방법이 아니므로 제외)
  // TODO: 실서비스에서는 결제 설정값
  const PAY_METHODS = ['신용카드', '무통장입금', '계좌이체', '휴대폰결제', '네이버페이', '토스페이', '카카오페이', '후결제', '별도결제'];
  const DEPOSIT_METHODS = PAY_METHODS.filter(m => m !== '후결제');
  const WAITING = ['입금대기', '후결제대기', '부분결제'];   // 아직 결제가 끝나지 않은 결제상태 (미입금 / 후결제 입금 전 / 후결제 일부 입금)
  const TYPE_GROUPS = MemberTypeStore.load();   // 회원 유형 관리 설정 (회원구분 무료배송·할인율, 등급 할인 혜택) — 한 번만 읽음
  const DISCOUNT_KINDS = ['쿠폰', '마일리지', '상품가할인', '배송비할인', '회원할인', '등급할인'];   // 할인금액 세부 항목
  // 방문수령(직접 수령) 장소. TODO: 실서비스에서는 쇼핑몰 설정값
  const PICKUP_PLACE = '스탑북 본사 (경기도 파주시 회동길 230 본관 2층 포토사업부, 평일 10:00~17:00)';
  // 배송지 샘플 [우편번호, 주소] / 배송 요청사항 샘플
  const ADDRESS_SAMPLES = [
    ['04157', '서울특별시 마포구 마포대로 109'], ['06236', '서울특별시 강남구 테헤란로 152'], ['13529', '경기도 성남시 분당구 판교역로 166'],
    ['48058', '부산광역시 해운대구 센텀동로 25'], ['34126', '대전광역시 유성구 엑스포로 107'], ['61945', '광주광역시 서구 상무중앙로 61'],
    ['63309', '제주특별자치도 제주시 첨단로 242'], ['21984', '인천광역시 연수구 센트럴로 123']
  ];
  const DELIVERY_REQUESTS = ['문 앞에 놓아주세요', '경비실에 맡겨주세요', '배송 전 연락 바랍니다', '부재 시 문 앞에 놓아주세요', '', ''];
  // 증빙발급용 사업자 정보 샘플 [사업자명, 소재지, 업태, 종목]
  const BIZ_SAMPLES = [
    ['해오름유치원', '서울특별시 마포구 월드컵북로 12', '교육서비스업', '유아교육'],
    ['(주)블루웨이브', '경기도 성남시 분당구 판교로 256', '서비스업', '소프트웨어 개발'],
    ['한빛스튜디오', '부산광역시 해운대구 센텀중앙로 48', '서비스업', '사진촬영'],
    ['초록동아리협회', '대전광역시 유성구 대학로 99', '비영리', '단체'],
    ['(주)스마일상사', '인천광역시 연수구 컨벤시아대로 165', '도소매', '문구·사무용품']
  ];
  // 결제수단별 PG사 (샘플). TODO: 실서비스에서는 결제 내역의 PG사
  const PG_NAMES = { '신용카드': 'KG이니시스', '무통장입금': '가상계좌(KG이니시스)', '계좌이체': 'KG이니시스', '휴대폰결제': '다날',
    '네이버페이': '네이버페이', '토스페이': '토스페이먼츠', '카카오페이': '카카오페이', '후결제': '후결제 (PG 미경유)', '별도결제': '별도결제 (PG 미경유)' };

  MemberTypeStore.normalizeCategoryRefs(MemberData);   // 회원의 회원구분 code 정리 (회원구분 검색용)
  const NAMES = ['김서연', '이도윤', '박지우', '최하준', '정수아', '강지호', '조채원', '윤현우'];
  const SHIP_METHODS = [['택배', 90], ['방문수령', 7], ['퀵서비스', 3]];
  const ORDERS = [];

  // ===== 주문 상품 (주문 상세 > 주문 상품) =====
  // 주문의 상품명('마이트립북 외 2종')·수량·금액을 상품별로 나눔. 상품별 합계 = 주문 합계
  //   상품: 첫 상품은 주문 상품명, 나머지는 상품 목록에서 선택 / 수량: 상품마다 1부 이상, 남는 부수는 나눠 배정
  //   금액: 판매가 × 수량 비율로 주문금액·할인금액을 나누고(10원 단위, 끝자리는 마지막 상품에), 전체취소 주문은 상품 전부, 부분취소 주문은 상품 하나 취소
  //   결제금액 = 주문금액 - 할인금액 - 취소금액 (상품별 합계 = 주문 상세의 총결제금액)
  //   진행상태: 주문 제작상태에서 정함. 배송중(부분)이면 일부 상품만 배송중, 나머지는 제작중
  // 제작처 (샘플):
  //   포토북 → KSI 디지털센터 / KSI 오프셋센터 (상품마다 둘 중 하나)
  //   아크릴액자 → 핸드웍 / 아크릴키링 → 올댓프린팅 / 우드아크릴액자 → 굿즈마루
  //   그 밖의 액자 → 핸드웍, 캘린더·엽서·노트 등 인쇄물 → KSI 디지털센터
  // 주문번호별 별도 난수 → 다른 샘플 값에 영향 없음
  // TODO: 실서비스에서는 주문 상품(주문 상세 API)의 상품별 금액·진행상태·제작처 사용 (상품 마스터의 제작처 설정)
  // 추가 상품 후보: 회원 샘플 상품 목록 + 제작처 샘플용 아크릴 상품 (주문 상품의 두 번째 이후 상품에만 쓰임)
  // 레더북·러브데이북: 후가공(금박) 샘플용 포토북
  const EXTRA_PRODUCTS = [['아크릴키링', '팬시·굿즈', 5900], ['우드아크릴액자', '액자', 24900], ['레더북', '포토북', 39000], ['러브데이북', '포토북', 32000]];
  function makerOf(p, r) {
    if (p[1] === '포토북') return r() < 0.5 ? 'KSI 디지털센터' : 'KSI 오프셋센터';
    if (p[0].includes('우드아크릴')) return '굿즈마루';
    if (p[0].includes('아크릴키링')) return '올댓프린팅';
    if (p[0].includes('아크릴액자') || p[1] === '액자') return '핸드웍';
    return 'KSI 디지털센터';
  }
  // ===== 상품 제작 상세 (주문 상세 > 주문 상품 > 상품명을 눌러 펼침) =====
  // 제작번호, 편집내용보기(스탑북 뷰어), 세부 옵션, 표지·내지 디자인, 최초 편집 시작일
  // projectTitle(고객이 정한 작업물 이름)은 화면에서 뺐지만, 아래 옵션 샘플 값이 바뀌지 않도록 데이터에는 남겨 둠
  // 분류별로 해당 없는 옵션은 '' (화면에서 '-')
  // TODO: 실서비스에서는 주문 상품의 작업 정보(작업 키·옵션·디자인 템플릿) 사용. 뷰어는 샘플 작업물 하나에 연결
  const SPEC = {
    '포토북': { size: ['8x8', '10x10', 'A4 세로', 'A5 가로'], cover: ['린넨', '무광 하드', '유광 하드', '가죽'],
      coating: ['무광', '유광', '코팅 안함'], pages: [24, 30, 40, 50], coverDesign: true, innerDesign: true },
    '캘린더': { size: ['A5', 'A4', 'B4'], coating: ['무광', '유광'], pages: [13], coverDesign: true, innerDesign: true },
    '액자': { size: ['5x7', '8x10', 'A4'], coating: ['무광', '유광'], coverDesign: true },
    '팬시·굿즈': { size: ['미니', '기본'], coating: ['무광', '유광', '코팅 안함'], coverDesign: true }
  };
  const POST_FINISH_PRODUCTS = ['레더북', '러브데이북'];   // 후가공(금박) 대상 상품
  const FORMS = ['가로형', '세로형', '정사각'];   // 상품형태 샘플
  const ADDON_PRODUCTS = ['감사카드', '감사카드(메시지)', '포장박스', '쇼핑백'];   // 추가상품 샘플
  // 상품 코드: 분류 약어 + 상품 목록 순번 3자리. 예) PB001 (포토북 1번 상품)
  // TODO: 실서비스에서는 상품 마스터의 상품 코드
  const CODE_PREFIX = { '포토북': 'PB', '캘린더': 'CL', '액자': 'FR', '팬시·굿즈': 'GD' };
  const productCode = (p, list) => `${CODE_PREFIX[p[1]] || 'ET'}${String(list.indexOf(p) + 1).padStart(3, '0')}`;
  // 디자인 테마명 (표지·내지 디자인 공통)
  const DESIGN_THEMES = ['심플 화이트', '빈티지 필름', '트래블 스탬프', '모던 그리드', '파스텔 플라워'];
  function makeSpec(o, p, i, editBase) {
    let s = [...`${o.orderNo}#${i}`].reduce((h, c) => (h * 43 + c.charCodeAt(0)) % 233280, 17);
    const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const pick = arr => (arr ? arr[Math.floor(r() * arr.length)] : '');
    const sp = SPEC[p[1]] || {};
    const started = new Date(editBase.getTime() - (1 + Math.floor(r() * 30)) * DAY - Math.floor(r() * 86400) * 1000);
    // 후가공: 레더북·러브데이북만 맞춤금박 / 기본금박, 그 외 상품은 없음
    const finishing = POST_FINISH_PRODUCTS.includes(p[0]) ? pick(['맞춤금박', '기본금박']) : '';
    // 아래 값은 난수 순서를 지키려고 차례대로 정함 (순서를 바꾸면 샘플 값이 달라짐)
    const projectTitle = pick(MemberData.PROJECT_NAMES);
    const form = pick(FORMS);   // 상품형태: 가로형 / 세로형 / 정사각 (모든 분류 공통 샘플)
    const size = pick(sp.size), cover = pick(sp.cover), coating = pick(sp.coating);
    const totalPages = sp.pages ? pick(sp.pages) : 0;
    const coverDesign = sp.coverDesign ? pick(DESIGN_THEMES) : '';
    const innerDesign = sp.innerDesign ? pick(DESIGN_THEMES) : '';
    // 편집 완료일: 최초 편집 시작 후, 주문일 전 (난수는 위 값들 다음에 써서 기존 값이 바뀌지 않게 함)
    const span = Math.max(3600000, editBase.getTime() - started.getTime());
    const done = new Date(started.getTime() + Math.floor(r() * span));
    const fmtDt = d => `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    // 페이지: 기본 페이지수(포토북 24p) + 추가 페이지수. 화면 표시는 '24p(+6p)'
    const basePages = p[1] === '포토북' ? 24 : totalPages;
    return {
      finishing, projectTitle, form, size, cover, coating, coverDesign, innerDesign,
      basePages, addPages: Math.max(0, totalPages - basePages),
      makeNo: `M${o.orderNo.replace('-', '')}${String(i + 1).padStart(2, '0')}`,
      viewerUrl: MemberData.viewerUrl(MemberData.VIEWER_SAMPLE.mskey, MemberData.VIEWER_SAMPLE.userId),
      editStartedAt: fmtDt(started),
      editDoneAt: fmtDt(done),
      // 편집 서비스: 직접편집(고객이 편집기로 직접 제작) / 편집메이트(편집 대행 서비스). 둘 다 편집내용보기 가능 (난수는 맨 뒤)
      editService: r() < 0.85 ? '직접편집' : '편집메이트',
      // 부가서비스: 선물포장서비스 (약 20%) / 추가상품 구매: 0~2종, 종류별 1~3개 (난수는 맨 뒤)
      // TODO: 실서비스에서는 주문 상품의 부가서비스·추가상품 내역(금액 포함) 사용. 샘플은 금액에 반영하지 않음
      services: r() < 0.2 ? ['선물포장서비스'] : [],
      addons: (() => {
        const n = r() < 0.6 ? 0 : 1 + Math.floor(r() * 2);
        const pool = ADDON_PRODUCTS.slice(), out = [];
        for (let k = 0; k < n; k++) out.push({ name: pool.splice(Math.floor(r() * pool.length), 1)[0], qty: 1 + Math.floor(r() * 3) });
        return out;
      })()
    };
  }

  const ITEM_STATUS_ORDER = ['접수대기', '접수완료', '제작중', '배송중', '배송완료'];   // 상품별 진행상태 (흐름 순)
  const ITEM_STATUS = { '접수대기': '접수대기', '접수완료': '접수완료', '제작중': '제작중', '배송중(전체)': '배송중', '배송완료': '배송완료' };
  // 취소: 전체취소 주문은 상품 전부, 결제완료된 2종 이상 주문 일부(약 15%)는 상품 하나만 취소 → 주문 결제상태 '부분취소'
  function makeItems(o, listPrice, discount, fullCancel, orderedAt) {
    let s = [...o.orderNo].reduce((h, c) => (h * 41 + c.charCodeAt(0)) % 233280, 13);
    const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const first = o.title.replace(/ 외 \d+종$/, '');
    const kinds = 1 + Number((o.title.match(/외 (\d+)종/) || [0, 0])[1]);
    const P = MemberData.PRODUCTS.concat(EXTRA_PRODUCTS);
    const picked = [P.find(p => p[0] === first) || [first, '포토북', 20000]];
    while (picked.length < kinds) {
      const p = P[Math.floor(r() * P.length)];
      if (!picked.includes(p)) picked.push(p);
    }
    // 수량: 1부씩 먼저 배정하고 남은 부수를 무작위 상품에 추가
    const qtys = picked.map(() => 1);
    for (let i = kinds; i < o.qty; i++) qtys[Math.floor(r() * kinds)]++;
    // 금액 나누기: 비율대로 10원 단위, 마지막 상품이 나머지
    const weights = picked.map((p, i) => p[2] * qtys[i]);
    const W = weights.reduce((a, b) => a + b, 0);
    const split = total => {
      let left = total;
      return weights.map((w, i) => {
        if (i === weights.length - 1) return left;
        const v = Math.floor(total * w / W / 10) * 10;
        left -= v;
        return v;
      });
    };
    const lp = split(listPrice), dc = split(discount);
    // 배송중(부분): 첫 상품은 배송중, 나머지 중 일부도 배송중, 최소 1개는 제작중
    const partial = picked.map((_, i) => i === 0 || (i < kinds - 1 && r() < 0.5));
    const makers = picked.map(p => makerOf(p, r));
    // 부분취소할 상품 (난수는 위 값들 다음에 써서 기존 상품 구성이 바뀌지 않게 함)
    const cancelIdx = !fullCancel && o.payStatus === '결제완료' && kinds >= 2 && r() < 0.15 ? Math.floor(r() * kinds) : -1;
    const adminCancels = (CANCELS[o.orderNo] || {}).items || {};   // 관리자가 주문 상세에서 취소한 상품 { [상품 index]: 취소 정보 }
    return picked.map((p, i) => {
      const adminCancel = adminCancels[i] || null;
      const canceled = fullCancel || i === cancelIdx || !!adminCancel;
      const net = lp[i] - dc[i];
      // 취소금액: 관리자 취소는 입력한 금액(상품 결제금액 이하), 샘플 취소는 결제금액 전액
      const cancel = adminCancel ? Math.min(adminCancel.amount, net) : canceled ? net : 0;
      // 상품별 결제상태: 취소된 상품은 '취소', 그 외는 주문의 결제상태(입금대기/결제완료)
      const payStatus = canceled ? '취소' : o.payStatus;
      // 취소 전 진행상태 (관리자 취소 상품의 공정은 이 상태에서 멈춘 것으로 표시)
      const before = o.status === '배송중(부분)' ? (partial[i] ? '배송중' : '제작중') : ITEM_STATUS[o.status] || '';
      // 진행상태: 취소된 상품은 진행상태 없음('') — 결제상태 '취소'로 표시
      const status = canceled ? '' : before;
      const spec = makeSpec(o, p, i, new Date(o.at));   // 상품 제작 상세 (별도 난수)
      const flow = adminCancel ? Object.assign(makeFlow(o, i, before, false, orderedAt), { canceled: true, delivered: false, status: '' })
        : makeFlow(o, i, status, canceled, orderedAt);   // 제작 공정 진행 (별도 난수)
      return {
        name: p[0], category: p[1], code: productCode(p, P), qty: qtys[i],
        listPrice: lp[i], discount: dc[i], cancel, paid: net - cancel,
        payStatus, status, maker: makers[i],
        spec,
        price: priceOf(lp[i], qtys[i], spec),   // 상품단가·추가금액 (주문금액 = 상품단가 × 수량 + 추가금액)
        flow,
        cancelInfo: adminCancel   // 관리자 취소 내역 (사유·환불수단·비고·처리일시·처리자)
      };
    });
  }

  // ===== 상품 가격 구성 (주문 상세 > 주문 상품 > 펼침 하단) =====
  // 주문금액(상품별) = 상품단가 × 수량 + 추가금액
  //   추가금액 = 옵션 추가비: 페이지 추가 1p당 500원, 맞춤금박 3,000원·기본금박 1,500원 (모두 1부당)
  //   상품단가는 10원 단위로 맞추고, 나누어떨어지지 않는 끝전은 추가금액에 포함 (주문금액 합계가 바뀌지 않게)
  //   추가금액은 주문금액의 40%를 넘지 않게 제한
  // TODO: 실서비스에서는 주문 상품의 판매가·옵션가 사용
  function priceOf(listPrice, qty, spec) {
    const parts = [];
    let perCopy = 0;
    if (spec.addPages) { perCopy += spec.addPages * 500; parts.push(`페이지 추가 ${spec.addPages}p`); }
    if (spec.finishing === '맞춤금박') { perCopy += 3000; parts.push('맞춤금박'); }
    if (spec.finishing === '기본금박') { perCopy += 1500; parts.push('기본금박'); }
    const target = Math.min(perCopy * qty, Math.floor(listPrice * 0.4));
    const unitPrice = Math.floor((listPrice - target) / qty / 10) * 10;
    return { unitPrice, extra: listPrice - unitPrice * qty, extraItems: parts };
  }

  // ===== 제작 공정 플로우 (주문 상세 > 주문 상품 > 펼침 하단) =====
  // 상품별로 공정 단계를 어디까지 지났는지(step = 마지막으로 도달한 단계 index)와 단계별 처리 시각
  //   진행상태와 연동 (공정 구간 = 진행상태):
  //     주문접수                → 접수대기(입금 전)·접수완료
  //     합성완료 ~ 제본완료      → 제작중
  //     출고완료                → 배송중 (배송완료는 출고완료까지 모두 끝난 상태, delivered)
  //   취소된 상품은 주문접수~리핑처리중 중 한 단계에서 멈춘 것으로 표시 (canceled)
  // TODO: 실서비스에서는 공정 시스템(MES)의 상품별 공정 이력 사용
  const PROCESS_STEPS = ['주문접수', '합성완료', '조판완료', '리핑처리중', '리핑완료', '출력중', '출력완료', '제본완료', '출고완료'];
  // 공정 구간 → 진행상태 (from~to: 단계 index)
  const PROCESS_GROUPS = [{ label: '주문접수', from: 0, to: 0 }, { label: '제작중', from: 1, to: 7 }, { label: '배송중', from: 8, to: 8 }];
  function makeFlow(o, i, status, canceled, orderedAt) {
    let s = [...`${o.orderNo}#flow${i}`].reduce((h, c) => (h * 47 + c.charCodeAt(0)) % 233280, 19);
    const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const last = PROCESS_STEPS.length - 1;
    const step = canceled ? Math.floor(r() * 4)
      : status === '제작중' ? 1 + Math.floor(r() * (last - 1))   // 합성완료 ~ 제본완료
      : /^배송/.test(status) ? last                               // 출고완료
      : 0;                                                       // 접수대기·접수완료: 주문접수
    // 단계별 시각: 주문 시각부터 단계마다 1~10시간씩, 기준일을 넘지 않게
    let t = new Date(orderedAt.replace(' ', 'T')).getTime();
    const limit = TODAY.getTime() + DAY - 60000;
    const times = PROCESS_STEPS.map((_, k) => {
      if (k > step) return '';
      if (k > 0) t = Math.min(t + (1 + Math.floor(r() * 10)) * 3600000, limit);
      const d = new Date(t);
      return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    });
    return { step, times, canceled, status, delivered: status === '배송완료' };
  }
  MemberData.members.forEach(m => (m.orders || []).forEach(o => {
    let s = [...o.orderNo].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 233280, 7);
    const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const weighted = pairs => { let x = r() * pairs.reduce((t, p) => t + p[1], 0); for (const [v, w] of pairs) { if ((x -= w) < 0) return v; } return pairs[0][0]; };
    // 주문 시각 (초 단위). 초는 다른 샘플 값이 바뀌지 않도록 난수 순서와 별개로 주문번호에서 계산
    const sec = [...o.orderNo].reduce((h, c) => (h * 17 + c.charCodeAt(0)) % 9973, 3) % 60;
    const time = `${pad(8 + Math.floor(r() * 15))}:${pad(Math.floor(r() * 60))}:${pad(sec)}`;
    // 할인: 쿠폰·마일리지 등 (주문금액 = 결제금액 + 할인금액)
    const discount = r() < 0.4 ? Math.min(Math.floor(o.amount * 0.3 / 500) * 500, (2 + Math.floor(r() * 9)) * 500) : 0;
    const ordered = new Date(o.at);
    // 결제일: 입금대기·후결제대기는 없음 / 무통장입금은 다음 날 / 후결제(결제완료)는 배송 후 결제 → 주문 7일 뒤 / 그 외는 주문일
    const paidAt = WAITING.includes(o.payStatus) ? ''
      : o.payMethod === '무통장입금' ? fmtDate(new Date(Math.min(ordered.getTime() + DAY, TODAY.getTime())))
      : o.payMethod === '후결제' ? fmtDate(new Date(Math.min(ordered.getTime() + 7 * DAY, TODAY.getTime()))) : o.at;
    const shippedAt = /^배송/.test(o.status) ? fmtDate(new Date(Math.min(ordered.getTime() + (2 + Math.floor(r() * 3)) * DAY, TODAY.getTime()))) : '';
    // 상담: 주문일부터 14일 안에 남긴 문의가 있으면 '있음', 그중 답변대기가 있으면 '답변대기'
    const until = fmtDate(new Date(ordered.getTime() + 14 * DAY));
    const inq = (m.inquiries || []).filter(q => q.at.slice(0, 10) >= o.at && q.at.slice(0, 10) <= until);
    // 취소금액 = 취소된 상품의 결제금액 합계 (전체취소는 결제금액 전액). 총결제금액 = 주문금액 - 할인금액 - 취소금액
    // 결제상태: 입금대기 / 결제완료 / 부분취소(상품 일부 취소) / 전체취소
    const listPrice = o.amount + discount;
    const items = makeItems(o, listPrice, discount, o.payStatus === '전체취소', `${o.at} ${time}`);
    const cancelAmount = items.reduce((t, it) => t + it.cancel, 0);
    // 관리자가 모든 상품을 취소했으면 전체취소, 일부만 취소했으면(결제완료 주문) 부분취소
    const allCanceled = items.every(it => it.payStatus === '취소');
    const payStatus = allCanceled ? '전체취소' : o.payStatus === '결제완료' && cancelAmount ? '부분취소' : o.payStatus;
    const ord = {
      items,
      productNames: items.map(it => it.name).join(', '),   // 주문의 모든 상품명 (주문 리스트 상품명 검색·말풍선)
      // 상품별 진행상태 건수 [[상태, 건수], ...] (주문 리스트 제작상태 열·검색). 취소된 상품은 제외
      statusCounts: ITEM_STATUS_ORDER.map(st => [st, items.filter(it => it.status === st).length]).filter(([, n]) => n),
      canceledItems: items.filter(it => it.payStatus === '취소').length,   // 취소된 상품 수 (부분취소(건수) 표시)
      member: m, orderNo: o.orderNo,
      orderedAt: `${o.at} ${time}`, orderDate: o.at, paidAt, shippedAt,
      name: m.name, recipient: r() < 0.85 ? m.name : NAMES[Math.floor(r() * NAMES.length)],
      userId: m.userId, email: m.email, phone: m.phone, categoryCode: m.categoryCode,
      // 주문수량: 건 = 상품 종류 수('마이트립북 외 2종' → 3건), 부 = 제작 수량 합계
      title: o.title, kinds: 1 + Number((o.title.match(/외 (\d+)종/) || [0, 0])[1]), qty: o.qty,
      listPrice, discount, amount: o.amount,
      cancelAmount, totalPaid: o.amount - cancelAmount,
      payMethod: o.payMethod, payStatus, status: o.status,
      shipMethod: weighted(SHIP_METHODS),
      inquiry: inq.some(q => q.status === '답변대기') ? 'W' : inq.length ? 'Y' : 'N'
    };
    // 결제환경: PC / MO(모바일). 주문번호로 정함 (약 65% 모바일). TODO: 실서비스에서는 주문 접수 시 기록한 결제 환경
    ord.env = [...ord.orderNo].reduce((h, c) => (h * 61 + c.charCodeAt(0)) % 9973, 31) % 100 < 65 ? 'MO' : 'PC';
    ord.payment = paymentOf(ord, m);
    ord.delivery = deliveryOf(ord, m);
    applyAddressEdits(ord);   // 관리자가 수정·추가한 배송지 반영
    if (DEPOSITS[ord.orderNo]) applyDeposit(ord, DEPOSITS[ord.orderNo]);   // 관리자가 입금처리한 주문 → 결제완료·접수완료
    else if (ord.payMethod === '후결제' && !WAITING.includes(ord.payStatus) && ord.payStatus !== '전체취소') applyDeposit(ord, samplePayments(ord));   // 결제가 끝난 후결제 샘플 → 입금 내역 샘플
    else if (ord.payMethod === '후결제' && ord.payStatus === '후결제대기') { const part = samplePartialPayment(ord); if (part) applyDeposit(ord, part); }   // 입금 전 후결제 샘플 일부 → 1차 입금만 된 부분결제
    ORDERS.push(ord);
  }));

  // 결제가 끝난 후결제 샘플 주문의 입금 내역 (입금관리 모달 > 입금 내역, 주문 히스토리). 저장소에는 넣지 않음
  //   대부분 1회 전액 입금, 5만 원 이상 주문 일부(약 40%)는 2회 분할 입금. 입금일시는 결제일(주문 7일 뒤) 기준
  //   주문번호별 별도 난수 → 다른 샘플 값에 영향 없음
  function samplePayments(ord) {
    let s = [...`${ord.orderNo}#dep`].reduce((h, c) => (h * 67 + c.charCodeAt(0)) % 233280, 37);
    const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const pick = arr => arr[Math.floor(r() * arr.length)];
    const total = ord.payment.total;
    const paidDay = new Date(ord.paidAt);
    const at = (d, hour) => `${fmtDate(d)} ${pad(hour)}:${pad(Math.floor(r() * 60))}:${pad(Math.floor(r() * 60))}`;
    const method = pick(['계좌이체', '계좌이체', '무통장입금', '별도결제']);
    const payer = (ord.member.business || {}).companyName || ord.name;
    const pay = (d, amount, memo) => ({ at: at(d, 9 + Math.floor(r() * 9)), method, amount, memo, by: '관리자', processedAt: '' });
    if (total < 50000 || r() >= 0.4) return { payments: [pay(paidDay, total, pick(['', '', `입금자명 ${payer}`, '세금계산서 발급 후 입금']))] };
    const first = Math.max(1000, Math.floor(total * (0.3 + r() * 0.4) / 1000) * 1000);
    const firstDay = new Date(paidDay.getTime() - (1 + Math.floor(r() * 5)) * DAY);
    return { payments: [pay(firstDay, first, `1차 입금 (분할) · 입금자명 ${payer}`), pay(paidDay, total - first, '잔액 입금')] };
  }
  // 입금 전(후결제대기) 후결제 샘플 주문 중 2만 원 이상 주문의 약 40%는 1차 입금만 된 부분결제로 (후결제 주문 리스트 > 부분결제 탭 샘플)
  //   입금일시는 주문 2~8일 뒤(오늘 이전). 잔액은 관리자가 입금관리에서 등록. 반환: { payments } 또는 null
  function samplePartialPayment(ord) {
    let s = [...`${ord.orderNo}#part`].reduce((h, c) => (h * 67 + c.charCodeAt(0)) % 233280, 41);
    const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const total = ord.payment.total;
    if (total < 20000 || r() >= 0.4) return null;
    const day = new Date(Math.min(new Date(ord.orderDate).getTime() + (2 + Math.floor(r() * 7)) * DAY, TODAY.getTime() - DAY));
    if (day.getTime() < new Date(ord.orderDate).getTime()) return null;   // 주문 당일 이전으로는 입금 불가
    const amount = Math.max(1000, Math.floor(total * (0.3 + r() * 0.3) / 1000) * 1000);
    const payer = (ord.member.business || {}).companyName || ord.name;
    const at = `${fmtDate(day)} ${pad(9 + Math.floor(r() * 9))}:${pad(Math.floor(r() * 60))}:${pad(Math.floor(r() * 60))}`;
    return { payments: [{ at, method: r() < 0.7 ? '계좌이체' : '무통장입금', amount, memo: `1차 입금 (분할) · 입금자명 ${payer}`, by: '관리자', processedAt: '' }] };
  }

  // ===== 입금처리 (미입금 주문 리스트 / 주문 상세) =====
  // 주문 목록 구분
  //   미입금 주문 리스트: 무통장입금 입금대기 (통합 주문 리스트에도 입금대기로 나옴 → 입금처리하면 이 목록에서 빠지고 통합 주문 리스트에는 결제완료로 반영)
  //   후결제 주문 리스트: 후결제로 주문한 건 전부 (결제 전·후 모두). 후결제는 접수 즉시 제작이 진행되므로 통합 주문 리스트에도 함께 나옴
  //                      입금처리하면 결제상태(후결제대기 → 결제완료)·결제수단(입금받은 수단)이 바뀌어 두 목록에 같이 반영
  //   통합 주문 리스트: 주문 전부 (미입금 포함)
  const isUnpaid = ord => ord.payStatus === '입금대기';
  const isPostpayOrder = ord => (ord.orderedPayMethod || ord.payMethod) === '후결제';
  const isPostpay = ord => ord.payStatus === '후결제대기';   // 후결제 중 아직 입금 전
  const isWaiting = ord => WAITING.includes(ord.payStatus);   // 입금 대상 (미입금 + 후결제 입금 전·일부 입금)
  // 입금 내역 반영 (rec = { payments: [...] })
  //   결제수단은 마지막 입금의 수단으로, 결제일은 입금이 끝난 날로. 후결제 주문인지는 주문 시 결제수단 orderedPayMethod로 판정 (결제수단이 바뀌어도 후결제 주문 리스트에 남음)
  //   후결제: 입금 합계 ≥ 총 결제금액이면 결제완료, 모자라면 부분결제 (진행상태는 그대로)
  //   미입금(무통장입금): 입금 1건으로 결제완료 (금액이 달라도 결제완료, 차액은 관리자가 별도 처리) + 상품 진행상태 접수대기 → 접수완료(주문 접수)
  //   결제정보(적립·입금일시·PG 로그·증빙 발급상태)와 배송정보 다시 계산
  //   (화면을 열 때 저장된 입금 내역을 반영할 때와 입금 등록 직후 목록을 다시 그릴 때 같은 함수를 씀)
  function applyDeposit(ord, rec) {
    const payments = rec.payments;
    if (!payments.length) return;
    const last = payments[payments.length - 1];
    const paid = payments.reduce((t, p) => t + p.amount, 0);
    ord.orderedPayMethod = ord.orderedPayMethod || ord.payMethod;   // 주문 시 결제수단(무통장입금·후결제) — 이력의 '주문 접수' 문구·후결제 판정용
    const total = ord.payment.total;
    const full = ord.orderedPayMethod === '후결제' ? paid >= total : true;
    ord.deposit = { payments, paid, remaining: Math.max(0, total - paid), full, method: last.method, at: last.at };
    ord.payMethod = last.method;
    ord.paidAt = full ? last.at.slice(0, 10) : '';
    if (WAITING.includes(ord.payStatus)) ord.payStatus = full ? (ord.cancelAmount ? '부분취소' : '결제완료') : '부분결제';
    if (full) {
      if (ord.status === '접수대기') ord.status = '접수완료';
      ord.items.forEach(it => {
        if (WAITING.includes(it.payStatus)) it.payStatus = '결제완료';
        if (it.status === '접수대기') it.status = '접수완료';
        if (it.flow && it.flow.status === '접수대기') it.flow.status = '접수완료';
      });
    } else {
      ord.items.forEach(it => { if (WAITING.includes(it.payStatus)) it.payStatus = '부분결제'; });
    }
    ord.statusCounts = ITEM_STATUS_ORDER.map(st => [st, ord.items.filter(it => it.status === st).length]).filter(([, n]) => n);
    ord.payment = paymentOf(ord, ord.member);
    ord.delivery = deliveryOf(ord, ord.member);
    applyAddressEdits(ord);
  }
  // 입금 등록: 저장 + 화면의 주문에 바로 반영. dep = { method, amount, at(입금일시 'YYYY-MM-DD HH:MM:SS'), memo, by }. 반환: 저장 성공 여부
  function addDeposit(orderNo, dep) {
    const ord = ORDERS.find(o => o.orderNo === orderNo);
    if (!ord || !isWaiting(ord)) return false;
    const rec = DEPOSITS[orderNo] || (DEPOSITS[orderNo] = { payments: [] });
    rec.payments.push({ method: dep.method, amount: dep.amount, at: dep.at || nowText(), memo: dep.memo || '', processedAt: nowText(), by: dep.by });
    let saved = true;
    try { localStorage.setItem(DEPOSIT_KEY, JSON.stringify(DEPOSITS)); } catch (e) { saved = false; }
    applyDeposit(ord, rec);
    return saved;
  }
  // 주문의 입금 내역 (입금관리 모달 목록). 관리자가 등록한 내역 + 샘플 내역 모두 주문의 deposit에서 읽음. 반환: [{ at, method, amount, memo, by }]
  const depositsOf = orderNo => { const ord = ORDERS.find(o => o.orderNo === orderNo); return ord && ord.deposit ? ord.deposit.payments.slice() : []; };

  // ===== 배송정보 (주문 상세 > 배송정보 탭) =====
  //   수령인: 수취인명·연락처·주소·배송 요청사항 (주소·요청사항은 샘플)
  //   배송: 배송방법별 — 택배(택배사·운송장), 방문수령(수령 장소 = 스탑북 본사), 퀵서비스(퀵 업체)
  //   출고 내역: 상품별 출고 상태. 배송중·배송완료 상품은 같은 운송장으로 출고된 것으로 표시
  //     배송상태(주문): 출고 전 = 배송준비중, 일부 출고 = 부분출고, 모두 출고 = 배송중, 모두 도착 = 배송완료, 전체취소 = 배송취소
  // 주문번호별 별도 난수 → 다른 샘플 값에 영향 없음
  // TODO: 실서비스에서는 주문 배송지·출고(송장) API
  function deliveryOf(ord, m) {
    let s = [...`${ord.orderNo}#ship`].reduce((h, c) => (h * 59 + c.charCodeAt(0)) % 233280, 29);
    const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const pick = arr => arr[Math.floor(r() * arr.length)];
    const p2 = n => String(n).padStart(2, '0');
    const addr = pick(ADDRESS_SAMPLES);
    const live = ord.items.filter(it => it.payStatus !== '취소');
    const shipped = live.filter(it => /^배송/.test(it.status));
    const delivered = live.length && live.every(it => it.status === '배송완료');
    const status = !live.length ? '배송취소' : delivered ? '배송완료' : shipped.length === live.length ? '배송중' : shipped.length ? '부분출고' : '배송준비중';
    const courier = ord.shipMethod === '택배' ? pick(['한진택배', 'CJ대한통운', '롯데택배']) : ord.shipMethod === '퀵서비스' ? pick(['바로퀵', '스피드퀵']) : '';
    const waybill = shipped.length && ord.shipMethod === '택배' ? `${5 + Math.floor(r() * 4)}${String(Math.floor(r() * 1e11)).padStart(11, '0')}` : '';
    // 배송완료일: 배송 시작 1~2일 뒤, 기준일을 넘지 않게
    let doneAt = '';
    if (delivered && ord.shippedAt) {
      const d = new Date(Math.min(new Date(ord.shippedAt).getTime() + (1 + Math.floor(r() * 2)) * DAY, TODAY.getTime()));
      doneAt = `${fmtDate(d)} ${p2(10 + Math.floor(r() * 9))}:${p2(Math.floor(r() * 60))}`;
    }
    const dong = 1 + Math.floor(r() * 20), ho = 100 + Math.floor(r() * 1500);
    // 배송 시작일시 = 택배사 집하스캔 시점 (출고일 09:00~18:59). 배송 완료일시 = 배송상태가 '배송완료'로 바뀐 시점(doneAt)
    // 난수는 위 값들 다음에 사용 (기존 값이 바뀌지 않게)
    const pickupAt = shipped.length && ord.shippedAt ? `${ord.shippedAt} ${p2(9 + Math.floor(r() * 10))}:${p2(Math.floor(r() * 60))}` : '';
    return {
      recipient: ord.recipient,
      phone: ord.recipient === m.name ? m.phone : `010-${1000 + Math.floor(r() * 9000)}-${1000 + Math.floor(r() * 9000)}`,
      zip: addr[0], address: addr[1], detail: r() < 0.5 ? `${dong}동 ${ho}호` : `${ho}호`,
      request: pick(DELIVERY_REQUESTS),
      method: ord.shipMethod, courier, waybill, status,
      pickupPlace: ord.shipMethod === '방문수령' ? PICKUP_PLACE : '',
      shippedAt: pickupAt, doneAt,
      trackingUrl: waybill ? trackingUrl(courier, waybill) : '',
      // 출고 내역: 상품별
      lines: ord.items.map(it => ({
        name: it.name, qty: it.qty, makeNo: it.spec.makeNo,
        state: it.payStatus === '취소' ? '취소' : it.status === '배송완료' ? '배송완료' : /^배송/.test(it.status) ? '출고완료' : '출고대기',
        waybill: /^배송/.test(it.status) ? waybill : '',
        at: /^배송/.test(it.status) ? pickupAt : ''
      }))
    };
  }

  // 택배사별 배송조회 주소 (운송장번호를 누르면 새 창)
  // TODO: 실서비스에서는 택배사 조회 주소를 설정값으로 관리 (CJ대한통운·롯데택배 주소는 연결 확인 필요)
  function trackingUrl(courier, waybill) {
    const no = encodeURIComponent(waybill);
    if (courier === 'CJ대한통운') return `https://trace.cjlogistics.com/next/tracking.html?wblNo=${no}`;
    if (courier === '롯데택배') return `https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo=${no}`;
    return `https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&wblnumText2=${no}&schLang=KR`;
  }

  // ===== 결제정보 (주문 상세 > 결제정보 탭, 상단 결제 금액 요약) =====
  // 총 결제금액 = 주문금액 + 배송비 − 할인금액 + 추가결제금액 − 취소금액
  //   배송비: 택배 2,500원 (할인 후 15,000원 이상 또는 회원구분 무료배송 혜택이면 0원), 방문수령 0원, 퀵서비스 8,000원
  //   추가결제금액: 주문 후 옵션 변경 등으로 따로 결제한 금액 (약 8% 주문, 1,000~6,000원)
  //   취소금액: 취소된 상품 금액. 전체취소면 배송비·추가결제금액도 함께 취소 → 총 결제금액 0원
  //   적립금액: 총 결제금액의 1% (10원 단위 버림). 입금대기·전체취소는 0원
  // 주문번호별 별도 난수 → 다른 샘플 값에 영향 없음
  // 함수 선언이라 위 forEach에서 호출 가능. 금액 상수(SHIP_FEE 등)는 forEach보다 먼저 초기화되도록 파일 위쪽에 둠
  // TODO: 실서비스에서는 결제 API의 결제 내역(배송비·추가결제·취소·적립) 사용. 배송비 정책은 쇼핑몰 설정값
  //   배송비 세부: 기본배송비(위 기준) + 추가배송비(택배 도서산간 3,000원, 약 6% 주문 — 무료배송이어도 부과)
  //   할인금액 세부: 쿠폰 / 마일리지 / 상품가할인 / 배송비할인 / 회원할인 / 등급할인 (합계 = 할인금액, 500원 단위로 나눔)
  //     배송비할인은 배송비가 있을 때만(배송비 이하), 회원할인은 회원구분 할인율이 있을 때만, 등급할인은 회원등급 할인 혜택이 있을 때만
  function paymentOf(ord, m) {
    let s = [...`${ord.orderNo}#pay`].reduce((h, c) => (h * 53 + c.charCodeAt(0)) % 233280, 23);
    const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const cat = MemberTypeStore.categoryByCode(m.categoryCode, TYPE_GROUPS);
    const freeByCategory = !!(cat && cat.freeShipping);
    const baseShip = ord.shipMethod === '방문수령' ? 0
      : ord.shipMethod === '퀵서비스' ? QUICK_FEE
      : freeByCategory || ord.listPrice - ord.discount >= FREE_SHIP_MIN ? 0 : SHIP_FEE;
    const extraPay = r() < 0.08 ? (1 + Math.floor(r() * 6)) * 1000 : 0;
    // 아래 난수는 위 값 다음에 사용 (기존 추가결제금액이 바뀌지 않게)
    const extraShip = ord.shipMethod === '택배' && r() < 0.06 ? REMOTE_FEE : 0;
    const shipFee = baseShip + extraShip;
    const discounts = splitDiscount(ord.discount, {
      shipping: shipFee,
      member: !!(cat && cat.discountRate > 0),
      grade: !!((gradeItemOf(m.grade) || {}).benefit || {}).discountOn
    }, r);
    const full = ord.payStatus === '전체취소';
    const cancel = ord.cancelAmount + (full ? shipFee + extraPay : 0);
    const total = ord.listPrice + shipFee - ord.discount + extraPay - cancel;
    const point = ['결제완료', '부분취소'].includes(ord.payStatus) ? Math.floor(total * POINT_RATE / 10) * 10 : 0;
    const extraRequests = (EXTRAS[ord.orderNo] || []).slice();   // 관리자 생성 추가결제 (결제대기 — 합계 미반영)
    // 주문금액 나누기: 상품금액(단가 × 부수 합계) + 옵션 추가금액(페이지 추가·후가공 등) = listPrice
    const optionExtra = ord.items.reduce((t, it) => t + it.price.extra, 0);
    const baseAmount = ord.listPrice - optionExtra;
    return { listPrice: ord.listPrice, baseAmount, optionExtra, shipFee, baseShip, extraShip, freeByCategory, discount: ord.discount, discounts, extraPay, extraRequests, cancel, total, point,
      ...payMethodInfo(ord, m, r) };
  }

  // ===== 결제 수단 내역 (결제정보 탭 오른쪽) =====
  //   입금일시: 카드·간편결제 등은 주문 시각, 무통장입금은 다음 날 (입금대기면 없음)
  //   PG 로그: 거래번호(TID)·승인번호·승인 결과 (샘플)
  //   서류발급: 현금성 결제(무통장입금·계좌이체)는 현금영수증(소득공제/지출증빙)·세금계산서·요청 안 함, 그 외는 요청 안 함
  //     발급상태: 발급완료(일시) / 발급대기(입금 전) / 발급취소(전체취소)
  // 난수는 위 결제 금액 값 다음에 사용 (기존 값이 바뀌지 않게)
  // TODO: 실서비스에서는 PG 결제 내역·현금영수증/세금계산서 발급 API
  // PG사 이름(PG_NAMES)은 forEach보다 먼저 초기화되도록 파일 위쪽에 둠
  function payMethodInfo(ord, m, r) {
    const pad2 = n => String(n).padStart(2, '0');
    let paidDateTime = '';
    if (ord.paidAt) {
      paidDateTime = ['무통장입금', '후결제'].includes(ord.payMethod)
        ? `${ord.paidAt} ${pad2(9 + Math.floor(r() * 12))}:${pad2(Math.floor(r() * 60))}:${pad2(Math.floor(r() * 60))}`
        : ord.orderedAt;
    }
    // 관리자 입금 등록 주문: 입금일시 = 입금이 끝난 마지막 입금일시, 승인번호 없음 (PG 승인이 아니라 관리자가 입금을 확인한 건)
    if (ord.deposit) paidDateTime = ord.deposit.full ? ord.deposit.at : '';
    const tid = `${ord.payMethod === '휴대폰결제' ? 'DN' : 'INI'}${ord.orderNo.replace('-', '')}${String(Math.floor(r() * 9000) + 1000)}`;
    const approvalNo = ord.paidAt ? String(10000000 + Math.floor(r() * 89999999)) : '';   // 난수 순서 유지
    const dp = ord.deposit;
    const pgLog = {
      pg: PG_NAMES[ord.payMethod] || 'KG이니시스', tid,
      approvalNo: dp ? '' : approvalNo,
      result: dp ? `관리자 입금 확인 ${dp.payments.length}회 · 합계 ${dp.paid.toLocaleString()}원${dp.full ? '' : ` (부분결제, 잔액 ${dp.remaining.toLocaleString()}원)`}`
        : ord.payStatus === '입금대기' ? '가상계좌 발급 (입금 대기)' : ord.payStatus === '후결제대기' ? '후결제 (상품 수령 후 결제 대기)'
        : ord.payStatus === '전체취소' ? '승인 취소' : ord.payMethod === '후결제' ? '후결제 입금 확인' : '승인 성공'
    };
    // 증빙발급: 현금성 결제(무통장입금·계좌이체)만 요청 가능
    //   현금영수증 — 소득공제(휴대폰 / 주민번호) 또는 지출증빙(사업자번호)
    //   세금계산서 — 사업자번호·사업자명·대표자·소재지·업태·종목·담당자명·담당자 연락처·이메일·발급일·청구/영수
    // docInfo: [[항목명, 값], ...] (개인정보는 가운데 마스킹)
    const cashLike = ['무통장입금', '계좌이체', '후결제'].includes(ord.payMethod);
    const x = r();
    const docType = !cashLike ? '' : x < 0.55 ? '현금영수증' : x < 0.7 ? '세금계산서' : '';
    const docPurpose = docType === '현금영수증' ? (x < 0.35 ? '소득공제' : '지출증빙') : '';
    const bizNo = () => `${100 + Math.floor(r() * 800)}-${10 + Math.floor(r() * 80)}-${10000 + Math.floor(r() * 89999)}`;
    const biz = () => {
      const b = BIZ_SAMPLES[Math.floor(r() * BIZ_SAMPLES.length)];
      return { no: bizNo(), name: b[0], ceo: m.name, addr: b[1], kind: b[2], item: b[3] };
    };
    const docStatus = !docType ? '' : ord.payStatus === '전체취소' ? '발급취소' : WAITING.includes(ord.payStatus) ? '발급대기' : '발급완료';
    const docAt = docStatus === '발급완료' && paidDateTime ? paidDateTime.slice(0, 16) : '';
    let docInfo = [];
    if (docPurpose === '소득공제') {
      docInfo = r() < 0.7
        ? [['구분', '휴대폰'], ['휴대폰', m.phone.replace(/-(\d{4})-/, '-****-')]]
        : [['구분', '주민번호'], ['주민번호', `${String(70 + Math.floor(r() * 30)).padStart(2, '0')}${pad2(1 + Math.floor(r() * 12))}${pad2(1 + Math.floor(r() * 28))}-*******`]];
    } else if (docPurpose === '지출증빙') {
      const b = biz();   // 사업자번호만 사용 (난수 순서 유지를 위해 사업자 샘플은 그대로 고름)
      docInfo = [['사업자번호', b.no]];
    } else if (docType === '세금계산서') {
      const b = biz();
      docInfo = [['사업자번호', b.no], ['사업자명', b.name], ['대표자', b.ceo], ['소재지', b.addr],
        ['업태', b.kind], ['종목', b.item], ['담당자명', m.name], ['담당자 연락처', m.phone.replace(/-(\d{4})-/, '-****-')], ['이메일', m.email],
        // 발급일: 발급완료일 때만. 청구/영수: 입금 전에 발행하면 청구, 입금 후 발행하면 영수
        ['발급일', docAt ? docAt.slice(0, 10) : '-'], ['청구/영수', WAITING.includes(ord.payStatus) ? '청구' : '영수']];
    }
    return { paidDateTime, pgLog, docType, docPurpose, docInfo, docStatus, docAt };
  }

  // 할인금액을 종류별로 나눔. 반환: [[종류, 금액], ...] (DISCOUNT_KINDS 6종 모두, 금액 0 포함)
  function splitDiscount(total, ok, r) {
    const out = Object.fromEntries(DISCOUNT_KINDS.map(k => [k, 0]));
    const eligible = ['쿠폰', '마일리지', '상품가할인'];
    if (ok.shipping) eligible.push('배송비할인');
    if (ok.member) eligible.push('회원할인');
    if (ok.grade) eligible.push('등급할인');
    let units = Math.floor(total / 500), rest = total - units * 500;
    // 1~3종에 나눔
    const picked = [];
    const n = Math.min(eligible.length, 1 + Math.floor(r() * 3));
    while (picked.length < n) { const k = eligible[Math.floor(r() * eligible.length)]; if (!picked.includes(k)) picked.push(k); }
    while (units > 0) {
      const k = picked[Math.floor(r() * picked.length)];
      if (k === '배송비할인' && (out[k] + 500) > ok.shipping) { picked.splice(picked.indexOf(k), 1); if (!picked.length) picked.push('쿠폰'); continue; }
      out[k] += 500; units--;
    }
    out[picked[0] === '배송비할인' ? '쿠폰' : picked[0]] += rest;   // 500원 미만 끝전
    return DISCOUNT_KINDS.map(k => [k, out[k]]);
  }
  // 회원등급 이름 → 회원 유형 관리의 등급 항목 (등급할인 여부 확인용)
  function gradeItemOf(name) {
    return ((TYPE_GROUPS.find(g => g.key === 'grade') || { items: [] }).items.find(it => it.name === name)) || null;
  }

  window.OrderData = {
    ORDERS, TODAY, PROCESS_STEPS, PROCESS_GROUPS, ITEM_STATUS_ORDER, PAY_METHODS, DEPOSIT_METHODS,
    find: orderNo => ORDERS.find(o => o.orderNo === orderNo) || null,
    isUnpaid, isPostpayOrder, isPostpay, isWaiting, addDeposit, depositsOf,
    saveCancel, restoreCancel, saveExtraRequest,
    adminLog, memoCategories, addMemo, updateMemo, deleteMemo, addHistory, systemHistory,
    saveAddress, deleteAddress, ADDRESS_FIELDS,
    MEMO_CATEGORIES: ['주문', '결제', '배송', '취소', '불량', '기타']
  };

  // ===== 배송지 수정·추가 =====
  // 기본 배송지(base)는 샘플 배송지를 덮어쓰고, 추가 배송지(extras)는 일부 상품을 다른 곳으로 보내는 분할 배송지
  // 추가 배송지로 보낸 상품은 기본 배송지 상품에서 빠짐 (delivery.addresses[].items)
  // ADDRESS_FIELDS(배송지 항목)는 forEach보다 먼저 초기화되도록 파일 위쪽에 둠
  function applyAddressEdits(ord) {
    const d = ord.delivery, rec = ADDRS[ord.orderNo] || {};
    if (rec.base) Object.assign(d, rec.base);
    const extras = (rec.extras || []).map(x => Object.assign({}, x, { items: (x.items || []).filter(i => i < ord.items.length) }));
    const taken = new Set(extras.flatMap(x => x.items));
    const pick = src => Object.fromEntries(ADDRESS_FIELDS.map(([k]) => [k, src[k] || '']));
    d.addresses = [Object.assign({ id: 'base', label: '기본 배송지', items: ord.items.map((_, i) => i).filter(i => !taken.has(i)) }, pick(d))]
      .concat(extras.map((x, n) => Object.assign({ id: x.id, label: `추가 배송지 ${n + 1}`, items: x.items }, pick(x))));
  }
  // id = 'base' 이면 기본 배송지 수정, 'new' 이면 추가, 그 외는 추가 배송지 수정. data = ADDRESS_FIELDS 값 (+ 추가 배송지는 items)
  // 반환: { ok, id }
  function saveAddress(orderNo, id, data) {
    const rec = ADDRS[orderNo] || (ADDRS[orderNo] = { extras: [] });
    rec.extras = rec.extras || [];
    let savedId = id;
    if (id === 'base') rec.base = Object.assign({}, rec.base, data);
    else {
      // 한 상품은 한 배송지에만: 다른 추가 배송지에서 같은 상품을 뺌
      rec.extras.forEach(x => { if (x.id !== id) x.items = (x.items || []).filter(i => !(data.items || []).includes(i)); });
      if (id === 'new') { savedId = 'a' + Date.now().toString(36); rec.extras.push(Object.assign({ id: savedId }, data)); }
      else Object.assign(rec.extras.find(x => x.id === id) || {}, data);
    }
    try { localStorage.setItem(ADDR_KEY, JSON.stringify(ADDRS)); return { ok: true, id: savedId }; } catch (e) { return { ok: false, id: savedId }; }
  }
  // 추가 배송지 삭제 → 그 배송지 상품은 기본 배송지로 돌아감
  function deleteAddress(orderNo, id) {
    const rec = ADDRS[orderNo];
    if (!rec || !rec.extras) return true;
    rec.extras = rec.extras.filter(x => x.id !== id);
    try { localStorage.setItem(ADDR_KEY, JSON.stringify(ADDRS)); return true; } catch (e) { return false; }
  }

  // ===== 관리정보 (주문 상세 > 관리정보 탭) =====
  // 관리자 메모와 관리자 변경 이력을 주문별로 localStorage에 보관
  // { [orderNo]: { memos: [{ text, at, by }], history: [{ at, type, content, by }] } }
  // TODO: 실서비스에서는 GET/POST /api/admin/orders/{orderNo}/memos, /history (변경 API가 서버에서 이력 기록)
  function adminLog(orderNo) {
    const rec = LOGS[orderNo] || { memos: [], history: [] };
    // 구분·id가 없는 예전 메모 보정 (구분 '기타')
    rec.memos.forEach((mm, i) => { if (!mm.id) mm.id = `m${i}${mm.at.replace(/\D/g, '')}`; if (!mm.category) mm.category = '기타'; });
    return { memos: rec.memos.slice(), history: rec.history.slice() };
  }
  // 주문에 등록된 관리자 메모의 구분 목록 (중복 제거, 구분 없는 예전 메모는 '기타'). 주문 리스트 상담여부 > 관리자 메모 검색용
  function memoCategories(orderNo) {
    return [...new Set(((LOGS[orderNo] || {}).memos || []).map(mm => mm.category || '기타'))];
  }
  function saveLogs() {
    try { localStorage.setItem(LOG_KEY, JSON.stringify(LOGS)); return true; } catch (e) { return false; }
  }
  const logOf = orderNo => LOGS[orderNo] || (LOGS[orderNo] = { memos: [], history: [] });
  const nowText = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${fmtDate(d)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
  // 관리자 메모: { id, category, text, at, by, editedAt?, editedBy? }. 등록·수정·삭제 모두 주문 히스토리에 남김
  // category: 주문 / 결제 / 배송 / 취소 / 불량 / 기타. 반환: 저장 성공 여부
  const cut = t => (t.length > 40 ? t.slice(0, 40) + '…' : t);
  function addMemo(orderNo, category, text, by) {
    const at = nowText();
    logOf(orderNo).memos.push({ id: 'm' + Date.now().toString(36), category, text, at, by });
    logOf(orderNo).history.push({ at, type: '메모', content: `관리자 메모 등록 [${category}] ${cut(text)}`, by });
    return saveLogs();
  }
  function updateMemo(orderNo, id, category, text, by) {
    const mm = logOf(orderNo).memos.find(x => x.id === id);
    if (!mm) return false;
    const at = nowText();
    const changes = [mm.category !== category ? `구분 ${mm.category} → ${category}` : '', mm.text !== text ? `내용 "${cut(mm.text)}" → "${cut(text)}"` : ''].filter(Boolean);
    Object.assign(mm, { category, text, editedAt: at, editedBy: by });
    logOf(orderNo).history.push({ at, type: '메모', content: `관리자 메모 수정: ${changes.join(', ') || '변경 없음'}`, by });
    return saveLogs();
  }
  function deleteMemo(orderNo, id, by) {
    const log = logOf(orderNo);
    const mm = log.memos.find(x => x.id === id);
    if (!mm) return false;
    log.memos = log.memos.filter(x => x.id !== id);
    log.history.push({ at: nowText(), type: '메모', content: `관리자 메모 삭제 [${mm.category}] ${cut(mm.text)} (등록 ${mm.at} ${mm.by})`, by });
    return saveLogs();
  }
  // 관리자 변경 이력 추가 (주문취소·취소원복·추가결제 생성 등). 반환: 저장 성공 여부
  function addHistory(orderNo, type, content, by) {
    logOf(orderNo).history.push({ at: nowText(), type, content, by });
    return saveLogs();
  }
  // 주문 처리 과정에서 시스템이 남기는 이력 (샘플 데이터에서 만듦: 주문 접수·입금·증빙 발급·집하·배송완료 등)
  function systemHistory(ord) {
    const p = ord.payment, d = ord.delivery, out = [];
    const add = (at, type, content) => { if (at) out.push({ at, type, content, by: '시스템' }); };
    add(ord.orderedAt, '주문', `주문 접수 (${ord.orderedPayMethod || ord.payMethod}, 주문금액 ${ord.listPrice.toLocaleString()}원)`);
    if (ord.deposit) {
      // 관리자 입금 등록: 입금 건마다 한 줄 (후결제 분할 입금은 회차 표시). 마지막 입금으로 결제가 끝나면 결제완료/주문 접수 표시
      const ps = ord.deposit.payments, n = ps.length, post = ord.orderedPayMethod === '후결제';
      ps.forEach((x, i) => add(x.at, '결제', `입금 확인${n > 1 ? ` ${i + 1}회차` : ''} (${x.method} ${x.amount.toLocaleString()}원${x.memo ? ` · ${x.memo}` : ''}, 처리 ${x.by})`
        + (i === n - 1 ? (ord.deposit.full ? (post ? ' → 결제완료' : ' → 결제완료 · 주문 접수') : ` → 부분결제 (잔액 ${ord.deposit.remaining.toLocaleString()}원)`) : '')));
    } else {
      add(p.paidDateTime, '결제', ['무통장입금', '후결제'].includes(ord.payMethod) ? `입금 확인 (${p.total.toLocaleString()}원${ord.payMethod === '후결제' ? ', 후결제' : ''})` : `결제 승인 (${p.pgLog.pg}, 승인번호 ${p.pgLog.approvalNo})`);
    }
    if (p.docType && p.docAt) add(p.docAt, '서류발급', `${p.docType}${p.docPurpose ? `(${p.docPurpose})` : ''} 발급 완료`);
    if (d.shippedAt) add(d.shippedAt, '배송', `집하 스캔 (${d.courier}${d.waybill ? ` ${d.waybill}` : ''})`);
    if (d.doneAt) add(d.doneAt, '배송', '배송 완료');
    return out;
  }

  // 취소원복: 관리자가 취소한 상품의 취소 기록을 지움 → 다시 열면 취소 전 상태로 돌아감. 반환: 저장 성공 여부
  // (샘플 데이터에 처음부터 취소로 들어 있는 상품은 원복 대상이 아님)
  function restoreCancel(orderNo, idxs) {
    const rec = CANCELS[orderNo];
    if (!rec) return true;
    idxs.forEach(i => { delete rec.items[i]; });
    if (!Object.keys(rec.items).length) delete CANCELS[orderNo];
    try { localStorage.setItem(CANCEL_KEY, JSON.stringify(CANCELS)); return true; } catch (e) { return false; }
  }

  // 추가결제 생성: { amount, reason, method, memo, at, by, status } 를 주문에 추가. 반환: 저장 성공 여부
  function saveExtraRequest(orderNo, req) {
    (EXTRAS[orderNo] || (EXTRAS[orderNo] = [])).push(req);
    try { localStorage.setItem(EXTRA_KEY, JSON.stringify(EXTRAS)); return true; } catch (e) { return false; }
  }

  // 관리자 주문취소 저장: items = { [상품 index]: { amount, reason, refund, memo, at, by } }. 반환: 저장 성공 여부
  // 화면을 다시 열면 위 makeItems가 이 값을 읽어 상품을 취소 상태로 만듦
  function saveCancel(orderNo, items) {
    const rec = CANCELS[orderNo] || (CANCELS[orderNo] = { items: {} });
    Object.assign(rec.items, items);
    try { localStorage.setItem(CANCEL_KEY, JSON.stringify(CANCELS)); return true; } catch (e) { return false; }
  };
})();

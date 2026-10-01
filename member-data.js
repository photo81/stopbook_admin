// 회원 샘플 데이터 (회원 리스트 / 단체 회원 신청 화면 공유)
// TODO: 실서비스에서는 회원 API 응답으로 대체
(function () {
  'use strict';

  // ===== 샘플 데이터 (실서비스에서는 API 응답으로 대체) =====
  const LAST = ['김','이','박','최','정','강','조','윤','장','임','한','오','서','신','권'];
  const FIRST = ['민준','서연','도윤','지우','하준','서윤','예준','하은','시우','지민','주원','수아','지호','채원','현우'];
  const GRADE_ORDER = ['일반', '스타터', '홀리커', '마스터', '마스터 VIP'];   // 낮은 등급 → 높은 등급
  const GRADES = ['일반','일반','일반','스타터','스타터','홀리커','홀리커','마스터','마스터 VIP'];  // 샘플 분포

  let seed = 42;
  const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const pick = arr => arr[Math.floor(rand() * arr.length)];
  const pad = n => String(n).padStart(2, '0');
  const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const members = [];
  const base = new Date(2026, 9, 1).getTime();
  for (let i = 1; i <= 137; i++) {
    const join = new Date(base - Math.floor(rand() * 900) * 86400000);
    const last = new Date(Math.min(base, join.getTime() + Math.floor(rand() * 400) * 86400000));
    members.push({
      no: 1000 + i,
      category: rand() > 0.2 ? '일반' : '단체',
      memberType: (v => v > 0.35 ? '스탑북회원' : v > 0.2 ? '카카오회원' : v > 0.08 ? '네이버회원' : '구글회원')(rand()),
      userId: 'user' + String(i).padStart(3, '0'),
      name: pick(LAST) + pick(FIRST),
      email: `user${i}@example.com`,
      phone: `010-${String(1000 + Math.floor(rand() * 9000))}-${String(1000 + Math.floor(rand() * 9000))}`,
      grade: pick(GRADES),
      ...(mk => ({ marketingSms: mk > 0.4 ? 'Y' : 'N', marketingEmail: mk > 0.25 && mk < 0.85 ? 'Y' : 'N' }))(rand()),
      joinDate: fmtDate(join),
      lastLogin: fmtDate(last),
      memos: [],     // { text, at, by }
      history: [{ at: fmtDate(join) + ' 00:00', content: '회원 가입', by: '시스템' }]   // { at, content, by }
    });
  }

  // ===== 혜택 샘플 내역 =====
  // 내역(ledger)이 원장이고 보유량은 마지막 잔여값. 회원별 별도 난수로 생성해 위 회원 데이터에 영향 없음
  const BENEFITS = {
    mileage:  { label: '마일리지', unit: 'P',  plus: '지급', minus: '차감' },
    giftCard: { label: '상품권',   unit: '원', plus: '지급', minus: '차감' },
    coupon:   { label: '쿠폰',     unit: '장', plus: '지급', minus: '회수' }
  };
  const COUPONS = ['신규가입 10% 할인', '3,000원 할인', '무료배송', '생일축하 5,000원', '도서 2권 이상 15% 할인'];

  const fmtDateTime = d => `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

  function pushEntry(list, e) {
    e.balance = (list.length ? list[list.length - 1].balance : 0) + e.delta;
    list.push(e);
  }

  function heldCoupons(list) {
    const held = new Map();
    list.forEach(e => held.set(e.item, (held.get(e.item) || 0) + e.delta));
    return [...held].filter(([, n]) => n > 0);
  }

  function makeLedger(m) {
    let s = (m.no * 7919) % 233280;
    const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const from = new Date(m.joinDate).getTime();
    const dates = n => Array.from({ length: n }, () => new Date(from + r() * (base - from))).sort((a, b) => a - b);

    const mileage = [];
    dates(Math.floor(r() * 10)).forEach(d => {
      const bal = mileage.length ? mileage[mileage.length - 1].balance : 0;
      if (bal >= 1000 && r() < 0.35) {
        pushEntry(mileage, { at: fmtDateTime(d), type: '사용', item: '', reason: '도서 주문 시 사용', by: '시스템', delta: -Math.ceil(r() * bal / 100) * 100 });
      } else {
        pushEntry(mileage, { at: fmtDateTime(d), type: '적립', item: '', reason: r() < 0.7 ? '구매 확정 적립' : '리뷰 작성 적립', by: '시스템', delta: (1 + Math.floor(r() * 30)) * 100 });
      }
    });

    const giftCard = [];
    dates(Math.floor(r() * 4)).forEach(d => {
      const bal = giftCard.length ? giftCard[giftCard.length - 1].balance : 0;
      if (bal > 0 && r() < 0.5) {
        pushEntry(giftCard, { at: fmtDateTime(d), type: '사용', item: '', reason: '도서 주문 시 사용', by: '시스템', delta: -Math.min(bal, (1 + Math.floor(r() * 3)) * 5000) });
      } else {
        pushEntry(giftCard, { at: fmtDateTime(d), type: '등록', item: '', reason: '상품권 번호 등록', by: '회원', delta: [10000, 30000, 50000][Math.floor(r() * 3)] });
      }
    });

    const coupon = [];
    dates(Math.floor(r() * 7)).forEach(d => {
      const held = heldCoupons(coupon);
      if (held.length && r() < 0.4) {
        pushEntry(coupon, { at: fmtDateTime(d), type: r() < 0.7 ? '사용' : '만료', item: held[Math.floor(r() * held.length)][0], reason: '', by: '시스템', delta: -1 });
      } else {
        pushEntry(coupon, { at: fmtDateTime(d), type: '발급', item: COUPONS[Math.floor(r() * COUPONS.length)], reason: '이벤트 자동 발급', by: '시스템', delta: 1 });
      }
    });

    m.ledger = { mileage, giftCard, coupon };
    Object.keys(m.ledger).forEach(k => {
      const list = m.ledger[k];
      m[k] = list.length ? list[list.length - 1].balance : 0;
    });
  }
  members.forEach(makeLedger);

  // ===== 주문 실적 샘플 (등급 자동 산정용) =====
  // 주문 리스트 화면은 아직 없음. 등급 산정에 필요한 최소 정보(주문일·결제금액)만 회원별로 생성
  // TODO: 주문 리스트 구현 후 실제 주문 데이터(또는 GET /api/admin/members/{no}/order-stats)로 대체
  function makeOrders(m) {
    let s = (m.no * 104729) % 233280;
    const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const from = Math.max(new Date(m.joinDate).getTime(), base - 365 * 86400000);
    const n = r() < 0.25 ? 0 : Math.floor(r() * 25);
    m.orders = Array.from({ length: n }, () => ({
      at: fmtDate(new Date(from + r() * (base - from))),
      amount: (80 + Math.floor(r() * 520)) * 100   // 8,000 ~ 60,000원
    })).sort((a, b) => a.at.localeCompare(b.at));
  }
  members.forEach(makeOrders);

  // ===== 이용 정보 샘플 (회원 상세 > 이용 정보: 주문 내역·문의 이력·장바구니) =====
  // 위 주문 실적(일자·금액)은 등급 산정에 쓰이므로 그대로 두고, 표시용 상세 정보만 별도 난수로 덧붙임
  // TODO: 실서비스에서는 GET /api/admin/members/{no}/orders | inquiries | cart 로 대체
  // 스탑북(www.stopbook.com) 판매 상품 기준 [상품명, 카테고리, 판매가(기본 옵션 시작가)] (2026-10-01 확인)
  // TODO: 실서비스에서는 상품 마스터에서 조회
  const PRODUCTS = [
    ['마이트립북', '포토북', 28900], ['조이풀트립', '포토북', 17500], ['시티북 A5', '포토북', 21000],
    ['트래블북 A5', '포토북', 21000], ['팔레트', '포토북', 17500], ['메모리북', '포토북', 28900],
    ['포토로그북', '포토북', 21200], ['레코드북', '포토북', 32800], ['러블리커플', '포토북', 17500],
    ['타임레코드', '포토북', 17500],
    ['비트윈캘린더', '캘린더', 16000], ['스탠다드 캘린더', '캘린더', 14000], ['우드월캘린더', '캘린더', 26000],
    ['우드스탠드 캘린더', '캘린더', 22000],
    ['원목액자', '액자', 17360], ['심플액자', '액자', 9660], ['프리미엄 아크릴액자', '액자', 50800], ['감성액자', '액자', 11830],
    ['엽서', '팬시·굿즈', 2100], ['포토노트', '팬시·굿즈', 4800], ['포토엽서', '팬시·굿즈', 18000], ['미니배너', '팬시·굿즈', 3700]
  ];
  // 카테고리별 옵션 예시 (장바구니 미리보기에 표시)
  const OPTIONS = {
    '포토북': ['하드커버 · 24페이지', '소프트커버 · 30페이지', '레이플랫 · 40페이지'],
    '캘린더': ['2027년 · 1월 시작', '2027년 · 3월 시작'],
    '액자': ['5x7 · 화이트', '8x10 · 내추럴', 'A4 · 블랙'],
    '팬시·굿즈': ['무광 코팅', '유광 코팅', '기본']
  };
  const PROJECT_NAMES = ['제주 여름 여행', '우리 아이 첫돌', '가족 사진 모음', '2026 졸업 기념', '커플 100일', '반려견 일기', '부모님 선물', '동아리 추억'];
  // 장바구니 작업물 미리보기(스탑북 뷰어). 샘플은 모든 상품에 같은 예시 작업물을 연결
  // TODO: 실서비스에서는 장바구니 항목의 작업 키(mskey)와 고객 아이디(user_id)로 주소를 만듦
  const VIEWER_SAMPLE = { mskey: '612574', userId: 'jy811228' };
  const viewerUrl = (mskey, userId) =>
    `https://www.stopbook.com/viewer/viewer_mobile.asp?mskey=${encodeURIComponent(mskey)}&user_id=${encodeURIComponent(userId)}`;
  const PAY_METHODS = ['신용카드', '신용카드', '카카오페이', '네이버페이', '무통장입금', '마일리지+카드'];
  const INQ_TYPES = ['주문/결제', '배송', '상품', '교환/반품', '회원정보', '기타'];
  const INQ_SAMPLES = {
    '주문/결제': ['결제 수단을 변경하고 싶어요', '주문 후 영수증 발급 문의', '카드 결제가 두 번 된 것 같아요'],
    '배송': ['언제 도착하나요?', '배송지를 변경할 수 있나요?', '택배가 분실된 것 같아요'],
    '상품': ['포토북 페이지를 추가할 수 있나요?', '캘린더 시작 월을 바꾸고 싶어요', '액자 사이즈 문의'],
    '교환/반품': ['인쇄 불량으로 재제작 요청합니다', '사진 색감이 화면과 달라요'],
    '회원정보': ['등급 산정 기준이 궁금해요', '휴대폰 번호 변경 방법'],
    '기타': ['단체 대량 제작 견적 요청', '졸업앨범 제작 문의']
  };

  function makeUsage(m) {
    let s = (m.no * 7907 + 13) % 233280;
    const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const pickR = arr => arr[Math.floor(r() * arr.length)];
    const daysAgo = d => Math.floor((base - new Date(d).getTime()) / 86400000);

    // 주문 상세: 일자·금액은 기존 값 유지(등급 산정용), 상품명·수량·상태·결제수단만 채움
    // 상태(주문 제작 흐름): 주문완료 → 제작중 → 발송완료
    //   2일 이내 주문완료·제작중 / 3~6일 제작중·발송완료 / 7일 이상 발송완료
    (m.orders || []).forEach((o, i) => {
      const p = pickR(PRODUCTS);
      const qty = 1 + Math.floor(r() * 3);
      const kinds = 1 + Math.floor(r() * 3);
      const d = daysAgo(o.at);
      Object.assign(o, {
        orderNo: `${o.at.replace(/-/g, '')}-${String(m.no).slice(-3)}${String(i + 1).padStart(2, '0')}`,
        title: kinds > 1 ? `${p[0]} 외 ${kinds - 1}종` : p[0],
        productCategory: p[1],
        qty: qty + kinds - 1,
        status: d <= 2 ? pickR(['주문완료', '제작중']) : d <= 6 ? pickR(['제작중', '발송완료']) : '발송완료',
        payMethod: pickR(PAY_METHODS)
      });
    });

    // 문의 이력: 0~5건, 최근 문의 일부는 답변 대기
    const from = new Date(m.joinDate).getTime();
    m.inquiries = Array.from({ length: Math.floor(r() * r() * 6) }, (_, i) => {
      const type = pickR(INQ_TYPES);
      const at = new Date(from + r() * (base - from));
      const waiting = (base - at.getTime()) < 5 * 86400000 || r() < 0.08;
      const ans = new Date(at.getTime() + (2 + Math.floor(r() * 40)) * 3600000);
      return {
        no: m.no * 10 + i, type, title: pickR(INQ_SAMPLES[type]),
        at: fmtDateTime(at),
        content: '안녕하세요. 문의드립니다. 확인 부탁드립니다.',
        status: waiting ? '답변대기' : '답변완료',
        answeredAt: waiting ? '' : fmtDateTime(ans),
        answer: waiting ? '' : '안녕하세요, 스탑북입니다. 문의하신 내용 확인하여 처리해 드렸습니다. 감사합니다.',
        answeredBy: waiting ? '' : '상담원'
      };
    }).sort((a, b) => b.at.localeCompare(a.at));

    // 장바구니: 0~5개 상품. 주문 제작 상품이라 고객이 편집해 둔 작업물(프로젝트) 단위로 담김
    // price = 판매가(기본 옵션), savedAt = 장바구니에 보관한 날
    const used = new Set();
    m.cart = Array.from({ length: Math.floor(r() * 6) }, () => {
      let p; do { p = pickR(PRODUCTS); } while (used.has(p[0]) && used.size < PRODUCTS.length);
      used.add(p[0]);
      return {
        title: p[0], productCategory: p[1], price: p[2],
        option: pickR(OPTIONS[p[1]]),
        project: pickR(PROJECT_NAMES),
        qty: 1 + Math.floor(r() * r() * 3),
        savedAt: fmtDate(new Date(base - Math.floor(r() * 30) * 86400000)),
        previewUrl: viewerUrl(VIEWER_SAMPLE.mskey, VIEWER_SAMPLE.userId)
      };
    });
  }
  members.forEach(makeUsage);

  // 기간(YYYY-MM-DD, 양끝 포함) 내 주문횟수·주문금액 합계
  function orderStats(m, from, to) {
    return (m.orders || []).filter(o => o.at >= from && o.at <= to)
      .reduce((acc, o) => ({ count: acc.count + 1, amount: acc.amount + o.amount }), { count: 0, amount: 0 });
  }

  // 후불 결제 샘플: 단체 회원 일부에 올해 적용
  members.forEach(m => {
    const on = m.category === '단체' && m.no % 2 === 0;
    Object.assign(m, { postpay: on ? 'Y' : 'N', postpayFrom: on ? '2026-01-01' : '', postpayTo: on ? '2026-12-31' : '' });
  });

  // ===== 단체 회원 신청 =====
  // 기본 신청 데이터는 고정 생성, 관리자 처리 결과(승인/반려/히스토리)만 localStorage에 저장해 덮어씀
  // TODO: 실서비스에서는 GET /api/admin/group-applications, POST .../{no}/approve|reject 로 대체
  const APP_KEY = 'stopbook.groupApplications.v3';   // v3: 승인 시 회원 구분·종류 지정(assign*) 저장, 고객 단체 유형은 변경 안 함
  // 단체 유형별 샘플 사업자 정보. 유형 이름은 회원 유형 관리 > 구분 > 단체의 단체 유형 기본값과 같게 유지
  const GROUP_TYPES = {
    '기관':     { names: ['가람시 평생학습관', '나래구 청소년수련관', '책마루도서관'], bizType: '공공행정', bizItem: '평생교육' },
    '회사':     { names: ['(주)새벽북스', '(주)온누리교육', '누리소프트(주)'], bizType: '도소매업', bizItem: '서적' },
    '학교':     { names: ['한빛초등학교', '새솔중학교', '다온고등학교'], bizType: '교육 서비스업', bizItem: '초중등 교육' },
    '유치원':   { names: ['햇살유치원', '꿈나무유치원'], bizType: '교육 서비스업', bizItem: '유아 교육' },
    '어린이집': { names: ['푸른숲어린이집', '새싹어린이집'], bizType: '보건업 및 사회복지 서비스업', bizItem: '보육시설 운영' },
    '동호회':   { names: ['책읽는엄마들 독서모임', '시냇가 북클럽'], bizType: '비영리', bizItem: '독서모임' },
    '기타':     { names: ['지혜샘학원', '글빛논술학원'], bizType: '교육 서비스업', bizItem: '교습학원' }
  };
  const ADDRESSES = ['서울특별시 마포구 월드컵북로 12', '경기도 성남시 분당구 판교로 45', '부산광역시 해운대구 센텀로 8', '대전광역시 유성구 대학로 99', '인천광역시 연수구 송도과학로 31'];
  const typeKeys = Object.keys(GROUP_TYPES);

  // 회원 구분 참조: categoryCode(기준, 회원 유형 관리의 구분 code) + category(표시명)
  // 회원의 종류(subCategory) 샘플: 단체 회원은 종류 중 하나, 그 외는 없음
  // 승인된 단체 신청 회원은 아래 applyApproval에서 관리자가 지정한 구분·종류로 덮어씀
  members.forEach(m => {
    m.categoryCode = m.category === '단체' ? 'group' : 'normal';
    m.subCategory = m.category === '단체' ? typeKeys[m.no % typeKeys.length] : '';
  });

  function loadAppOverlay() {
    try { return JSON.parse(localStorage.getItem(APP_KEY)) || {}; } catch (e) { return {}; }
  }
  const appOverlay = loadAppOverlay();

  // 일반 구분 회원 중 일부가 신청한 것으로 생성 (최근 신청이 위)
  const applications = members.filter(m => m.category === '일반').filter((_, i) => i % 8 === 3).map((m, k) => {
    const groupType = typeKeys[k % typeKeys.length];
    const t = GROUP_TYPES[groupType];
    const appliedAt = new Date(base - k * 2 * 86400000 - (k * 37 % 600) * 60000);
    const app = {
      appNo: 501 + k,
      userId: m.userId,
      groupType,
      appliedAt: fmtDateTime(appliedAt),
      business: {
        companyName: t.names[k % t.names.length],
        bizNo: `${String(105 + (k * 37) % 800)}-${String(10 + (k * 7) % 89)}-${String(10000 + (k * 4567) % 89999)}`,
        ceo: k % 2 ? m.name : LAST[(k + 3) % LAST.length] + FIRST[(k * 5) % FIRST.length],
        openDate: `20${String(10 + (k * 3) % 15)}-${pad(1 + k % 12)}-${pad(1 + (k * 5) % 28)}`,
        bizType: t.bizType,
        bizItem: t.bizItem,
        address: `${ADDRESSES[k % ADDRESSES.length]} ${k % 4 + 1}층`,
        managerName: m.name,
        managerPhone: m.phone,
        managerEmail: m.email,
        certFile: `사업자등록증_${m.userId}.${k % 3 ? 'jpg' : 'pdf'}`
      },
      // 예시: 일부는 이미 처리된 상태
      status: k % 5 === 4 ? '승인' : k % 7 === 6 ? '반려' : '대기',
      processedAt: '', processedBy: '', rejectReason: '', periodFrom: '', periodTo: '', expireTo: '',
      history: [{ at: fmtDateTime(appliedAt), content: `단체 회원 신청 (${groupType})`, by: '고객' }]
    };
    if (app.status !== '대기') {
      const at = fmtDateTime(new Date(appliedAt.getTime() + 86400000));
      Object.assign(app, { processedAt: at, processedBy: '관리자' });
      if (app.status === '반려') app.rejectReason = '사업자등록증 이미지가 흐려 등록번호를 확인할 수 없습니다. 선명한 이미지로 다시 신청해 주세요.';
      if (app.status === '승인') {
        const d = new Date(appliedAt.getTime() + 86400000);
        app.periodFrom = fmtDate(d);
        // 예시: 한 건은 기간이 이미 끝나 자동 전환되는 경우를 보여주도록 어제 만료
        app.periodTo = k === 9 ? fmtDate(new Date(Date.now() - 86400000))
          : fmtDate(new Date(d.getFullYear() + 1, d.getMonth(), d.getDate() - 1));
        app.expireTo = '일반';
        app.expireToCode = 'normal';
        // 승인 시 관리자가 지정한 회원 구분·종류 (샘플은 단체 + 고객이 고른 단체 유형)
        Object.assign(app, { assignCategoryCode: 'group', assignCategory: '단체', assignKind: groupType });
      }
      app.history.push({ at, content: app.status === '승인' ? `승인 처리 (적용 기간 ${app.periodFrom} ~ ${app.periodTo}, 만료 후 '${app.expireTo}' 전환)` : `반려 처리 (사유: ${app.rejectReason})`, by: '관리자' });
    }
    return Object.assign(app, appOverlay[app.appNo] || {});
  });

  // 고객이 입력한 단체 유형(groupType)은 바꾸지 않으므로 저장 대상이 아님
  function saveApplication(app) {
    const keys = ['status', 'processedAt', 'processedBy', 'rejectReason', 'periodFrom', 'periodTo', 'expireTo', 'expireToCode',
      'assignCategoryCode', 'assignCategory', 'assignKind', 'revokedAt', 'revokedBy', 'expiredAt', 'history'];
    appOverlay[app.appNo] = Object.fromEntries(keys.map(k => [k, app[k]]));
    try { localStorage.setItem(APP_KEY, JSON.stringify(appOverlay)); return true; } catch (e) { return false; }
  }

  // 승인된 신청 → 관리자가 지정한 구분·종류로 회원 구분을 바꾸고 기본 정보 하단에 사업자 정보 추가
  function applyApproval(app) {
    const m = members.find(x => x.userId === app.userId);
    if (!m) return;
    m.categoryCode = app.assignCategoryCode || 'group';
    m.category = app.assignCategory || '단체';   // 표시명은 화면에서 code 기준으로 다시 맞춤
    m.subCategory = app.assignKind !== undefined ? app.assignKind : app.groupType;
    m.business = Object.assign({ groupType: app.groupType, approvedAt: app.processedAt, appNo: app.appNo,
      periodFrom: app.periodFrom, periodTo: app.periodTo, expireTo: app.expireTo || '일반' }, app.business);
    m.history.push({ at: app.processedAt, content: `단체 회원 승인: ${app.business.companyName} (${app.business.bizNo}), 적용 기간 ${app.periodFrom} ~ ${app.periodTo}`, by: app.processedBy });
  }
  // 회원 정보에서 구분을 단체 → 일반으로 바꾼 경우: 사업자 정보 삭제 + 신청 건을 '해제'로 기록
  function revokeBusiness(m, by) {
    const app = m.business && applications.find(a => a.appNo === m.business.appNo);
    delete m.business;
    if (!app) return;
    const at = fmtDateTime(new Date());
    Object.assign(app, { status: '해제', revokedAt: at, revokedBy: by });
    app.history.push({ at, content: '단체 회원 해제 (회원 정보에서 구분 일반으로 변경, 사업자 정보 삭제)', by });
    saveApplication(app);
  }

  // 적용 기간 만료: 종료일이 지난 승인 건은 '만료'로 바꾸고 지정한 구분으로 자동 전환
  // TODO: 실서비스에서는 매일 00:00 서버 배치로 처리 (여기서는 화면을 열 때 처리)
  const todayStr = fmtDate(new Date());
  applications.forEach(a => {
    if (a.status !== '승인' || !a.periodTo || a.periodTo >= todayStr) return;
    const end = new Date(a.periodTo);
    a.expiredAt = `${fmtDate(new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1))} 00:00`;
    a.status = '만료';
    a.history.push({ at: a.expiredAt, content: `적용 기간 만료 → 구분 '${a.expireTo || '일반'}' 자동 전환, 사업자 정보 삭제`, by: '시스템' });
    saveApplication(a);
  });

  // 페이지 로드 시 처리 결과 반영: 승인 → 사업자 정보 등록 / 해제·만료 → 승인 후 삭제된 이력만 남김
  applications.forEach(a => {
    if (!['승인', '해제', '만료'].includes(a.status)) return;
    applyApproval(a);
    const m = members.find(x => x.userId === a.userId);
    if (!m || a.status === '승인') return;
    const biz = `${a.business.companyName} (${a.business.bizNo})`;
    m.subCategory = '';
    if (a.status === '해제') {
      m.category = '일반';
      m.categoryCode = 'normal';
      m.history.push({ at: a.revokedAt, content: `사업자 정보 삭제: ${biz} - 구분 일반 변경`, by: a.revokedBy });
    } else {
      const to = a.expireTo || '일반';
      m.history.push({ at: a.expiredAt, content: `단체 회원 기간 만료: 구분 ${m.category} → ${to} 자동 전환, 사업자 정보 삭제 (${biz})`, by: '시스템' });
      m.category = to;
      m.categoryCode = a.expireToCode || '';   // 없으면 화면에서 이름으로 찾아 채움
    }
    delete m.business;
  });

  window.MemberData = {
    members, GRADE_ORDER, BENEFITS, COUPONS, pad, fmtDate, fmtDateTime, pushEntry, heldCoupons, orderStats,
    applications, saveApplication, applyApproval, revokeBusiness, GROUP_TYPES: typeKeys
  };
})();

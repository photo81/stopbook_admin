// 1:1 문의 데이터 (게시글관리 > 1:1 문의 관리)
// member-type-store.js, member-data.js, order-data.js, inquiry-settings.js 다음에 로드
//   문의 원본 = 회원 상세 > 이용 정보 > 문의 이력과 같은 데이터 (member-data.js m.inquiries) → 회원 화면·대시보드·주문 리스트 상담여부와 건수가 맞음
//   처리 상태: 대기(담당자 없음) → 확인중(담당자 지정) → 완료(답변 등록). 회원 화면에는 대기·확인중 = 답변대기, 완료 = 답변완료
//   관리자가 처리한 내용(담당자·유형·태그·임시 저장·답변·처리 이력)은 localStorage에 문의 번호별로 보관 → member-data.js도 같은 값을 읽어 반영
// TODO: 실서비스에서는 GET /api/admin/inquiries, GET /api/admin/inquiries/{no}, POST /api/admin/inquiries/{no}/assign|classify|reply
(function () {
  'use strict';
  const KEY = 'stopbook.inquiries.v1';
  const pad = n => String(n).padStart(2, '0');
  const nowText = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const addHours = (s, h) => { const d = new Date(new Date(s.replace(' ', 'T')).getTime() + h * 3600000); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const hash = (s, seed) => [...String(s)].reduce((h, c) => (h * 73 + c.charCodeAt(0)) % 233280, seed);
  const rng = (s, seed) => { let x = hash(s, seed); return () => (x = (x * 9301 + 49297) % 233280) / 233280; };
  const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const textToHtml = s => escHtml(s).replace(/\n/g, '<br>');

  const STATUSES = ['대기', '확인중', '완료'];
  // 문의 유형·태그 목록은 1:1 문의하기 관리(inquiry-settings.js)에서 관리. 유형 이름을 바꾸면 예전 이름의 문의도 새 이름으로 보여 줌
  const S = window.InquirySettings;
  const canonicalType = name => (S ? S.canonicalType(name) : name);
  const AGENTS = ['김지영', '김태복', '창경훈', '최의담', '이고은'];   // 처리 담당자 (관리자 실명). TODO: 관리자 계정 관리의 상담 권한 계정
  // 문의 유형·제목별 기본 태그 (샘플)
  const TAG_OF = {
    '결제 수단을 변경하고 싶어요': ['결제'], '주문 후 영수증 발급 문의': ['영수증'], '카드 결제가 두 번 된 것 같아요': ['결제', '주문취소'],
    '언제 도착하나요?': ['배송조회'], '배송지를 변경할 수 있나요?': ['배송조회'], '택배가 분실된 것 같아요': ['배송조회'],
    '포토북 페이지를 추가할 수 있나요?': ['편집'], '캘린더 시작 월을 바꾸고 싶어요': ['편집'], '액자 사이즈 문의': ['편집'],
    '인쇄 불량으로 재제작 요청합니다': ['인쇄불량'], '사진 색감이 화면과 달라요': ['인쇄불량'],
    '등급 산정 기준이 궁금해요': ['회원정보'], '휴대폰 번호 변경 방법': ['회원정보'],
    '단체 대량 제작 견적 요청': ['단체견적'], '졸업앨범 제작 문의': ['단체견적']
  };
  // 첨부 사진 샘플 (제목별 파일 이름). 실제 이미지는 없어 화면에서 견본 이미지로 그림
  const FILES_OF = {
    '인쇄 불량으로 재제작 요청합니다': ['불량사진1.png', '불량사진2.png'], '사진 색감이 화면과 달라요': ['인쇄물_사진.png'],
    '카드 결제가 두 번 된 것 같아요': ['승인문자_캡처.png'], '택배가 분실된 것 같아요': ['배송조회_캡처.png'],
    '포토북 페이지를 추가할 수 있나요?': ['편집화면.png'], '휴대폰 번호 변경 방법': ['인증오류_화면.png']
  };
  const ORDER_TYPES = ['주문/결제', '배송', '상품', '교환/반품'];   // 주문과 연결해 보여 주는 유형

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const edits = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(edits)); return true; } catch (e) { return false; } };

  // 회원별 주문 (문의 시점에 가장 가까운 이전 주문을 연결)
  const ordersByUser = {};
  OrderData.ORDERS.forEach(o => { (ordersByUser[o.userId] || (ordersByUser[o.userId] = [])).push(o); });
  const orderBefore = (userId, at) => (ordersByUser[userId] || [])
    .filter(o => o.orderedAt <= at && o.orderedAt.slice(0, 10) >= addHours(at, -24 * 45).slice(0, 10))
    .sort((a, b) => b.orderedAt.localeCompare(a.orderedAt))[0] || null;

  // ===== 문의 목록 =====
  const BASE_END = OrderData.TODAY.getTime() + 86400000;   // 샘플 기준일 끝
  const inquiries = [];
  MemberData.members.forEach(m => (m.inquiries || []).forEach(cur => {
    const src = Object.assign({}, cur, cur.sample || {});   // 관리자 처리 전 샘플 값 기준 (처리 내용은 아래에서 덮어씀)
    const r = rng(src.no, 97);
    const ov = edits[src.no] || {};
    const order = ORDER_TYPES.includes(src.type) ? orderBefore(m.userId, src.at) : null;
    const done = src.status === '답변완료';
    // 샘플 담당자: 답변완료 = 답변자, 답변대기 중 접수 하루가 지난 건의 일부는 담당자 지정(확인중)
    const age = (BASE_END - new Date(src.at.replace(' ', 'T')).getTime()) / 86400000;   // 샘플 기준일 기준 (날짜가 지나도 샘플이 바뀌지 않게)
    const sampleAgent = done ? src.answeredBy : (age > 1 && r() < 0.55 ? AGENTS[Math.floor(r() * AGENTS.length)] : '');
    // 문의유형·태그는 관리자가 답변하며 정하는 분류 → 샘플 태그는 답변 완료 건에만 (답변 전 문의는 관리자가 직접 설정)
    const tags = done ? (TAG_OF[src.title] || []) : [];
    const q = {
      no: src.no,
      inquiryNo: `Q${src.at.slice(0, 10).replace(/-/g, '')}-${String(src.no).padStart(5, '0')}`,
      at: src.at,
      member: m, name: m.name, userId: m.userId, email: m.email, phone: m.phone, category: m.category,
      type: src.type, subject: src.title, content: src.content,
      orderNo: order ? order.orderNo : '',
      files: FILES_OF[src.title] || [],
      tags: ov.tags || tags,
      assignee: ov.assignee !== undefined ? ov.assignee : sampleAgent,
      status: done ? '완료' : sampleAgent ? '확인중' : '대기',
      replyHtml: done ? textToHtml(src.answer) : '',
      answer: done ? src.answer : '',
      answeredAt: src.answeredAt || '', answeredBy: src.answeredBy || '',
      draft: '',
      log: [{ at: src.at, text: '고객 문의 접수', by: m.name }]
        .concat(sampleAgent ? [{ at: done ? addHours(src.at, 1) : addHours(src.at, 20), text: `처리 담당자 지정: ${sampleAgent}`, by: sampleAgent }] : [])
        .concat(done ? [{ at: src.answeredAt, text: '답변 완료', by: src.answeredBy }] : [])
    };
    // 관리자 처리 내용 덮어쓰기 (member-data.js가 이미 반영한 type·답변도 여기서 다시 맞춤)
    ['type', 'status', 'replyHtml', 'answer', 'answeredAt', 'answeredBy', 'draft'].forEach(k => { if (ov[k] !== undefined) q[k] = ov[k]; });
    if (ov.log) q.log = q.log.concat(ov.log);
    q.type = canonicalType(q.type);
    inquiries.push(q);
  }));
  inquiries.sort((a, b) => b.at.localeCompare(a.at) || b.no - a.no);

  const find = no => inquiries.find(q => String(q.no) === String(no)) || null;
  const orderOf = q => (q.orderNo ? OrderData.find(q.orderNo) : null);
  // 같은 회원의 다른 문의 (문의 이력)
  const historyOf = q => inquiries.filter(x => x.userId === q.userId && x.no !== q.no);

  // 주문 히스토리용 문의 이력 (주문 상세 > 주문 히스토리, order-detail.html): 주문과 연결된 문의의 접수·담당자 지정·유형 변경·답변 완료·수정
  //   문의 처리 이력(q.log)을 그대로 옮겨 보여 주므로 1:1 문의 관리에서 처리하면 주문 히스토리에도 바로 남음. 임시 저장은 내부 작업이라 제외
  const orderHistory = orderNo => inquiries.filter(q => q.orderNo === orderNo).flatMap(q => q.log
    .filter(l => l.text !== '답변 임시 저장')
    .map(l => ({ at: l.at, type: '문의', by: l.by,
      content: l.text === '고객 문의 접수' ? `1:1 문의 접수 (${q.inquiryNo}) · [${q.type}] ${q.subject}` : `1:1 문의 ${l.text} (${q.inquiryNo})` })));

  // 저장: 바뀐 항목 + 처리 이력 한 줄
  function update(q, fields, logText, by) {
    Object.assign(q, fields);
    const ov = edits[q.no] || (edits[q.no] = {});
    Object.assign(ov, fields);
    if (logText) {
      const entry = { at: nowText(), text: logText, by };
      q.log.push(entry);
      (ov.log || (ov.log = [])).push(entry);
    }
    const ok = save();
    syncNewCount();   // 담당자 지정 등으로 대기 건수가 바뀌면 새 글 알림도 갱신
    return ok;
  }
  // 담당자 지정: 대기 → 확인중 (완료 건은 상태 유지)
  const assign = (q, name, by) => update(q, { assignee: name, status: q.status === '대기' ? '확인중' : q.status }, `처리 담당자 지정: ${name}`, by);
  const classify = (q, type, by) => (type === q.type ? true : update(q, { type }, `문의 유형 변경: ${q.type} → ${type}`, by));
  const setTags = (q, tags) => update(q, { tags });
  const saveDraft = (q, html, by) => update(q, { draft: html }, '답변 임시 저장', by);
  // 답변 완료: 답변자 = 처리 담당자
  const complete = (q, html, text, by) => update(q, { status: '완료', replyHtml: html, answer: text, answeredAt: nowText(), answeredBy: q.assignee || by, draft: '' }, `답변 완료 (문의유형 ${q.type}${q.tags.length ? ` · 태그 ${q.tags.join(', ')}` : ''}, 고객에게 답변 알림 발송)`, by);
  const editReply = (q, html, text, by) => update(q, { replyHtml: html, answer: text }, '답변 수정', by);

  // 새 글 알림 (member-type-store.js refreshNewMarks): 새로 접수돼 아직 담당자가 없는 문의(대기) 건수
  const newCount = () => inquiries.filter(q => q.status === '대기').length;
  const syncNewCount = () => { if (window.AdminUtil && AdminUtil.refreshNewMarks) AdminUtil.refreshNewMarks(); };

  window.InquiryData = { STATUSES, AGENTS, inquiries, find, orderOf, historyOf, orderHistory, newCount, assign, classify, setTags, saveDraft, complete, editReply, textToHtml };
})();

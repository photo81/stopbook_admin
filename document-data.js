// 서류 발급 데이터 (클레임관리 > 서류 발급 관리)
// member-type-store.js, member-data.js, order-data.js 다음에 로드
//   자동 발급 이력: 고객이 쇼핑몰(주문서·마이페이지·주문 상세)에서 요청하면 시스템이 바로 만들어 내려주는 서류의 발급 기록
//     사업자등록증·통장사본 = 회사(스탑북) 서류 (고객사 결제·거래처 등록용), 견적서·거래명세서 = 주문 기준으로 자동 생성
//     현금영수증·세금계산서 = 결제 시 요청(order-data.js payment.docType) → 결제 확인 후 자동 발급
//   별도 발급 신청: 자동 발급으로는 안 되는 서류(기관 양식·직인 날인·수신처 변경·납품확인서·세금계산서 수정발행 등)를 고객이 따로 신청한 건.
//     관리자가 서류를 만들어 전달(발급 완료)하거나 반려. 처리한 신청은 localStorage에 통째로 보관해 다시 열 때 그대로 복원
// TODO: 실서비스에서는 GET /api/admin/documents/issues, GET /api/admin/documents/requests, POST /api/admin/documents/requests/{reqNo}/complete|reject
(function () {
  'use strict';
  const { ORDERS, TODAY } = OrderData;
  const KEYS = { requests: 'stopbook.docRequests.v1', issues: 'stopbook.docIssues.v1' };
  const DAY = 86400000, HOUR = 3600000;
  const pad = n => String(n).padStart(2, '0');
  const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fmtDt = d => `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const daysAgo = n => fmtDate(new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() - n));
  const nowText = () => fmtDt(new Date());
  const toTime = s => new Date(s.replace(' ', 'T')).getTime();
  const clampNow = t => new Date(Math.min(TODAY.getTime() + DAY - 60000, t));
  const hash = (s, seed) => [...s].reduce((h, c) => (h * 73 + c.charCodeAt(0)) % 233280, seed);
  const rng = (s, seed) => { let x = hash(s, seed); return () => (x = (x * 9301 + 49297) % 233280) / 233280; };
  const pick = (arr, r) => arr[Math.floor(r() * arr.length)];

  const STATUS_TEXT = { '대기': '처리 대기', '완료': '발급 완료', '반려': '반려' };
  // 자동 발급 서류 종류 (발급 경로)
  const AUTO_TYPES = ['사업자등록증', '통장사본', '견적서', '거래명세서', '현금영수증', '세금계산서'];
  const CHANNEL_OF = { '사업자등록증': '마이페이지', '통장사본': '마이페이지', '견적서': '주문서', '거래명세서': '주문 상세', '현금영수증': '결제 확인', '세금계산서': '결제 확인' };
  // 별도 발급 신청 서류 종류 + 신청 샘플의 요청 사항
  const REQUEST_TYPES = ['견적서', '거래명세서', '납품확인서', '거래사실확인서', '세금계산서 수정발행', '사업자등록증', '통장사본', '기타'];
  const REQUIREMENTS = {
    '견적서': ['기관 제출용 견적서 (공급가액·부가세 분리 표기, 담당자 직인 날인 필요)', '견적 유효기간 30일로 표기하고 수신처를 "○○초등학교 행정실"로 넣어 주세요.', '품목을 "포토북 제작" 한 줄로 합산 표기한 견적서가 필요합니다.'],
    '거래명세서': ['학교 행정실 제출용 (첨부한 기관 양식에 맞춰 작성, 직인 날인)', '수신처를 사업자명이 아닌 "○○유치원"으로 변경해서 발급해 주세요.', '상품별 단가·수량이 모두 표기된 거래명세서 (품의 첨부용)'],
    '납품확인서': ['납품일·납품 수량 확인 서명이 들어간 납품확인서 (기관 양식 첨부)', '지출 증빙용 납품확인서, 담당자 날인 필요'],
    '거래사실확인서': ['회계 감사용 거래사실확인서 (최근 1년 거래 내역 포함)', '지원금 정산용 거래사실확인서'],
    '세금계산서 수정발행': ['사업자등록번호를 잘못 넣었습니다. 올바른 번호로 수정발행 요청드립니다.', '공급받는자 상호가 바뀌어 수정발행이 필요합니다.'],
    '사업자등록증': ['원본대조필 직인 날인본이 필요합니다. (우편 수령)', '거래처 등록용, 스캔본 외 날인본으로 이메일 송부 요청'],
    '통장사본': ['원본대조필 직인 날인본 (기관 회계 제출용)'],
    '기타': ['입금확인서 (입금일·입금액 기재) 발급 요청', '계약서(공급 계약) 양식 송부 요청']
  };
  const RECEIVE_METHODS = ['이메일', '팩스', '우편'];
  const FAXES = ['02-3141-2200', '031-702-8800', '051-630-1200', '042-480-7700'];

  const loadOverlay = key => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; } };
  const loadList = key => { try { return JSON.parse(localStorage.getItem(key)) || []; } catch (e) { return []; } };
  const overlay = loadOverlay(KEYS.requests);
  const adminIssues = loadList(KEYS.issues);
  const saveReq = req => { overlay[req.reqNo] = JSON.parse(JSON.stringify(req)); try { localStorage.setItem(KEYS.requests, JSON.stringify(overlay)); return true; } catch (e) { return false; } };
  const saveIssues = () => { try { localStorage.setItem(KEYS.issues, JSON.stringify(adminIssues)); return true; } catch (e) { return false; } };

  const orderOf = x => (x.orderNo ? OrderData.find(x.orderNo) : null);
  const fileOf = (type, o) => `${type.replace(/ /g, '_')}_${o ? o.orderNo : 'STOPBOOK'}.pdf`;

  // ===== 자동 발급 이력 샘플 =====
  //   단체(사업자) 회원·현금성 결제 주문에서 많이 발급됨. 발급 시각은 주문·결제 시각 뒤로 잡음
  const issues = [];
  let seq = 0;
  const pushIssue = (o, type, at, extra) => {
    seq += 1;
    issues.push(Object.assign({ id: `A${at.slice(0, 10).replace(/-/g, '')}-${String(seq).padStart(4, '0')}`, at, docType: type, orderNo: o.orderNo, userId: o.userId, name: o.name, email: o.email,
      category: o.member.category, company: o.member.business ? o.member.business.companyName : '',
      channel: CHANNEL_OF[type], amount: 0, purpose: '', file: fileOf(type, o), by: '시스템' }, extra || {}));
  };
  const NOW_END = TODAY.getTime() + DAY - 60000;   // 기준일(TODAY) 이후 시각은 아직 일어나지 않은 발급 → 샘플에서 뺌
  const issueAt = (o, type, t, extra) => { if (t <= NOW_END) pushIssue(o, type, fmtDt(new Date(t)), extra); };
  ORDERS.forEach(o => {
    const r = rng(o.orderNo, 67), biz = !!o.member.business, cash = ['무통장입금', '후결제', '계좌이체'].includes(o.payMethod);
    const t0 = toTime(o.orderedAt);
    // 견적서: 주문서에서 결제 전 내려받음 (사업자 회원은 자주). 금액 = 주문 결제 예정 금액
    if (r() < (biz ? 0.6 : 0.12)) issueAt(o, '견적서', t0 + (5 + Math.floor(r() * 90)) * 60000, { amount: o.amount });
    // 사업자등록증·통장사본: 현금성 결제(입금 처리·거래처 등록용)
    if (cash && r() < 0.45) {
      const both = r() < 0.5;
      issueAt(o, both || r() < 0.5 ? '사업자등록증' : '통장사본', t0 + (10 + Math.floor(r() * 180)) * 60000);
      if (both) issueAt(o, '통장사본', t0 + (12 + Math.floor(r() * 180)) * 60000);
    }
    // 거래명세서: 결제 확인 뒤 주문 상세에서 내려받음 (전체취소 주문은 제외)
    const paidAt = o.payment.paidDateTime;
    if (paidAt && o.payment.total && r() < (biz ? 0.7 : 0.2)) issueAt(o, '거래명세서', toTime(paidAt.slice(0, 16)) + (1 + Math.floor(r() * 72)) * HOUR, { amount: o.payment.total });
    // 현금영수증·세금계산서: 결제 시 요청 → 결제 확인 후 자동 발급 (order-data.js)
    if (o.payment.docType && o.payment.docAt) pushIssue(o, o.payment.docType, o.payment.docAt, { amount: o.payment.total || o.amount, purpose: o.payment.docPurpose || '' });
  });
  // 관리자 재발급·관리자 발급 기록 (localStorage)
  adminIssues.forEach(x => issues.push(x));

  // ===== 별도 발급 신청 샘플 =====
  //   신청번호 = 'D' + 주문번호. 최근 90일 주문의 일부. 처리 대기 건은 최근 30일 안에 몰려 있음
  const requests = [];
  ORDERS.forEach(o => {
    const no = `D${o.orderNo.replace('-', '')}`;
    if (overlay[no]) { requests.push(overlay[no]); return; }
    if (o.orderDate < daysAgo(90) || o.payStatus === '전체취소') return;
    const h = hash(o.orderNo, 71) % 100;
    const biz = !!o.member.business;
    if (h >= (biz ? 22 : 5)) return;
    const r = rng(o.orderNo, 79);
    const docType = biz ? pick(REQUEST_TYPES, r) : pick(['견적서', '거래명세서', '사업자등록증', '기타'], r);
    let t = toTime(o.orderedAt) + (2 + Math.floor(r() * 120)) * HOUR;
    if (t > NOW_END) t = toTime(o.orderedAt) + (1 + Math.floor(r() * 3)) * HOUR;   // 최근 주문은 주문 직후 신청으로
    if (t > NOW_END) return;
    const at = new Date(t);
    const recent = fmtDate(at) >= daysAgo(30);
    const x = r();
    const status = recent ? (x < 0.65 ? '대기' : x < 0.9 ? '완료' : '반려') : (x < 0.8 ? '완료' : '반려');
    const receiveBy = docType === '사업자등록증' && r() < 0.5 ? '우편' : r() < 0.75 ? '이메일' : pick(['팩스', '우편'], r);
    const receiveTo = receiveBy === '이메일' ? o.email : receiveBy === '팩스' ? pick(FAXES, r) : (o.delivery.address || '') ;
    const req = { reqNo: no, orderNo: o.orderNo, at: fmtDt(at), docType, requirement: pick(REQUIREMENTS[docType], r),
      attachment: r() < 0.35 ? `${docType === '세금계산서 수정발행' ? '사업자등록증' : '기관양식'}_${o.userId}.${r() < 0.5 ? 'pdf' : 'jpg'}` : '',
      receiveBy, receiveTo, wantBy: r() < 0.6 ? fmtDate(new Date(at.getTime() + (2 + Math.floor(r() * 7)) * DAY)) : '',
      status, processedAt: '', processedBy: '', file: '', sentBy: '', sentTo: '', memo: '', rejectReason: '',
      history: [{ at: fmtDt(at), content: `고객 ${docType} 별도 발급 신청 (${receiveBy} 수령)`, by: '고객' }] };
    if (status !== '대기') {
      req.processedAt = fmtDt(clampNow(at.getTime() + (2 + Math.floor(r() * 30)) * HOUR)); req.processedBy = '관리자';   // 처리 시각은 기준일을 넘지 않게
      if (status === '반려') {
        req.rejectReason = docType === '세금계산서 수정발행' ? '수정발행은 공급받는자 정보 변경 사유서와 사업자등록증 사본이 필요합니다. 서류를 첨부해 다시 신청해 주세요.' : '요청하신 양식 파일이 첨부되지 않았습니다. 기관 양식을 첨부해 다시 신청해 주세요.';
        req.history.push({ at: req.processedAt, content: `반려 처리 (사유: ${req.rejectReason})`, by: '관리자' });
      } else {
        req.file = fileOf(docType, o); req.sentBy = receiveBy; req.sentTo = receiveTo;
        req.memo = r() < 0.4 ? '직인 날인 후 스캔본 송부' : '';
        req.history.push({ at: req.processedAt, content: `발급 완료 → ${receiveBy} 전달 (${req.file})`, by: '관리자' });
      }
    }
    requests.push(req);
  });

  // ===== 처리 =====
  // 발급 완료: 관리자가 만든 서류를 고객에게 전달. opts = { file, sentBy, sentTo, memo, by }. 주문 히스토리('서류발급')에 남김
  function complete(req, opts) {
    if (req.status !== '대기') return false;
    const at = nowText();
    Object.assign(req, { status: '완료', processedAt: at, processedBy: opts.by, file: opts.file || '', sentBy: opts.sentBy || req.receiveBy, sentTo: opts.sentTo || req.receiveTo, memo: opts.memo || '' });
    req.history.push({ at, content: `발급 완료 → ${req.sentBy} 전달${req.sentTo ? ` (${req.sentTo})` : ''}${req.file ? ` · ${req.file}` : ''}${req.memo ? ` · ${req.memo}` : ''}`, by: opts.by });
    if (req.orderNo) OrderData.addHistory(req.orderNo, '서류발급', `${req.docType} 별도 발급 (${req.reqNo}) · ${req.sentBy} 전달${req.file ? ` · ${req.file}` : ''}${req.memo ? ` · ${req.memo}` : ''}`, opts.by);
    return saveReq(req);
  }
  // 반려: 사유는 고객에게 안내
  function reject(req, reason, by) {
    if (req.status !== '대기') return false;
    const at = nowText();
    Object.assign(req, { status: '반려', processedAt: at, processedBy: by, rejectReason: reason });
    req.history.push({ at, content: `반려 처리 (사유: ${reason})`, by });
    if (req.orderNo) OrderData.addHistory(req.orderNo, '서류발급', `${req.docType} 별도 발급 신청 반려 (${req.reqNo}) · 사유: ${reason}`, by);
    return saveReq(req);
  }
  // 관리자 발급(재발급·주문 상세의 증빙서류 발급): 발급 이력에 관리자 건으로 추가. src = { docType, orderNo, userId, name, email, category, company, amount, channel }
  function addIssue(src, by) {
    const at = nowText();
    const o = src.orderNo ? OrderData.find(src.orderNo) : null;
    const rec = { id: `M${at.slice(0, 10).replace(/-/g, '')}-${String(adminIssues.length + 1).padStart(4, '0')}`, at, docType: src.docType, orderNo: src.orderNo || '',
      userId: src.userId || (o ? o.userId : ''), name: src.name || (o ? o.name : ''), email: src.email || (o ? o.email : ''),
      category: src.category || (o ? o.member.category : ''), company: src.company || (o && o.member.business ? o.member.business.companyName : ''),
      channel: src.channel || '관리자 재발급', amount: src.amount || 0, purpose: src.purpose || '', file: src.file || fileOf(src.docType, o), by };
    adminIssues.push(rec);
    issues.push(rec);
    return saveIssues() ? rec : null;
  }
  const reissue = (issue, by) => {
    const rec = addIssue(Object.assign({}, issue, { channel: '관리자 재발급' }), by);
    if (rec && rec.orderNo) OrderData.addHistory(rec.orderNo, '서류발급', `${rec.docType} 재발급 (${rec.file})`, by);
    return rec;
  };

  const byAt = (a, b) => b.at.localeCompare(a.at);
  window.DocData = {
    STATUS_TEXT, AUTO_TYPES, REQUEST_TYPES, RECEIVE_METHODS, CHANNEL_OF, orderOf,
    issues: issues.sort(byAt), requests: requests.sort(byAt),
    complete, reject, addIssue, reissue
  };
})();

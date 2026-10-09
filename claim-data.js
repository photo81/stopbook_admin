// 클레임 신청 데이터 (클레임관리 > 취소 요청 관리 / 교환 반품 관리)
// member-type-store.js, member-data.js, order-data.js 다음에 로드
//   취소 요청: 출고 전 주문에 대한 고객의 주문 취소 신청. 승인하면 신청 상품이 취소 처리되어 주문 리스트·주문 상세의 결제상태가 전체취소/부분취소로 바뀜
//   교환: 상품 수령 후 불량 → 같은 상품을 다시 제작해 보냄 (승인하면 재제작 진행)
//   반품: 상품 수령 후 불량 → 상품을 돌려받고 환불 (승인하면 신청 상품이 취소 처리되어 환불)
//   신청 샘플은 주문에서 만들고(고정), 관리자가 처리한 신청은 localStorage에 통째로 보관해 다시 열 때 그대로 복원
// TODO: 실서비스에서는 GET /api/admin/claims/{cancel|exchange}, POST /api/admin/claims/{kind}/{reqNo}/approve|reject
(function () {
  'use strict';
  const { ORDERS, TODAY } = OrderData;
  const KEYS = { cancel: 'stopbook.cancelRequests.v2', exchange: 'stopbook.exchangeRequests.v1' };
  const DAY = 86400000;
  const pad = n => String(n).padStart(2, '0');
  const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fmtDt = d => `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const daysAgo = n => fmtDate(new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() - n));
  const nowText = () => fmtDt(new Date());
  const STATUS_TEXT = { '대기': '승인 대기', '승인': '처리 완료', '반려': '반려' };

  // 취소 사유 (출고 전) / 불량 유형 (교환·반품, 수령 후)
  const CANCEL_REASONS = ['단순변심', '주문 정보 오류', '중복 주문', '제작·배송 지연', '기타'];
  const CANCEL_DETAILS = {
    '단순변심': ['다른 상품으로 다시 주문하려고 합니다.', '생각이 바뀌어 취소하고 싶습니다.'],
    '주문 정보 오류': ['옵션(사이즈)을 잘못 골랐습니다.', '수량을 잘못 넣었습니다. 취소 후 다시 주문하겠습니다.'],
    '중복 주문': ['같은 주문이 두 번 결제되었습니다. 하나 취소해 주세요.'],
    '제작·배송 지연': ['안내된 날짜보다 배송이 늦어져 필요가 없어졌습니다.', '행사일이 지나 상품이 필요 없습니다.'],
    '기타': ['결제 수단을 바꾸고 싶어 취소합니다.', '선물 받는 분 사정으로 취소합니다.']
  };
  const DEFECTS = ['인쇄 불량', '제본·마감 불량', '배송 중 파손', '오배송(다른 상품)', '기타'];
  const DEFECT_DETAILS = {
    '인쇄 불량': ['사진 색이 화면과 많이 다르고 일부 페이지가 번져 있습니다.', '내지 몇 장에 줄이 가 있습니다. 사진 첨부합니다.'],
    '제본·마감 불량': ['표지가 들떠 있고 제본이 벌어집니다.', '모서리 마감이 거칠고 페이지가 빠집니다.'],
    '배송 중 파손': ['상자가 찌그러져 액자 유리가 깨졌습니다.', '표지 모서리가 심하게 눌려 왔습니다.'],
    '오배송(다른 상품)': ['주문한 사이즈가 아닌 다른 사이즈가 왔습니다.', '다른 분의 포토북이 배송되었습니다.'],
    '기타': ['주문한 옵션(코팅)이 적용되지 않았습니다.', '페이지 순서가 편집한 것과 다릅니다.']
  };
  const BANKS = ['국민은행', '신한은행', '우리은행', '하나은행', '카카오뱅크', '농협은행'];
  // 교환·반품 처리 시 입력: 주관부서(불량 책임 부서) · 사유(불량 원인 분류) · 상세사유 · 조치사항
  const DEPARTMENTS = ['제작1반', '제작2반', '오프셋센터', '출력팀', '외주제작', '고객귀책', '기타'];
  const CAUSES = ['제본', '압축/인조/하드', '파손', '핀트/색상', '파일오류', '잉크/오일/이물질', '합지/합본', '오배송', '이물질/긁힘/구김/찢김', '세팅', '분류/이송', '상품누락', '구김/찢김/긁힘', '재단', '고객귀책', '줄감/뜯김', '주문접수', '코팅', '상담/의사전달', '용지', '분실', '포장', '설정', '기타'];
  // 고객 불량 유형 → 처리 사유 기본값 (관리자가 바꿀 수 있음)
  const CAUSE_OF = { '인쇄 불량': '핀트/색상', '제본·마감 불량': '제본', '배송 중 파손': '파손', '오배송(다른 상품)': '오배송', '기타': '기타' };
  const ACTIONS = ['동일 사양으로 재제작 후 재출고 (무상)', '불량 원인 공정 점검 및 담당자 교육', '회수 후 검수 → 환불 처리', '제작처에 불량 통보 및 재발 방지 요청', '포장 보강 후 재출고'];

  const hash = (s, seed) => [...s].reduce((h, c) => (h * 73 + c.charCodeAt(0)) % 233280, seed);
  const rng = (s, seed) => { let x = hash(s, seed); return () => (x = (x * 9301 + 49297) % 233280) / 233280; };
  const pick = (arr, r) => arr[Math.floor(r() * arr.length)];
  const orderedTime = o => new Date(o.orderedAt.replace(' ', 'T')).getTime();
  const clampNow = t => new Date(Math.min(TODAY.getTime() + DAY - 60000, t));

  // 환불 수단: 현금성 결제(무통장입금·후결제·별도결제·계좌이체)는 계좌 환불, 그 외는 원결제수단 취소
  const cashLike = o => ['무통장입금', '후결제', '별도결제', '계좌이체'].includes(o.payMethod);
  const refundOf = (o, r, m) => (cashLike(o) || r() < 0.15
    ? { method: '계좌 환불', bank: pick(BANKS, r), account: `${100 + Math.floor(r() * 900)}-${String(Math.floor(r() * 1e6)).padStart(6, '0')}-${String(Math.floor(r() * 1e5)).padStart(5, '0')}`, holder: m.name }
    : { method: `원결제수단 취소 (${o.payMethod})`, bank: '', account: '', holder: '' });

  // 취소 신청 가능 단계: 공정이 '리핑완료'까지인 상품만 (출력이 시작되면 불가). 외주 제작 상품은 제작처에 '의뢰완료'까지 (제작중부터 불가)
  // TODO: 실서비스에서는 쇼핑몰 취소 신청 화면에서도 같은 기준으로 막음
  const CANCEL_LIMIT = { inhouse: '리핑완료', outsource: '의뢰완료' };
  const stepOf = it => it.flow.steps[it.flow.step];
  const canCancelItem = it => {
    if (it.payStatus === '취소' || it.flow.canceled) return false;
    const steps = it.flow.steps, limit = steps.includes(CANCEL_LIMIT.inhouse) ? CANCEL_LIMIT.inhouse : CANCEL_LIMIT.outsource;
    return it.flow.step <= steps.indexOf(limit);
  };
  const cancelLimitOf = it => (it.flow.steps.includes(CANCEL_LIMIT.inhouse) ? CANCEL_LIMIT.inhouse : CANCEL_LIMIT.outsource);

  const loadOverlay = key => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; } };
  const overlays = { cancel: loadOverlay(KEYS.cancel), exchange: loadOverlay(KEYS.exchange) };
  const saveReq = (kind, req) => { overlays[kind][req.reqNo] = JSON.parse(JSON.stringify(req)); try { localStorage.setItem(KEYS[kind], JSON.stringify(overlays[kind])); return true; } catch (e) { return false; } };

  const orderOf = req => OrderData.find(req.orderNo);
  // 신청 상품의 결제금액 합계 (= 환불 가능 최대 금액). 이미 취소된 상품은 취소금액
  const maxRefund = req => { const o = orderOf(req); return o ? req.items.reduce((t, i) => t + (o.items[i] ? (o.items[i].paid || o.items[i].cancel) : 0), 0) : 0; };

  // 신청 상품(또는 관리자가 고른 일부 idxs)을 취소 처리 (order-data.js saveCancel): 환불 금액을 상품 결제금액 비율로 나눠 상품별 취소금액으로 기록
  function cancelItems(o, req, idxs, amount, refundText, memo, at, by) {
    const sel = idxs.map(i => o.items[i]).filter(Boolean);
    const paidSum = sel.reduce((t, it) => t + it.paid, 0) || 1;
    const items = {};
    let left = amount;
    idxs.forEach((idx, k) => {
      const it = o.items[idx];
      const part = k === idxs.length - 1 ? left : Math.min(it.paid, Math.floor(amount * it.paid / paidSum / 10) * 10);
      left -= part;
      items[idx] = { amount: part, reason: req.reason, refund: refundText, memo, at, by };
    });
    return OrderData.saveCancel(o.orderNo, items);
  }
  // 승인 대상 상품: opts.items(관리자가 고른 일부)가 있으면 그것, 없으면 신청 상품 전부. 반환: [{ idxs, partial }]
  const pickItems = (req, opts) => {
    const idxs = (opts.items && opts.items.length ? opts.items : req.items).filter(i => req.items.includes(i));
    return { idxs, partial: idxs.length < req.items.length };
  };

  // ===== 취소 요청 샘플 (출고 전 주문) =====
  // 신청번호 = 'C' + 주문번호 (주문당 하나, 처리 뒤 다시 열어도 같은 번호). 처리된 신청은 저장본을 그대로 씀
  const cancel = [];
  ORDERS.forEach(o => {
    const m = o.member, r = rng(o.orderNo, 29), no = `C${o.orderNo.replace('-', '')}`;
    if (overlays.cancel[no]) { cancel.push(overlays.cancel[no]); return; }
    const delivered = o.status === '배송완료';
    const sampleCanceled = o.items.map((it, i) => (it.payStatus === '취소' && !it.cancelInfo ? i : -1)).filter(i => i >= 0);
    // 1) 샘플에 처음부터 취소로 들어 있는 출고 전 주문 → 이미 승인된 취소 요청 (최근 90일)
    if (sampleCanceled.length && !delivered && o.orderDate >= daysAgo(90)) {
      const at = new Date(orderedTime(o) + (2 + Math.floor(r() * 30)) * 3600000), done = new Date(at.getTime() + (3 + Math.floor(r() * 20)) * 3600000);
      const reason = pick(CANCEL_REASONS, r), refund = refundOf(o, r, m), amount = sampleCanceled.reduce((t, i) => t + o.items[i].cancel, 0);
      // scope: 고객이 주문 상품 전부를 취소 요청했으면 '전체', 일부만이면 '부분' (유형 표시: 취소요청(전체) / 취소요청(부분))
      cancel.push({ reqNo: no, orderNo: o.orderNo, type: '취소', scope: sampleCanceled.length === o.items.length ? '전체' : '부분', at: fmtDt(at), items: sampleCanceled, reason, detail: pick(CANCEL_DETAILS[reason], r), refund,
        status: '승인', processedAt: fmtDt(done), processedBy: '관리자', refundAmount: amount, memo: '', rejectReason: '',
        history: [{ at: fmtDt(at), content: `고객 취소 요청 (${reason})`, by: '고객' }, { at: fmtDt(done), content: `승인 처리 → 상품 ${sampleCanceled.length}건 취소, 환불 ${amount.toLocaleString()}원 (${refund.method})`, by: '관리자' }] });
      return;
    }
    // 2) 결제가 끝났고 아직 출고 전인 최근 주문 일부 → 승인 대기 / 반려. 취소 신청은 공정이 리핑완료(외주: 의뢰완료)까지인 상품만 가능
    if (delivered || !['결제완료', '부분취소'].includes(o.payStatus) || o.orderDate < daysAgo(21)) return;
    const h = hash(o.orderNo, 41) % 9;
    if (h > 4) return;   // 최근 주문의 절반가량 (취소 가능 단계인 상품이 있는 주문만 남음)
    const liveAll = o.items.map((it, i) => (it.payStatus !== '취소' ? i : -1)).filter(i => i >= 0);
    const live = liveAll.filter(i => canCancelItem(o.items[i]));
    if (!live.length) return;
    const items = live.length > 1 && r() < 0.4 ? [live[Math.floor(r() * live.length)]] : live;
    const reason = pick(CANCEL_REASONS, r);
    const at = clampNow(orderedTime(o) + (1 + Math.floor(r() * 72)) * 3600000);
    const status = h === 1 && r() < 0.5 ? '반려' : '대기';
    const scope = items.length === liveAll.length ? '전체' : '부분';   // 취소 불가 단계인 상품이 있으면 전부 요청해도 '부분'
    const req = { reqNo: no, orderNo: o.orderNo, type: '취소', scope, at: fmtDt(at), items, reason, detail: pick(CANCEL_DETAILS[reason], r), refund: refundOf(o, r, m),
      status, processedAt: '', processedBy: '', refundAmount: 0, memo: '', rejectReason: '',
      history: [{ at: fmtDt(at), content: `고객 취소 요청(${scope}) (${reason}${scope === '부분' ? `, 상품 ${items.length}건` : ''})`, by: '고객' }] };
    if (status === '반려') {
      req.processedAt = fmtDt(new Date(at.getTime() + (2 + Math.floor(r() * 10)) * 3600000)); req.processedBy = '관리자';
      req.rejectReason = '이미 제작이 시작되어 취소할 수 없습니다. 고객 확인 후 안내 완료.';
      req.history.push({ at: req.processedAt, content: `반려 처리 (사유: ${req.rejectReason})`, by: '관리자' });
    }
    cancel.push(req);
  });
  // 부분 취소요청 샘플 보충: 승인 대기인 전체 요청 가운데 상품이 2건 이상인 주문 5건을 '일부 상품만 요청'으로 바꿈 (처리된 신청은 제외)
  cancel.filter(q => !overlays.cancel[q.reqNo] && q.status === '대기' && q.scope === '전체' && q.items.length >= 2).slice(0, 5).forEach(q => {
    q.items = [q.items[0]];
    q.scope = '부분';
    q.history[0].content = `고객 취소 요청(부분) (${q.reason}, 상품 1건)`;
  });

  // ===== 승인 대기 취소 요청 → 주문 결제상태 '취소요청' =====
  // 주문 리스트·주문 상세에서 취소 요청이 들어온 주문임을 바로 알 수 있게 결제상태를 바꿔 둠 (원래 상태는 payStatusBefore에 보관)
  //   승인 → 취소 기록으로 전체취소/부분취소, 반려 → 다음 로드부터 표시하지 않으므로 원래 결제상태로 돌아감
  //   (이 파일을 order-list.js보다 먼저 로드해야 목록에 반영됨)
  cancel.forEach(q => {
    if (q.status !== '대기') return;
    const o = orderOf(q);
    if (!o || !['결제완료', '부분취소'].includes(o.payStatus)) return;
    o.payStatusBefore = o.payStatus;
    o.payStatus = '취소요청';
    o.cancelRequest = q;
    // 요청된 상품도 상품별 결제상태를 '취소요청'으로 (주문 상세 > 주문정보의 상품 행). 요청에 없는 상품은 그대로
    q.items.forEach(i => { const it = o.items[i]; if (it && it.payStatus !== '취소') { it.payStatusBefore = it.payStatus; it.payStatus = '취소요청'; it.cancelRequested = true; } });
  });

  // 처리 완료 샘플의 처리 내용: 주관부서는 제작처(KSI 디지털센터 → 제작1반/제작2반, KSI 오프셋센터 → 오프셋센터, 그 외 → 외주제작), 사유는 불량 유형에서, 조치사항은 유형별 예시
  function sampleProcess(o, defect, r, type) {
    const makers = [...new Set(o.items.map(it => it.maker))];
    const dept = defect === '배송 중 파손' ? '출력팀' : makers.some(mk => mk === 'KSI 오프셋센터') ? '오프셋센터' : makers.some(mk => mk === 'KSI 디지털센터') ? pick(['제작1반', '제작2반'], r) : '외주제작';
    return { dept, cause: CAUSE_OF[defect] || '기타', causeDetail: pick(DEFECT_DETAILS[defect], r).replace(/\.$/, '') + ' — 실물 확인',
      action: type === '교환' ? pick([ACTIONS[0], ACTIONS[1], ACTIONS[3]], r) : pick([ACTIONS[2], ACTIONS[1]], r) };
  }

  // ===== 교환·반품 샘플 (배송완료 주문) =====
  // 신청번호 = 'X' + 주문번호. 교환 = 불량 재제작, 반품 = 불량 반품 환불
  const exchange = [];
  ORDERS.forEach(o => {
    const m = o.member, r = rng(o.orderNo, 53), no = `X${o.orderNo.replace('-', '')}`;
    if (overlays.exchange[no]) { exchange.push(overlays.exchange[no]); return; }
    if (o.status !== '배송완료') return;
    const sampleCanceled = o.items.map((it, i) => (it.payStatus === '취소' && !it.cancelInfo ? i : -1)).filter(i => i >= 0);
    // 1) 샘플에 취소로 들어 있는 배송완료 주문 → 이미 승인된 반품 (최근 90일)
    if (sampleCanceled.length && o.orderDate >= daysAgo(90)) {
      const at = new Date(orderedTime(o) + (6 + Math.floor(r() * 8)) * DAY), done = new Date(at.getTime() + (1 + Math.floor(r() * 2)) * DAY);
      const reason = pick(DEFECTS, r), refund = refundOf(o, r, m), amount = sampleCanceled.reduce((t, i) => t + o.items[i].cancel, 0);
      exchange.push({ reqNo: no, orderNo: o.orderNo, type: '반품', at: fmtDt(at), items: sampleCanceled, reason, detail: pick(DEFECT_DETAILS[reason], r), photos: 1 + Math.floor(r() * 3), refund,
        status: '승인', processedAt: fmtDt(done), processedBy: '관리자', refundAmount: amount, result: '반품 회수 · 환불 완료', memo: '', rejectReason: '',
        process: sampleProcess(o, reason, r, '반품'),
        history: [{ at: fmtDt(at), content: `고객 반품 신청 (${reason})`, by: '고객' }, { at: fmtDt(done), content: `승인 처리 → 반품 회수 후 상품 ${sampleCanceled.length}건 취소, 환불 ${amount.toLocaleString()}원 (${refund.method})`, by: '관리자' }] });
      return;
    }
    // 2) 최근 45일 배송완료 주문 일부 → 교환/반품 승인 대기·처리 완료(교환 재제작)·반려
    if (!['결제완료', '부분취소'].includes(o.payStatus) || o.orderDate < daysAgo(45)) return;
    const h = hash(o.orderNo, 59) % 10;
    if (h > 2) return;
    const live = o.items.map((it, i) => (it.payStatus !== '취소' ? i : -1)).filter(i => i >= 0);
    if (!live.length) return;
    const type = h === 2 ? '반품' : '교환';
    const items = live.length > 1 && r() < 0.6 ? [live[Math.floor(r() * live.length)]] : live;
    const reason = pick(DEFECTS, r);
    const doneAt = o.delivery.doneAt ? new Date(o.delivery.doneAt.replace(' ', 'T')).getTime() : orderedTime(o) + 5 * DAY;
    const at = clampNow(doneAt + (4 + Math.floor(r() * 60)) * 3600000);
    const x = r();
    const status = x < 0.55 ? '대기' : x < 0.85 ? '승인' : '반려';
    const req = { reqNo: no, orderNo: o.orderNo, type, at: fmtDt(at), items, reason, detail: pick(DEFECT_DETAILS[reason], r), photos: 1 + Math.floor(r() * 3), refund: type === '반품' ? refundOf(o, r, m) : null,
      status, processedAt: '', processedBy: '', refundAmount: 0, result: '', memo: '', rejectReason: '',
      history: [{ at: fmtDt(at), content: `고객 ${type} 신청 (${reason}${items.length < live.length ? `, 상품 ${items.length}건` : ''})`, by: '고객' }] };
    if (status !== '대기') {
      req.processedAt = fmtDt(clampNow(at.getTime() + (3 + Math.floor(r() * 20)) * 3600000)); req.processedBy = '관리자';
      if (status === '반려') {
        req.rejectReason = type === '교환' ? '첨부 사진으로는 불량을 확인할 수 없어 반려합니다. 고객센터로 실물 확인 요청 안내 완료.' : '단순 변심에 해당해 맞춤 제작 상품 특성상 반품이 어렵습니다.';
        req.history.push({ at: req.processedAt, content: `반려 처리 (사유: ${req.rejectReason})`, by: '관리자' });
      } else if (type === '교환') {
        // 교환 승인: 재제작 진행. 샘플 일부는 재출고까지 끝난 상태
        req.process = sampleProcess(o, reason, r, '교환');
        req.result = r() < 0.5 ? '재제작 진행' : '재출고 완료';
        req.history.push({ at: req.processedAt, content: `승인 처리 → 같은 상품 ${items.length}건 재제작 지시 (불량: ${reason})`, by: '관리자' });
        if (req.result === '재출고 완료') req.history.push({ at: fmtDt(clampNow(new Date(req.processedAt.replace(' ', 'T')).getTime() + 3 * DAY)), content: '재제작 완료 · 재출고 (무상)', by: '시스템' });
      } else {
        // 반품 승인 샘플: 취소 기록이 없는 주문이라 화면상 상품은 그대로 두고 처리 결과만 표시 (실제 승인 처리는 approve에서 취소 기록까지 남김)
        req.process = sampleProcess(o, reason, r, '반품');
        req.result = '반품 회수 · 환불 완료';
        req.refundAmount = maxRefund(req);
        req.history.push({ at: req.processedAt, content: `승인 처리 → 반품 회수 후 상품 ${items.length}건 취소, 환불 ${req.refundAmount.toLocaleString()}원 (${req.refund.method})`, by: '관리자' });
      }
    }
    exchange.push(req);
  });

  // ===== 처리 =====
  // 취소 요청 승인: 신청 상품(또는 관리자가 고른 일부) 취소 + 환불. opts = { items?(상품 index 일부), amount, refund?(관리자가 확정한 환불 수단), memo, by }
  //   일부만 승인하면 '부분 승인'으로 기록 (나머지 상품은 그대로 진행). 주문은 부분취소, 전부면 전체취소
  //   환불 수단을 고객 신청과 다르게 확정하면 신청한 수단은 refundRequested에 남김. 관리자 메모는 주문 상세의 관리자 메모(구분 '취소')와 히스토리에도 남김
  //   opts.reason: 관리자가 바꿔 확정한 취소 사유 (고객이 고른 사유는 reasonRequested에 남김)
  function approveCancel(req, opts) {
    const o = orderOf(req);
    if (!o || req.status !== '대기') return false;
    const { idxs, partial } = pickItems(req, opts);
    if (!idxs.length) return false;
    if (opts.reason && opts.reason !== req.reason) { req.reasonRequested = req.reasonRequested || req.reason; req.reason = opts.reason; }
    const sel = idxs.map(i => o.items[i]).filter(Boolean);
    const max = sel.reduce((t, it) => t + (it.paid || it.cancel), 0);
    const amount = Math.min(opts.amount, max), at = nowText();
    if (opts.refund && opts.refund.method) {
      if (opts.refund.method !== req.refund.method || opts.refund.account !== (req.refund.account || '')) req.refundRequested = req.refundRequested || Object.assign({}, req.refund);
      req.refund = Object.assign({}, req.refund, opts.refund);
    }
    const refundText = req.refund.method === '계좌 환불' && req.refund.bank ? `계좌 환불 (${req.refund.bank} ${req.refund.account} ${req.refund.holder})` : req.refund.method;
    const ok = cancelItems(o, req, idxs, amount, refundText, `고객 취소 요청 ${req.reqNo}${partial ? ' (부분 승인)' : ''}${opts.memo ? ` · ${opts.memo}` : ''}`, at, opts.by);
    const label = partial ? `부분 승인 (신청 ${req.items.length}건 중 ${sel.length}건)` : '승인';
    const mileage = refundMileage(o, req, amount, `취소 요청 ${req.reqNo} 환불 (주문 ${o.orderNo})`, opts.by);
    OrderData.addHistory(o.orderNo, '취소', `고객 취소 요청 ${label} (${req.reqNo}) · 상품 ${sel.length}건 (${sel.map(it => it.name).join(', ')}) · 사유 ${req.reason}${req.reasonRequested ? ` (고객 신청 '${req.reasonRequested}'에서 변경)` : ''} · 환불 ${amount.toLocaleString()}원 · ${refundText}${mileage}${req.refundRequested ? ` (고객 신청 '${req.refundRequested.method}'에서 변경)` : ''}${opts.memo ? ` · ${opts.memo}` : ''}`, opts.by);
    if (opts.memo) OrderData.addMemo(o.orderNo, '취소', `[취소 요청 ${req.reqNo} 승인] ${opts.memo}`, opts.by);
    Object.assign(req, { status: '승인', processedAt: at, processedBy: opts.by, refundAmount: amount, memo: opts.memo || '', approvedItems: idxs, partial });
    req.history.push({ at, content: `${label} 처리 → 상품 ${sel.length}건 취소, 환불 ${amount.toLocaleString()}원 (${refundText})${mileage}${partial ? ` · 나머지 ${req.items.length - sel.length}건은 그대로 진행` : ''}${opts.memo ? ` · ${opts.memo}` : ''}`, by: opts.by });
    return saveReq('cancel', req) && ok;
  }
  // 마일리지 환불: 환불 금액만큼 회원 마일리지를 자동 지급 (member-data.js addMileage → 회원 마일리지 내역·보유량·회원 히스토리). 반환: 히스토리에 붙일 문구
  function refundMileage(o, req, amount, reason, by) {
    if (req.refund.method !== '마일리지 환불' || !amount) return '';
    const ok = MemberData.addMileage(o.member.no, { delta: amount, reason, by, item: req.reqNo });
    return ok ? ` → 회원 마일리지 ${amount.toLocaleString()}P 자동 지급 (보유 ${o.member.mileage.toLocaleString()}P)` : ' → 마일리지 지급 실패 (저장소 사용 불가)';
  }
  // 교환 승인: 같은 상품 재제작 지시 (주문 상품은 그대로, 히스토리에 남김). 반품 승인: 반품 회수 후 신청 상품 취소 + 환불. opts = { amount(반품), memo, by }
  // TODO: 실서비스에서는 교환 승인 시 재제작 주문(무상)이 제작 공정에 등록되고, 반품은 회수 완료 후 환불 처리
  //   opts.process = { dept(주관부서), cause(사유), causeDetail(상세사유), action(조치사항) } — 처리 완료 상세와 주문 히스토리에 남김
  const processText = p => (p ? `주관부서 ${p.dept} · 사유 ${p.cause}${p.causeDetail ? ` (${p.causeDetail})` : ''} · 조치 ${p.action}` : '');
  function approveExchange(req, opts) {
    const o = orderOf(req);
    if (!o || req.status !== '대기') return false;
    const at = nowText();
    const sel = req.items.map(i => o.items[i]).filter(Boolean);
    let ok = true;
    if (opts.process) req.process = Object.assign({}, opts.process);
    const ptext = processText(req.process);
    if (req.type === '교환') {
      Object.assign(req, { status: '승인', processedAt: at, processedBy: opts.by, result: '재제작 진행', memo: opts.memo || '' });
      req.history.push({ at, content: `승인 처리 → 같은 상품 ${sel.length}건 재제작 지시 (불량: ${req.reason})${ptext ? ` · ${ptext}` : ''}${opts.memo ? ` · ${opts.memo}` : ''}`, by: opts.by });
      OrderData.addHistory(o.orderNo, '교환', `고객 교환 신청 승인 (${req.reqNo}) · 상품 ${sel.length}건 (${sel.map(it => it.name).join(', ')}) 재제작 · 불량: ${req.reason}${ptext ? ` · ${ptext}` : ''}${opts.memo ? ` · ${opts.memo}` : ''}`, opts.by);
      if (opts.memo) OrderData.addMemo(o.orderNo, '불량', `[교환 신청 ${req.reqNo} 승인] ${opts.memo}`, opts.by);
    } else {
      // 반품: 신청 상품 중 관리자가 고른 일부만 승인할 수 있음 (부분 승인)
      const { idxs, partial } = pickItems(req, opts);
      if (!idxs.length) return false;
      const rsel = idxs.map(i => o.items[i]).filter(Boolean);
      const max = rsel.reduce((t, it) => t + (it.paid || it.cancel), 0);
      const amount = Math.min(opts.amount, max);
      const label = partial ? `부분 승인 (신청 ${req.items.length}건 중 ${rsel.length}건)` : '승인';
      if (opts.refund && opts.refund.method) req.refund = Object.assign({}, req.refund, opts.refund);   // 관리자가 환불 수단을 바꿔 확정한 경우
      ok = cancelItems(o, req, idxs, amount, `반품 환불 · ${req.refund.method}`, `고객 반품 신청 ${req.reqNo}${partial ? ' (부분 승인)' : ''}${opts.memo ? ` · ${opts.memo}` : ''}`, at, opts.by);
      const mileage = refundMileage(o, req, amount, `반품 ${req.reqNo} 환불 (주문 ${o.orderNo})`, opts.by);
      Object.assign(req, { status: '승인', processedAt: at, processedBy: opts.by, result: '반품 회수 · 환불 완료', refundAmount: amount, memo: opts.memo || '', approvedItems: idxs, partial });
      req.history.push({ at, content: `${label} 처리 → 반품 회수 후 상품 ${rsel.length}건 취소, 환불 ${amount.toLocaleString()}원 (${req.refund.method})${mileage}${partial ? ` · 나머지 ${req.items.length - rsel.length}건은 반품 없음` : ''}${ptext ? ` · ${ptext}` : ''}${opts.memo ? ` · ${opts.memo}` : ''}`, by: opts.by });
      OrderData.addHistory(o.orderNo, '반품', `고객 반품 신청 ${label} (${req.reqNo}) · 상품 ${rsel.length}건 (${rsel.map(it => it.name).join(', ')}) 취소 · 환불 ${amount.toLocaleString()}원 · ${req.refund.method}${mileage} · 불량: ${req.reason}${ptext ? ` · ${ptext}` : ''}${opts.memo ? ` · ${opts.memo}` : ''}`, opts.by);
      if (opts.memo) OrderData.addMemo(o.orderNo, '불량', `[반품 신청 ${req.reqNo} 승인] ${opts.memo}`, opts.by);
    }
    return saveReq('exchange', req) && ok;
  }
  // 반려: 주문은 그대로, 신청만 반려 + 사유 (고객에게 안내). 취소 요청이면 결제상태를 원래대로 되돌림
  function reject(kind, req, reason, by) {
    if (req.status !== '대기') return false;
    const at = nowText();
    Object.assign(req, { status: '반려', processedAt: at, processedBy: by, rejectReason: reason });
    const o = orderOf(req);
    if (o && o.payStatus === '취소요청') {
      o.payStatus = o.payStatusBefore || '결제완료';
      delete o.cancelRequest;
      o.items.forEach(it => { if (it.cancelRequested) { it.payStatus = it.payStatusBefore || '결제완료'; delete it.payStatusBefore; delete it.cancelRequested; } });
    }
    req.history.push({ at, content: `반려 처리 (사유: ${reason})`, by });
    OrderData.addHistory(req.orderNo, req.type === '취소' ? '취소' : req.type, `고객 ${req.type} 신청 반려 (${req.reqNo}) · 사유: ${reason}`, by);
    OrderData.addMemo(req.orderNo, '취소', `[${req.type} 신청 ${req.reqNo} 반려] ${reason}`, by);   // 관리자 메모에도 남김 (주문 상세 > 관리정보)
    return saveReq(kind, req);
  }

  const byAt = (a, b) => b.at.localeCompare(a.at);

  // ===== 주문 히스토리 연동 =====
  // 주문 상세 > 주문 히스토리에 이 주문의 취소 요청·교환·반품 처리 이력을 같이 보여줌
  //   고객 신청 이력('취소신청'·'교환신청'·'반품신청')과 샘플로 만들어진 처리 이력은 여기서 공급하고,
  //   관리자가 화면에서 처리한 이력은 승인·반려 시 OrderData.addHistory로 이미 기록되므로 중복되지 않게 뺌 (overlay에 있는 신청 = 관리자가 처리한 신청)
  function historyOf(orderNo) {
    const out = [];
    [['cancel', cancel], ['exchange', exchange]].forEach(([kind, list]) => list.filter(q => q.orderNo === orderNo).forEach(q => {
      const processedHere = !!overlays[kind][q.reqNo];
      q.history.forEach(h => {
        if (h.by !== '고객' && processedHere) return;
        out.push({ at: h.at, type: h.by === '고객' ? `${q.type}신청` : (q.type === '취소' ? '취소' : q.type), content: `${h.content} (${q.reqNo})`, by: h.by });
      });
    }));
    return out;
  }

  window.ClaimData = {
    historyOf, processText,
    STATUS_TEXT, orderOf, maxRefund, CANCEL_LIMIT, stepOf, canCancelItem, cancelLimitOf,
    CANCEL_REASONS, DEPARTMENTS, CAUSES, CAUSE_OF, ACTIONS,
    cancel: { requests: cancel.sort(byAt), approve: approveCancel, reject: (req, reason, by) => reject('cancel', req, reason, by) },
    exchange: { requests: exchange.sort(byAt), approve: approveExchange, reject: (req, reason, by) => reject('exchange', req, reason, by) }
  };
})();

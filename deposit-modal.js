// 입금처리 / 입금관리 모달 (미입금 주문 리스트 / 후결제 주문 리스트 / 주문 상세 공유)
// member-type-store.js(AdminUtil), member-data.js, order-data.js(OrderData) 다음에 로드
//   미입금 주문(무통장입금, 결제상태 입금대기) → 입금처리: 결제수단·입금액·입금일시 1건 입력 → 결제완료·주문 접수
//   후결제 주문(단체 회원 중 후불 결제 적용, 상품 수령 후 결제) → 입금관리(넓은 모달):
//     주문 정보 + 단체 회원의 사업자 정보(단체회원 신청 시 입력한 정보 전체) + 입금 내역 + 입금 등록(입금일시·결제수단·입금액·관리자 메모)
//     분할 입금 가능: 입금 합계가 총 결제금액 이상이면 결제완료, 모자라면 부분결제
//   입금액은 비워 두면 남은 금액(후결제) / 총 결제금액(미입금)으로 처리. 입금일시 기본값은 현재 시각
// 사용: DepositModal.open(order, onDone)  onDone(order) = 처리 후 화면 갱신 (목록 다시 그리기 / 상세 다시 불러오기)
(function () {
  'use strict';
  const { esc, toast, ADMIN_NAME } = AdminUtil;
  const $ = id => document.getElementById(id);
  const won = n => `${Number(n).toLocaleString()}원`;
  const pad = n => String(n).padStart(2, '0');
  const dash = v => (v ? esc(v) : '<span class="muted">-</span>');
  // datetime-local 값('YYYY-MM-DDTHH:MM') ↔ 저장 형식('YYYY-MM-DD HH:MM:SS')
  const nowLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const toStored = v => `${v.replace('T', ' ')}${v.length === 16 ? ':00' : ''}`;
  let current = null, onDone = null;

  // 모달 마크업은 처음 열 때 한 번만 넣음 (여러 화면에서 같은 모달을 씀). 후결제 전용 영역은 열 때 hidden으로 조절
  function ensure() {
    if ($('depositModal')) return;
    const el = document.createElement('div');
    el.className = 'modal-bg modal-top';
    el.id = 'depositModal';
    el.innerHTML = `
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="depositTitle" id="depositBox">
    <div class="modal-header">
      <h2 id="depositTitle">입금처리</h2>
      <button type="button" class="close" data-dclose aria-label="닫기">&times;</button>
    </div>
    <form id="depositForm" class="modal-body" novalidate>
      <div class="section-title">주문 정보</div>
      <table class="form-table multi-col">
        <colgroup><col class="c-th"><col><col class="c-th"><col></colgroup>
        <tr><th>주문번호</th><td class="mono" id="dpOrderNo"></td><th>주문자</th><td id="dpBuyer"></td></tr>
        <tr><th>결제 구분</th><td id="dpKind"></td><th>총 결제금액</th><td><b id="dpTotal"></b> <span class="readonly" id="dpTotalSub"></span></td></tr>
        <tr id="dpStatusRow"><th>입금 현황</th><td colspan="3" id="dpStatus"></td></tr>
      </table>

      <!-- 후결제 전용: 단체 회원의 사업자 정보 (단체회원 신청 시 입력한 정보 전체) -->
      <div id="dpBizSec" hidden>
        <div class="section-title">사업자 정보 <span class="section-note">단체회원 신청 시 입력한 정보</span></div>
        <div id="dpBiz"></div>
      </div>

      <!-- 후결제 전용: 입금 내역 (분할 입금) -->
      <div id="dpPaySec" hidden>
        <div class="section-title">입금 내역</div>
        <div class="table-wrap">
          <table class="dp-pay-table">
            <thead><tr><th style="width:40px">회차</th><th style="width:150px">입금일시</th><th style="width:110px">결제수단</th><th style="width:120px;text-align:right">입금액</th><th>관리자 메모</th><th style="width:80px">처리자</th></tr></thead>
            <tbody id="dpPayBody"></tbody>
            <tfoot id="dpPayFoot"></tfoot>
          </table>
        </div>
      </div>

      <div class="section-title" id="dpFormTitle">입금 정보</div>
      <table class="form-table" id="dpFormTable">
        <tr><th>입금일시 *</th><td>
          <div class="inline-row"><input type="datetime-local" id="dpAt" aria-label="입금일시" style="width:200px"> <span class="readonly">통장에 입금된 일시 (기본값: 현재)</span></div>
        </td></tr>
        <tr><th>결제수단 *</th><td>
          <select id="dpMethod" class="w-auto" aria-label="입금받은 결제수단">${OrderData.DEPOSIT_METHODS.map(m => `<option>${esc(m)}</option>`).join('')}</select>
          <span class="readonly" style="margin-left:8px">계좌 외 방법으로 받았으면 '별도결제'. 입금처리 후 주문의 결제수단이 이 수단으로 바뀝니다</span>
        </td></tr>
        <tr><th>입금액 *</th><td>
          <div class="inline-row"><input type="text" id="dpAmount" inputmode="numeric" class="w-num" style="width:140px"> 원 <span class="readonly" id="dpAmountHint"></span></div>
          <div class="err" id="dpErr"></div>
        </td></tr>
        <tr id="dpMemoRow" hidden><th>관리자 메모</th><td>
          <!-- 오른쪽 저장: 입금 등록 없이 메모만 즉시 저장 → 주문 관리자 메모(구분 결제)·주문 히스토리. 입금 등록을 누르면 입금 내역 메모로 함께 남음 -->
          <ul class="memo-list" id="dpMemoList" hidden></ul>
          <div class="memo-save">
            <textarea id="dpMemo" maxlength="200" placeholder="입금자명, 분할 입금 사유, 확인 내용 등 (입금 내역과 주문 히스토리에 남음)" style="height:56px"></textarea>
            <button type="button" class="btn btn-gray" id="dpMemoSave">저장</button>
          </div>
        </td></tr>
      </table>
      <div class="readonly at-note" id="dpNote"></div>
    </form>
    <div class="modal-footer">
      <button type="button" class="btn" data-dclose>닫기</button>
      <button type="submit" form="depositForm" class="btn btn-primary" id="dpSubmit">입금처리</button>
    </div>
  </div>`;
    document.body.appendChild(el);
    $('depositForm').addEventListener('submit', submit);
    // 입금액: 입력하면서 천 단위 쉼표
    $('dpAmount').addEventListener('input', e => {
      const n = e.target.value.replace(/[^\d]/g, '');
      e.target.value = n ? Number(n).toLocaleString() : '';
    });
    // 관리자 메모 옆 저장: 입금 등록과 별개로 메모만 즉시 저장 (주문 상세 > 관리자메모에 구분 '결제'로 표시)
    $('dpMemoSave').addEventListener('click', () => {
      const text = $('dpMemo').value.trim();
      if (!current) return;
      if (!text) { toast('메모 내용을 입력하세요.'); $('dpMemo').focus(); return; }
      const saved = OrderData.addMemo(current.orderNo, '결제', text, ADMIN_NAME);
      $('dpMemo').value = '';
      renderMemos(current);
      toast(saved ? '관리자 메모를 저장했습니다.' : '저장소를 사용할 수 없어 이 화면에만 반영되었습니다.');
    });
    el.querySelectorAll('[data-dclose]').forEach(b => b.addEventListener('click', close));
    el.addEventListener('click', e => { if (e.target === el) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && el.classList.contains('open')) close(); });
  }

  const statusBadge = s => `<span class="badge ps-${esc(s)}">${esc(s)}</span>`;

  // 사업자 정보: 단체회원 신청 승인 시 회원 정보에 등록된 내용 (m.business). 없으면 안내
  function bizHtml(m) {
    const b = m.business;
    if (!b) return '<div class="readonly">등록된 사업자 정보가 없습니다. (단체회원 신청 승인 내역 없음 — 회원 상세에서 확인해 주세요)</div>';
    const row = (a, va, c, vc) => `<tr><th>${a}</th><td>${va}</td><th>${c}</th><td>${vc}</td></tr>`;
    return `<table class="form-table multi-col">
      <colgroup><col class="c-th"><col><col class="c-th"><col></colgroup>
      ${row('상호(단체명)', dash(b.companyName), '사업자번호', `<span class="mono">${dash(b.bizNo)}</span>`)}
      ${row('대표자', dash(b.ceo), '개업일', dash(b.openDate))}
      ${row('업태 / 종목', dash([b.bizType, b.bizItem].filter(Boolean).join(' / ')), '사업장 주소', dash(b.address))}
      ${row('담당자', dash(b.managerName), '담당자 연락처', dash(b.managerPhone))}
      ${row('담당자 이메일', dash(b.managerEmail), '사업자등록증', dash(b.certFile))}
      ${row('신청 회원구분', dash(`${b.reqCategory || m.category}${b.groupType ? ` > ${b.groupType}` : ''}`), '승인 · 적용 기간', dash(`${b.approvedAt ? b.approvedAt.slice(0, 10) + ' 승인' : ''}${b.periodFrom ? ` · ${b.periodFrom} ~ ${b.periodTo}` : ''}`))}
    </table>`;
  }

  // 입금 내역 표 + 합계/잔액
  function renderPayments(o) {
    const list = OrderData.depositsOf(o.orderNo);
    const total = o.payment.total, paid = list.reduce((t, p) => t + p.amount, 0);
    $('dpPayBody').innerHTML = list.length ? list.map((p, i) => `<tr>
        <td>${i + 1}</td><td>${esc(p.at.slice(0, 16))}</td><td>${esc(p.method)}</td><td class="num">${won(p.amount)}</td>
        <td class="memo">${p.memo ? esc(p.memo) : '<span class="muted">-</span>'}</td><td>${esc(p.by)}</td></tr>`).join('')
      : '<tr><td colspan="6" class="empty">등록된 입금이 없습니다.</td></tr>';
    $('dpPayFoot').innerHTML = `<tr><td colspan="3" style="text-align:right">입금 합계</td><td class="num">${won(paid)}</td>
        <td colspan="2" class="left">총 결제금액 ${won(total)} · ${paid >= total ? `<b>전액 입금</b>${paid > total ? ` (초과 ${won(paid - total)})` : ''}` : `잔액 <b>${won(total - paid)}</b>`}</td></tr>`;
    return { paid, remaining: Math.max(0, total - paid) };
  }

  // 저장한 관리자 메모 (주문 관리자 메모 중 구분 '결제')
  function renderMemos(o) {
    const list = OrderData.adminLog(o.orderNo).memos.filter(mm => mm.category === '결제');
    $('dpMemoList').hidden = !list.length;
    $('dpMemoList').innerHTML = list.map(mm => `<li><span class="memo-text">${esc(mm.text)}</span> <span class="memo-meta">(${esc(mm.at.slice(0, 16))} · ${esc(mm.by)})</span></li>`).join('');
  }

  function open(order, done) {
    ensure();
    current = order;
    onDone = done || null;
    const post = OrderData.isPostpayOrder(order);
    const waiting = OrderData.isWaiting(order);
    const m = order.member;
    $('depositBox').classList.toggle('modal-wide', post);
    $('depositTitle').textContent = `${post ? '입금관리' : '입금처리'} - 주문번호 ${order.orderNo}`;
    $('dpOrderNo').textContent = order.orderNo;
    $('dpBuyer').textContent = `${order.name} (${order.userId}) · ${order.phone}`;
    $('dpKind').innerHTML = post
      ? `<span class="badge ps-후결제대기">후결제</span> <span class="readonly">선결제 없이 주문, 상품 수령 후 결제 · 회원구분 ${esc(m.category)}${m.subCategory ? ` > ${esc(m.subCategory)}` : ''}</span>`
      : `<span class="badge ps-입금대기">미입금</span> <span class="readonly">${esc(order.payMethod)} 주문, 입금 전</span>`;
    $('dpTotal').textContent = won(order.payment.total);
    $('dpTotalSub').textContent = `주문금액 ${won(order.listPrice)}${order.discount ? ` − 할인 ${won(order.discount)}` : ''}${order.payment.shipFee ? ` + 배송비 ${won(order.payment.shipFee)}` : ''}`;

    // 후결제 전용 영역
    $('dpBizSec').hidden = !post;
    $('dpPaySec').hidden = !post;
    $('dpMemoRow').hidden = !post;
    $('dpStatusRow').hidden = !post;
    let remaining = order.payment.total;
    if (post) {
      $('dpBiz').innerHTML = bizHtml(m);
      const r = renderPayments(order);
      remaining = r.remaining;
      $('dpStatus').innerHTML = `${statusBadge(order.payStatus)} <span class="readonly" style="margin-left:6px">입금 합계 ${won(r.paid)} · ${remaining ? `잔액 ${won(remaining)}` : '전액 입금 완료'}</span>`;
    }

    // 입금 등록 폼: 결제가 끝난 후결제 주문은 내역만 보여주고 등록은 닫음
    $('dpFormTitle').textContent = post ? '입금 등록' : '입금 정보';
    $('dpSubmit').textContent = post ? '입금 등록' : '입금처리';
    $('dpFormTitle').hidden = post && !waiting;
    $('dpFormTable').hidden = post && !waiting;
    $('dpSubmit').hidden = post && !waiting;
    $('dpMethod').value = post ? '계좌이체' : '무통장입금';
    $('dpAmount').value = '';
    $('dpAmount').placeholder = post ? '잔액' : '총 결제금액';
    $('dpAmountHint').textContent = post ? `미입력 시 잔액 ${won(remaining)}으로 처리. 일부만 입금되면 부분결제, 전액이면 결제완료` : '미입력 시 총 결제금액으로 처리';
    $('dpMemo').value = '';
    renderMemos(order);
    $('dpAt').value = nowLocal();
    $('dpAt').max = nowLocal();
    $('dpNote').textContent = post
      ? (waiting ? '입금을 등록하면 입금 합계에 따라 결제상태가 부분결제 또는 결제완료로 바뀌고, 결제수단은 입금받은 수단으로 바뀝니다. 후결제 주문 리스트와 통합 주문 리스트에 함께 반영됩니다. (제작상태는 그대로)'
        : '입금이 모두 끝난 주문입니다. 입금 내역만 확인할 수 있습니다.')
      : '입금처리하면 결제상태가 결제완료로 바뀌고 주문이 접수됩니다. 미입금 주문 리스트에서 빠지고 통합 주문 리스트에 결제완료로 반영됩니다.';
    $('dpErr').classList.remove('show');
    $('depositModal').classList.add('open');
    if (!(post && !waiting)) $('dpAmount').focus();
  }

  function close() {
    $('depositModal').classList.remove('open');
    current = null;
    onDone = null;
  }

  function submit(e) {
    e.preventDefault();
    const o = current;
    if (!o || !OrderData.isWaiting(o)) return;
    const post = OrderData.isPostpayOrder(o);
    const total = o.payment.total;
    const paidBefore = OrderData.depositsOf(o.orderNo).reduce((t, p) => t + p.amount, 0);
    const remaining = Math.max(0, total - paidBefore);
    const raw = $('dpAmount').value.replace(/[^\d]/g, '');
    const amount = raw ? Number(raw) : (post ? remaining : total);   // 미입력 시 잔액(후결제) / 총 결제금액(미입금)
    const method = $('dpMethod').value;
    const memo = $('dpMemo').value.trim();
    const atLocal = $('dpAt').value;
    let msg = '';
    if (!amount || amount <= 0) msg = '입금액은 1원 이상이어야 합니다.';
    else if (!atLocal) msg = '입금일시를 입력하세요.';
    else if (atLocal > nowLocal()) msg = '입금일시는 현재보다 뒤일 수 없습니다.';
    $('dpErr').textContent = msg;
    $('dpErr').classList.toggle('show', !!msg);
    if (msg) { (msg.includes('입금액') ? $('dpAmount') : $('dpAt')).focus(); return; }
    const at = toStored(atLocal);

    // 처리 결과 안내: 후결제는 입금 합계로 결제완료/부분결제, 미입금은 금액이 달라도 결제완료(차액은 별도 처리)
    let resultText;
    if (post) {
      const after = paidBefore + amount;
      resultText = after >= total
        ? `입금 합계 ${won(after)} ≥ 총 결제금액 → 결제상태 결제완료${after > total ? ` (초과 ${won(after - total)}은 별도로 처리해 주세요)` : ''}`
        : `입금 합계 ${won(after)} < 총 결제금액 → 결제상태 부분결제 (잔액 ${won(total - after)})`;
    } else {
      const diff = amount - total;
      resultText = `결제상태 결제완료 · 주문 접수${diff ? `\n※ 총 결제금액보다 ${won(Math.abs(diff))} ${diff > 0 ? '많이' : '적게'} 입금되었습니다. 차액은 별도로 처리해 주세요.` : ''}`;
    }
    if (!confirm(`${o.name}(${o.userId}) 회원의 ${post ? '후결제 ' : ''}주문 ${o.orderNo}에 입금을 등록하시겠습니까?\n입금일시: ${at.slice(0, 16)}\n결제수단: ${method}\n입금액: ${won(amount)}${post ? ` (잔액 ${won(remaining)})` : ` (총 결제금액 ${won(total)})`}${memo ? `\n메모: ${memo}` : ''}\n${resultText}`)) return;

    // TODO: 실서비스에서는 POST /api/admin/orders/{orderNo}/deposits { paidAt, method, amount, memo }
    const saved = OrderData.addDeposit(o.orderNo, { method, amount, at, memo, by: ADMIN_NAME });
    const n = OrderData.depositsOf(o.orderNo).length;
    OrderData.addHistory(o.orderNo, '입금처리', `입금 등록${post && n > 1 ? ` ${n}회차` : ''} (${method}, 입금액 ${won(amount)}, 입금일시 ${at.slice(0, 16)}${memo ? `, 메모: ${memo}` : ''}) → ${o.payStatus}${!post ? '·주문 접수' : ''}`, ADMIN_NAME);
    const cb = onDone;
    toast(saved ? (post ? `입금을 등록했습니다. 결제상태: ${o.payStatus}` : '입금처리했습니다. 주문이 접수되어 결제완료로 바뀌었습니다.') : '저장소를 사용할 수 없어 이 화면에만 반영되었습니다.');
    if (post) open(o, cb);   // 후결제: 모달을 열어 둔 채 입금 내역·현황 갱신 (추가 입금 등록 가능)
    else close();
    if (cb) cb(o);
  }

  window.DepositModal = { open };
})();

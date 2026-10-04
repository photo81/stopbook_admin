// 입금처리 모달 (미입금 주문 리스트 / 주문 상세 공유)
// member-type-store.js(AdminUtil), order-data.js(OrderData) 다음에 로드
// 무통장입금 주문 중 입금대기 건을 관리자가 입금 확인: 결제수단(별도결제 포함)과 입금액을 입력 → 결제완료·주문 접수
//   입금액은 비워 두면 총 결제금액으로 처리. 총 결제금액과 다르면 확인 창에서 차액을 보여줌
// 사용: DepositModal.open(order, onDone)  onDone(order) = 처리 후 화면 갱신 (목록 다시 그리기 / 상세 다시 불러오기)
(function () {
  'use strict';
  const { esc, toast, ADMIN_NAME } = AdminUtil;
  const $ = id => document.getElementById(id);
  const won = n => `${Number(n).toLocaleString()}원`;
  let current = null, onDone = null;

  // 모달 마크업은 처음 열 때 한 번만 넣음 (두 화면에서 같은 모달을 씀)
  function ensure() {
    if ($('depositModal')) return;
    const el = document.createElement('div');
    el.className = 'modal-bg modal-top';
    el.id = 'depositModal';
    el.innerHTML = `
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="depositTitle">
    <div class="modal-header">
      <h2 id="depositTitle">입금처리</h2>
      <button type="button" class="close" data-dclose aria-label="닫기">&times;</button>
    </div>
    <form id="depositForm" class="modal-body" novalidate>
      <div class="section-title">주문 정보</div>
      <table class="form-table">
        <tr><th>주문번호</th><td class="mono" id="dpOrderNo"></td></tr>
        <tr><th>주문자</th><td id="dpBuyer"></td></tr>
        <tr><th>총 결제금액</th><td><b id="dpTotal"></b> <span class="readonly" id="dpTotalSub"></span></td></tr>
      </table>
      <div class="section-title">입금 정보</div>
      <table class="form-table">
        <tr><th>결제수단 *</th><td>
          <select id="dpMethod" class="w-auto" aria-label="입금받은 결제수단">${OrderData.PAY_METHODS.map(m => `<option>${esc(m)}</option>`).join('')}</select>
          <span class="readonly" style="margin-left:8px">계좌 외 방법으로 받았으면 '별도결제'</span>
        </td></tr>
        <tr><th>입금액 *</th><td>
          <div class="inline-row"><input type="text" id="dpAmount" inputmode="numeric" class="w-num" style="width:140px" placeholder="총 결제금액"> 원 <span class="readonly">미입력 시 총 결제금액으로 처리</span></div>
          <div class="err" id="dpErr"></div>
        </td></tr>
      </table>
      <div class="readonly at-note">입금처리하면 결제상태가 결제완료로 바뀌고 주문이 접수되어 주문접수 리스트로 이동합니다.</div>
    </form>
    <div class="modal-footer">
      <button type="button" class="btn" data-dclose>닫기</button>
      <button type="submit" form="depositForm" class="btn btn-primary">입금처리</button>
    </div>
  </div>`;
    document.body.appendChild(el);
    $('depositForm').addEventListener('submit', submit);
    // 입금액: 입력하면서 천 단위 쉼표
    $('dpAmount').addEventListener('input', e => {
      const n = e.target.value.replace(/[^\d]/g, '');
      e.target.value = n ? Number(n).toLocaleString() : '';
    });
    el.querySelectorAll('[data-dclose]').forEach(b => b.addEventListener('click', close));
    el.addEventListener('click', e => { if (e.target === el) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && el.classList.contains('open')) close(); });
  }

  function open(order, done) {
    ensure();
    current = order;
    onDone = done || null;
    $('depositTitle').textContent = `입금처리 - 주문번호 ${order.orderNo}`;
    $('dpOrderNo').textContent = order.orderNo;
    $('dpBuyer').textContent = `${order.name} (${order.userId}) · ${order.phone}`;
    $('dpTotal').textContent = won(order.payment.total);
    $('dpTotalSub').textContent = `주문금액 ${won(order.listPrice)}${order.discount ? ` − 할인 ${won(order.discount)}` : ''}${order.payment.shipFee ? ` + 배송비 ${won(order.payment.shipFee)}` : ''}`;
    $('dpMethod').value = '무통장입금';
    $('dpAmount').value = '';
    $('dpErr').classList.remove('show');
    $('depositModal').classList.add('open');
    $('dpAmount').focus();
  }

  function close() {
    $('depositModal').classList.remove('open');
    current = null;
    onDone = null;
  }

  function submit(e) {
    e.preventDefault();
    const o = current;
    if (!o) return;
    const total = o.payment.total;
    const raw = $('dpAmount').value.replace(/[^\d]/g, '');
    const amount = raw ? Number(raw) : total;   // 미입력 시 총 결제금액
    const method = $('dpMethod').value;
    let msg = '';
    if (!amount || amount <= 0) msg = '입금액은 1원 이상이어야 합니다.';
    $('dpErr').textContent = msg;
    $('dpErr').classList.toggle('show', !!msg);
    if (msg) { $('dpAmount').focus(); return; }

    const diff = amount - total;
    const diffText = diff === 0 ? '' : diff > 0 ? `\n※ 총 결제금액보다 ${won(diff)} 많이 입금되었습니다. 차액은 별도로 처리해 주세요.` : `\n※ 총 결제금액보다 ${won(-diff)} 적게 입금되었습니다. 차액은 별도로 처리해 주세요.`;
    if (!confirm(`${o.name}(${o.userId}) 회원의 주문 ${o.orderNo}을(를) 입금처리하시겠습니까?\n결제수단: ${method}\n입금액: ${won(amount)} (총 결제금액 ${won(total)})${diffText}\n처리 후 주문이 접수되어 주문접수 리스트로 이동합니다.`)) return;

    // TODO: 실서비스에서는 POST /api/admin/orders/{orderNo}/deposit { method, amount }
    const saved = OrderData.confirmDeposit(o.orderNo, { method, amount, by: ADMIN_NAME });
    OrderData.addHistory(o.orderNo, '입금처리', `입금처리 (${method}, 입금액 ${won(amount)}${diff ? `, 총 결제금액 ${won(total)}` : ''}) → 결제완료·주문 접수`, ADMIN_NAME);
    const cb = onDone;
    close();
    toast(saved ? '입금처리했습니다. 주문이 접수되어 주문접수 리스트로 이동했습니다.' : '저장소를 사용할 수 없어 이 화면에만 반영되었습니다.');
    if (cb) cb(o);
  }

  window.DepositModal = { open };
})();

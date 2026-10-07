// 제작관리 모달 (외주제작 주문 리스트 / 주문 상세 공유)
// member-type-store.js(AdminUtil), member-data.js, order-data.js(OrderData) 다음에 로드
//   외주 제작 상품(제작처가 KSI가 아님) 1개의 주문번호·상품·제작처·결제상태·현재 공정을 보여줌
//   주문번호 오른쪽 [의뢰서 다운로드] → 제작의뢰서 샘플 엑셀(CSV) 파일 다운로드 + 히스토리 기록
//   의뢰대기(결제완료·주문완료) 상품은 의뢰 메모 + [의뢰완료] → 공정 의뢰완료·제작상태 제작중
//   맨 아래 히스토리: 이 상품의 공정 진행(시스템) + 관리자 처리(의뢰서 다운로드·의뢰완료), 최근 순
// 사용: MakeModal.open(order, itemIdx, onDone, { detailLink })  onDone(saved) = 의뢰완료 후 화면 갱신 (목록 다시 그리기 / 상세 다시 불러오기)
(function () {
  'use strict';
  const { esc, toast, ADMIN_NAME } = AdminUtil;
  const $ = id => document.getElementById(id);
  const pad = n => String(n).padStart(2, '0');
  const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  let cur = null, onDone = null;   // cur = { o, idx, it }

  // 모달 마크업은 처음 열 때 한 번만 넣음
  function ensure() {
    if ($('makeModal')) return;
    const el = document.createElement('div');
    el.className = 'modal-bg';
    el.id = 'makeModal';
    el.innerHTML = `
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="mkTitle">
    <div class="modal-header">
      <h2 id="mkTitle">제작관리</h2>
      <button type="button" class="close" data-mkclose aria-label="닫기">&times;</button>
    </div>
    <div class="modal-body">
      <table class="form-table">
        <tbody id="mkBody"></tbody>
        <tbody>
          <tr id="mkMemoRow"><th>의뢰 메모</th><td>
            <!-- 오른쪽 저장: 의뢰완료와 별개로 메모만 즉시 저장 (다시 열면 채워짐, 히스토리에 기록) -->
            <div class="memo-save">
              <input type="text" id="mkMemo" maxlength="100" placeholder="발주번호·전달사항 (선택)">
              <button type="button" class="btn btn-gray" id="mkMemoSave">저장</button>
            </div>
          </td></tr>
        </tbody>
      </table>
      <p class="readonly" id="mkNote" style="margin:8px 0 0"></p>
      <div class="section-title">히스토리</div>
      <div class="table-wrap">
        <table class="mk-history">
          <thead><tr><th style="width:140px">일시</th><th style="width:80px">구분</th><th>내용</th><th style="width:80px">처리자</th></tr></thead>
          <tbody id="mkHistory"></tbody>
        </table>
      </div>
    </div>
    <div class="modal-footer">
      <a class="btn" id="mkDetail" href="#" style="margin-right:auto" hidden>주문 상세 보기</a>
      <button type="button" class="btn" data-mkclose>닫기</button>
      <button type="button" class="btn btn-primary" id="mkRequest">의뢰완료</button>
    </div>
  </div>`;
    document.body.appendChild(el);
    const close = () => el.classList.remove('open');
    el.querySelectorAll('[data-mkclose]').forEach(b => b.addEventListener('click', close));
    el.addEventListener('click', e => { if (e.target === el) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && el.classList.contains('open')) close(); });
    $('mkBody').addEventListener('click', e => { if (e.target.closest('#mkDownload')) downloadRequestSheet(); });
    $('mkMemoSave').addEventListener('click', () => {
      const { o, idx } = cur, memo = $('mkMemo').value.trim();
      if (!memo) { toast('의뢰 메모를 입력하세요.'); $('mkMemo').focus(); return; }
      const saved = OrderData.saveRequestMemo(o.orderNo, idx, memo, ADMIN_NAME);
      render();
      toast(saved ? '의뢰 메모를 저장했습니다.' : '저장소를 사용할 수 없어 이 화면에만 반영되었습니다.');
    });
    $('mkRequest').addEventListener('click', () => {
      const { o, idx, it } = cur;
      if (!confirm(`${it.name} ${it.qty}부를 ${it.maker}에 의뢰완료 처리하시겠습니까?`)) return;
      const ok = OrderData.requestOutsource(o.orderNo, idx, $('mkMemo').value.trim(), ADMIN_NAME);
      close();
      if (onDone) onDone(ok);
    });
  }

  // 히스토리: 공정 진행(시스템, 단계별 처리 시각) + 관리자 처리(주문 히스토리 중 이 상품 제작번호가 들어간 제작의뢰 기록)
  // 공정 시각은 'MM-DD HH:MM'이라 주문 연도를 붙여 정렬 (연말 주문이 해를 넘긴 경우는 다음 해로)
  function historyOf(o, it) {
    const f = it.flow, year = Number(o.orderedAt.slice(0, 4)), orderMd = o.orderedAt.slice(5, 16);
    const rows = [];
    f.steps.forEach((name, k) => {
      if (k > f.step || !f.times[k]) return;
      if (name === '의뢰완료' && it.request) return;   // 관리자가 의뢰한 경우는 아래 관리자 기록으로 표시
      const y = f.times[k] < orderMd ? year + 1 : year;
      rows.push({ at: `${y}-${f.times[k]}`, type: '공정', content: `${name}${f.canceled && k === f.step ? ' (취소)' : ''}`, by: '시스템' });
    });
    OrderData.adminLog(o.orderNo).history
      .filter(h => h.type === '제작의뢰' && h.content.includes(it.spec.makeNo))
      .forEach((h, n) => rows.push({ at: h.at, n, type: '제작의뢰', content: h.content.replace(` (제작번호 ${it.spec.makeNo})`, ''), by: h.by }));
    // 최근 순 (초 단위까지 같으면 나중에 기록한 것이 위)
    return rows.sort((a, b) => b.at.localeCompare(a.at) || (b.n || 0) - (a.n || 0));
  }

  function render() {
    const { o, it } = cur, f = it.flow, waiting = OrderData.isRequestWaiting(it);
    $('mkBody').innerHTML = [
      ['주문번호', `<div class="spec-title"><span><span class="mono">${esc(o.orderNo)}</span> · ${esc(o.name)}</span>
        <button type="button" class="btn btn-xs" id="mkDownload">의뢰서 다운로드</button></div>`],
      ['상품', `${esc(it.name)} <span class="muted">· ${it.qty}부 · 제작번호 ${esc(it.spec.makeNo)}</span>`],
      ['제작처', `<b>${esc(it.maker)}</b>`],
      ['결제상태', `<span class="badge ps-${esc(it.payStatus)}">${esc(it.payStatus)}</span>`],
      ['현재 공정', `${it.status ? `<span class="badge ${MemberData.statusClass(it.status)}">${esc(it.status)}</span> ` : ''}${esc(f.steps[f.step])}${f.canceled ? ' (취소)' : ''}`]
    ].map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('');
    $('mkMemoRow').hidden = f.canceled;   // 의뢰 전·후 모두 메모 저장 가능 (취소 상품 제외)
    $('mkMemo').value = OrderData.requestMemoOf(cur.o.orderNo, cur.idx);
    $('mkRequest').hidden = !waiting;
    $('mkNote').textContent = waiting ? `${it.maker}에 제작을 의뢰했으면 의뢰완료를 누르세요. 공정이 의뢰완료, 제작상태가 제작중으로 바뀝니다.`
      : f.canceled ? '취소된 상품입니다.'
      : OrderData.isRequested(it) ? `의뢰가 완료된 상품입니다. 현재 공정: ${f.steps[f.step]}`
      : '결제가 완료되지 않아 아직 의뢰할 수 없습니다.';
    const hist = historyOf(o, it);
    $('mkHistory').innerHTML = hist.map(h => `<tr><td>${esc(h.at.slice(0, 16))}</td><td>${esc(h.type)}</td><td class="left">${esc(h.content)}</td><td>${esc(h.by)}</td></tr>`).join('')
      || '<tr><td colspan="4" class="empty">히스토리가 없습니다.</td></tr>';
  }

  // ===== 의뢰서 다운로드: 제작의뢰서 샘플 (CSV, 엑셀에서 열림) =====
  // 의뢰 정보(의뢰일·발주처·제작처·납기 희망일) + 주문·상품 정보(제작번호·옵션·디자인·수량) + 배송 정보
  // TODO: 실서비스에서는 제작처별 의뢰서 양식(xlsx)을 서버에서 생성 (GET /api/admin/orders/{orderNo}/items/{itemId}/request-sheet)
  const pagesOf = sp => (sp.basePages ? `${sp.basePages}p${sp.addPages ? `(+${sp.addPages}p)` : ''}` : '');
  const csvCell = v => { let s = String(v ?? ''); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  function saveCsv(rows, fileName) {
    const blob = new Blob(['﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  // ===== 의뢰서 일괄 다운로드 (외주제작 주문 리스트 > 의뢰대기 탭 > 체크 > 의뢰서 다운로드) =====
  // 같은 제작처의 상품만 받음(리스트에서 제한). 선택한 상품을 한 파일에 상품 1개 = 1행으로 (제작처 열 포함). 상품마다 주문 히스토리에 '의뢰서 다운로드(일괄)' 기록
  // list = [{ o, idx }]. TODO: 실서비스에서는 제작처별 의뢰서 파일을 서버에서 만들어 압축(zip)으로 내려받기
  function downloadSheets(list) {
    const today = new Date(), due = new Date(today.getTime() + 5 * 86400000);
    const head = ['의뢰일', '납기 희망일', '제작처', '주문번호', '상품 제작번호', '상품명', '상품코드', '수량(부)', '상품형태', '사이즈', '코팅', '페이지', '후가공', '디자인', '편집내용',
      '수령인', '연락처', '주소', '배송방법', '배송 요청사항'];
    const rows = list.map(({ o, idx }) => {
      const it = o.items[idx], sp = it.spec, dv = o.delivery;
      return [fmtDate(today), fmtDate(due), it.maker, o.orderNo, sp.makeNo, it.name, it.code, it.qty, sp.form, sp.size, sp.coating, pagesOf(sp), sp.finishing, sp.coverDesign, sp.viewerUrl,
        dv.recipient, '\t' + dv.phone, `[${dv.zip}] ${dv.address} ${dv.detail}`, o.shipMethod, dv.request];
    });
    const makers = [...new Set(list.map(({ o, idx }) => o.items[idx].maker))];
    saveCsv([['제작의뢰서 (일괄)', `발주처 스탑북 · 담당자 ${ADMIN_NAME} · ${list.length}건`], [], head, ...rows],
      `제작의뢰서_${makers.length === 1 ? makers[0] : '일괄'}_${fmtDate(today).replace(/-/g, '')}_${list.length}건.csv`);
    list.forEach(({ o, idx }) => {
      const it = o.items[idx];
      OrderData.addHistory(o.orderNo, '제작의뢰', `의뢰서 다운로드(일괄 ${list.length}건): ${it.name} ${it.qty}부 · ${it.maker} (제작번호 ${it.spec.makeNo})`, ADMIN_NAME);
    });
  }

  function downloadRequestSheet() {
    const { o, it } = cur, sp = it.spec, dv = o.delivery;
    const today = new Date(), due = new Date(today.getTime() + 5 * 86400000);
    const pages = pagesOf(sp);
    const rows = [
      ['제작의뢰서'],
      [],
      ['의뢰일', fmtDate(today), '납기 희망일', fmtDate(due)],
      ['발주처', '스탑북', '제작처', it.maker],
      ['담당자', ADMIN_NAME, '연락처', '02-0000-0000'],
      [],
      ['주문번호', o.orderNo, '제작번호', sp.makeNo],
      ['상품명', it.name, '상품코드', it.code],
      ['수량(부)', it.qty, '상품형태', sp.form],
      ['사이즈', sp.size, '코팅', sp.coating],
      ['페이지', pages, '후가공', sp.finishing],
      ['디자인', sp.coverDesign, '편집내용', sp.viewerUrl],
      [],
      ['수령인', dv.recipient, '연락처', '\t' + dv.phone],
      ['주소', `[${dv.zip}] ${dv.address} ${dv.detail}`],
      ['배송방법', o.shipMethod, '배송 요청사항', dv.request],
      [],
      ['요청사항', '샘플 의뢰서입니다. 제작 완료 후 출고 예정일을 회신해 주세요.']
    ];
    saveCsv(rows, `제작의뢰서_${it.maker}_${sp.makeNo}.csv`);
    OrderData.addHistory(o.orderNo, '제작의뢰', `의뢰서 다운로드: ${it.name} ${it.qty}부 · ${it.maker} (제작번호 ${sp.makeNo})`, ADMIN_NAME);
    render();
    toast('의뢰서를 다운로드했습니다.');
  }

  // opts.detailLink: 왼쪽 아래 '주문 상세 보기' 링크 표시 (외주제작 주문 리스트에서 열 때)
  function open(o, idx, done, opts = {}) {
    ensure();
    cur = { o, idx, it: o.items[idx] };
    onDone = done;
    render();
    $('mkDetail').hidden = !opts.detailLink;
    $('mkDetail').href = `order-detail.html?orderNo=${encodeURIComponent(o.orderNo)}&item=${idx}`;
    $('makeModal').classList.add('open');
  }

  window.MakeModal = { open, downloadSheets };
})();

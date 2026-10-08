// 선결제 주문 (prepaid-orders.html): 선결제로 구매한 상품권(스탑북 제작권) 목록
// member-type-store.js(AdminUtil), member-data.js, order-data.js(OrderData.VOUCHERS) 다음에 로드
//   열: 기기 · 주문일시(상품권 구매 일시) · 주문자명 · 이메일 · 주문번호 · 상품권명 · 주문수량 · 결제수단 · 주문금액 · 사용금액 · 잔액 · 상태 · 관리
//   상태: 입금대기(무통장입금 입금 전) / 결제완료(사용 전) / 부분사용 / 사용완료 / 결제취소
//   관리: 모달에서 상품권 정보 확인 + 관리자 메모 저장, 하단 히스토리(구매·소진·결제취소·관리자 메모)
(function () {
  'use strict';
  const { esc, toast, initSidebar, ADMIN_NAME } = AdminUtil;
  const $ = id => document.getElementById(id);
  const won = n => `${Number(n).toLocaleString()}원`;
  const pad = n => String(n).padStart(2, '0');
  const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const { VOUCHERS, VOUCHER_FACES, VOUCHER_STATUSES, voucherName, voucherBalance, voucherHistory, addVoucherMemo } = OrderData;
  VOUCHERS.forEach(v => { v.balance = voucherBalance(v); });   // 잔액 (정렬용)
  const state = { filtered: [], page: 1, size: 10, sortKey: 'purchasedAt', sortDir: 'desc', search: null };
  let current = null;

  $('sFace').insertAdjacentHTML('beforeend', VOUCHER_FACES.map(f => `<option value="${f}">${esc(voucherName(f))}</option>`).join(''));
  $('sStatus').insertAdjacentHTML('beforeend', VOUCHER_STATUSES.map(s => `<option>${esc(s)}</option>`).join(''));

  // ===== 검색 =====
  function readSearch() {
    const from = $('sFrom').value, to = $('sTo').value;
    if (from && to && from > to) { toast('기간 시작일이 종료일보다 늦습니다.'); return null; }
    return { type: $('sType').value, kw: $('sKeyword').value.trim().toLowerCase().replace(/-/g, ''), from, to, face: $('sFace').value, status: $('sStatus').value };
  }
  function describe(s) {
    const parts = [];
    if (s.kw) parts.push(`${$('sType').selectedOptions[0].textContent} "${$('sKeyword').value.trim()}"`);
    if (s.from || s.to) parts.push(`구매일 ${s.from || '처음'} ~ ${s.to || '오늘'}`);
    if (s.face) parts.push(`상품권명 ${voucherName(Number(s.face))}`);
    if (s.status) parts.push(`상태 ${s.status}`);
    return parts;
  }
  const FIELDS = { no: v => v.no, name: v => v.name, userId: v => v.userId, email: v => v.email, phone: v => v.phone };
  function apply(s) {
    state.search = s;
    const parts = describe(s);
    $('listGuide').innerHTML = parts.length ? `· ${parts.map(p => `<b>${esc(p)}</b>`).join(' · ')}` : '';
    state.page = 1;
    refilter();
  }
  function refilter() {
    const s = state.search;
    const keys = s.type === 'all' ? Object.keys(FIELDS) : [s.type];
    state.filtered = VOUCHERS.filter(v => {
      const day = v.purchasedAt.slice(0, 10);
      return (!s.kw || keys.some(k => String(FIELDS[k](v)).toLowerCase().replace(/-/g, '').includes(s.kw))) &&
        (!s.from || day >= s.from) && (!s.to || day <= s.to) &&
        (!s.face || v.face === Number(s.face)) && (!s.status || v.status === s.status);
    });
    sort();
    render();
  }
  function sort() {
    const { sortKey: k, sortDir: d } = state;
    state.filtered.sort((a, b) => {
      const r = typeof a[k] === 'number' ? a[k] - b[k] : String(a[k]).localeCompare(String(b[k]), 'ko');
      return (d === 'asc' ? r : -r) || b.purchasedAt.localeCompare(a.purchasedAt);
    });
  }

  // ===== 목록 =====
  const statusBadge = st => `<span class="badge vs-${esc(st)}">${esc(st)}</span>`;
  function render() {
    const total = state.filtered.length, pages = Math.max(1, Math.ceil(total / state.size));
    if (state.page > pages) state.page = pages;
    const start = (state.page - 1) * state.size;
    $('totalCount').textContent = total.toLocaleString();
    $('allCount').textContent = VOUCHERS.length.toLocaleString();
    $('listBody').innerHTML = state.filtered.slice(start, start + state.size).map(v => `<tr>
        <td><span class="env-tag env-${v.env}" title="${v.env === 'MO' ? '모바일' : 'PC'}에서 결제">${v.env}</span></td>
        <td title="${esc(v.purchasedAt)}">${esc(v.purchasedAt.slice(0, 16))}</td>
        <td>${esc(v.name)}</td>
        <td class="left ellip" title="${esc(v.email)}">${esc(v.email.split('@')[0])}</td>
        <td class="mono">${esc(v.no)}</td>
        <td class="left">${esc(voucherName(v.face))}</td>
        <td class="num">${v.qty}매</td>
        <td class="c-pay">${esc(v.payMethod)}</td>
        <td class="num"><b>${won(v.amount)}</b></td>
        <td class="num">${v.used ? won(v.used) : '<span class="muted">0원</span>'}</td>
        <td class="num">${v.status === '입금대기' ? '<span class="muted">입금 전</span>' : v.status === '결제취소' ? '<span class="muted">-</span>' : v.balance ? `<b>${won(v.balance)}</b>` : '<span class="muted">0원</span>'}</td>
        <td>${statusBadge(v.status)}</td>
        <td class="c-act"><button type="button" class="btn btn-xs" data-v="${esc(v.no)}">관리</button></td>
      </tr>`).join('') || '<tr><td colspan="13" class="empty">검색 결과가 없습니다.</td></tr>';
    document.querySelectorAll('.order-table th.sortable').forEach(th => {
      const active = th.dataset.key === state.sortKey;
      const label = th.textContent.replace(/[▲▼↕]/g, '').trim();
      th.innerHTML = `${label}<span class="arrow">${active ? (state.sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>`;
    });
    const cur = state.page, bs = Math.floor((cur - 1) / 10) * 10 + 1, be = Math.min(pages, bs + 9);
    let html = `<button data-page="1" ${cur === 1 ? 'disabled' : ''}>«</button><button data-page="${cur - 1}" ${cur === 1 ? 'disabled' : ''}>‹</button>`;
    for (let p = bs; p <= be; p++) html += `<button data-page="${p}" class="${p === cur ? 'active' : ''}">${p}</button>`;
    html += `<button data-page="${cur + 1}" ${cur === pages ? 'disabled' : ''}>›</button><button data-page="${pages}" ${cur === pages ? 'disabled' : ''}>»</button>`;
    $('pagination').innerHTML = html;
  }

  // ===== 관리 모달 =====
  function renderModal() {
    const v = current;
    $('vTitle').textContent = `선결제 관리 - ${v.no}`;
    const row = (a, va, c, vc) => `<tr><th>${a}</th><td>${va}</td><th>${c}</th><td>${vc}</td></tr>`;
    $('vInfo').innerHTML = [
      row('주문번호', `<span class="mono">${esc(v.no)}</span>`, '주문일시', esc(v.purchasedAt)),
      row('주문자', `${esc(v.name)} <span class="muted">(${esc(v.userId)})</span>`, '연락처', `${esc(v.phone)} · ${esc(v.email)}`),
      row('상품권명', esc(voucherName(v.face)), '주문수량', `${v.qty}매`),
      row('주문금액', `<b>${won(v.amount)}</b> <span class="muted">(${esc(v.payMethod)})</span>`, '상태', statusBadge(v.status)),
      row('사용금액', won(v.used), '잔액', v.status === '결제취소' ? '<span class="muted">결제취소 (환불)</span>' : v.status === '입금대기' ? '<span class="muted">입금 전</span>' : `<b>${won(v.balance)}</b>`),
      row('사용 주문', v.usages.length ? v.usages.map(u => `<a class="name-link mono" href="order-detail.html?orderNo=${encodeURIComponent(u.orderNo)}">${esc(u.orderNo)}</a> <span class="muted">${won(u.amount)}</span>`).join('<br>') : '<span class="muted">-</span>', '결제취소', v.canceledAt ? esc(v.canceledAt) : '<span class="muted">-</span>')
    ].join('');
    // 주문번호 열: 소진은 상품권으로 결제한 주문(누르면 주문 상세), 구매·결제취소는 상품권 주문번호
    const orderCell = h => (!h.orderNo ? '<span class="muted">-</span>' : h.type === '소진' ? `<a class="name-link mono" href="order-detail.html?orderNo=${encodeURIComponent(h.orderNo)}">${esc(h.orderNo)}</a>` : `<span class="mono">${esc(h.orderNo)}</span>`);
    $('vHistory').innerHTML = voucherHistory(v).map(h => `<tr><td>${esc(h.at.slice(0, 16))}</td><td>${esc(h.type)}</td><td>${orderCell(h)}</td><td class="left">${esc(h.content)}</td><td>${esc(h.by)}</td></tr>`).join('');
  }
  const closeModal = () => $('vModal').classList.remove('open');
  $('listBody').addEventListener('click', e => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    current = VOUCHERS.find(v => v.no === b.dataset.v);
    if (!current) return;
    $('vMemo').value = '';
    renderModal();
    $('vModal').classList.add('open');
  });
  // 관리자 메모 저장: 즉시 저장 + 히스토리에 '관리자 메모'로 남김
  $('vMemoSave').addEventListener('click', () => {
    const text = $('vMemo').value.trim();
    if (!current) return;
    if (!text) { toast('메모 내용을 입력하세요.'); $('vMemo').focus(); return; }
    const saved = addVoucherMemo(current.no, text, ADMIN_NAME);
    $('vMemo').value = '';
    renderModal();
    toast(saved ? '관리자 메모를 저장했습니다.' : '저장소를 사용할 수 없어 이 화면에만 반영되었습니다.');
  });
  document.querySelectorAll('#vModal [data-close]').forEach(b => b.addEventListener('click', closeModal));
  $('vModal').addEventListener('click', e => { if (e.target === $('vModal')) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  // ===== 엑셀(CSV) 다운로드: 현재 검색 결과 전체, 목록 정렬 순서대로 =====
  // 목록 열 + 관리 모달 내용(주문자 정보·결제수단·사용 주문·결제취소·관리자 메모·히스토리) 전부. 금액·수량은 숫자만
  //   상품권 단위: 상품권 1건 = 1행 (사용 주문·관리자 메모·히스토리는 한 칸에 줄바꿈으로 나열)
  //   히스토리 단위: 이력 1건 = 1행 (상품권 정보는 줄마다 반복)
  // TODO: 실서비스에서는 서버에서 파일 생성 (GET /api/admin/vouchers/export?{조건})
  const balanceText = v => (v.status === '입금대기' ? '입금 전' : v.status === '결제취소' ? '' : v.balance);
  const BASE_COLS = [
    ['결제환경', v => v.env], ['주문일시', v => v.purchasedAt], ['주문자명', v => v.name], ['아이디', v => v.userId], ['이메일', v => v.email], ['휴대폰', v => '\t' + v.phone],
    ['주문번호', v => v.no], ['상품권명', v => voucherName(v.face)], ['권면금액(원)', v => v.face], ['주문수량(매)', v => v.qty], ['주문금액(원)', v => v.amount],
    ['결제수단', v => v.payMethod], ['사용금액(원)', v => v.used], ['잔액(원)', balanceText], ['상태', v => v.status], ['결제취소일시', v => v.canceledAt]
  ];
  const EXPORT_UNITS = {
    voucher: {
      label: '상품권 단위', file: '선결제주문목록', unit: '건',
      head: [...BASE_COLS.map(c => c[0]), '사용 주문 수', '사용 주문 (주문번호 · 사용일시 · 사용금액 · 사용 후 잔액)', '관리자 메모', '히스토리'],
      rows: list => list.map(v => [...BASE_COLS.map(c => c[1](v)), v.usages.length,
        v.usages.map(u => `${u.orderNo} · ${u.at.slice(0, 16)} · ${u.amount.toLocaleString()}원 · 잔액 ${u.balance.toLocaleString()}원`).join('\n'),
        OrderData.voucherMemos(v.no).map(m => `[${m.at.slice(0, 16)} ${m.by}] ${m.text}`).join('\n'),
        voucherHistory(v).map(h => `[${h.at.slice(0, 16)}] ${h.type}${h.orderNo ? ` ${h.orderNo}` : ''} · ${h.content} (${h.by})`).join('\n')])
    },
    history: {
      label: '히스토리 단위', file: '선결제주문히스토리', unit: '이력',
      head: [...BASE_COLS.map(c => c[0]), '이력 일시', '이력 구분', '이력 주문번호', '이력 내용', '처리자'],
      rows: list => list.flatMap(v => voucherHistory(v).map(h => [...BASE_COLS.map(c => c[1](v)), h.at, h.type, h.orderNo, h.content, h.by]))
    }
  };
  function downloadExcel(unitKey) {
    if (!state.filtered.length) { toast('다운로드할 데이터가 없습니다.'); return; }
    const u = EXPORT_UNITS[unitKey];
    const cell = val => { let s = String(val ?? ''); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const rows = u.rows(state.filtered);
    const blob = new Blob(['﻿' + [u.head, ...rows].map(r => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${u.file}_${fmtDate(new Date()).replace(/-/g, '')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    toast(`${u.label}로 ${rows.length.toLocaleString()}${u.unit === '건' ? '건' : '건(이력)'}을 다운로드했습니다.`);
  }
  const closeDlMenu = () => { $('dlMenu').hidden = true; $('btnExcel').setAttribute('aria-expanded', 'false'); };
  $('btnExcel').addEventListener('click', e => {
    e.stopPropagation();
    const open = $('dlMenu').hidden;
    $('dlMenu').hidden = !open;
    $('btnExcel').setAttribute('aria-expanded', String(open));
  });
  $('dlMenu').addEventListener('click', e => { const b = e.target.closest('[data-unit]'); if (!b) return; closeDlMenu(); downloadExcel(b.dataset.unit); });
  document.addEventListener('click', e => { if (!e.target.closest('.dl-wrap')) closeDlMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDlMenu(); });
  // ===== 검색 폼 · 정렬 · 페이지 =====
  $('searchForm').addEventListener('submit', e => { e.preventDefault(); const s = readSearch(); if (s) apply(s); });
  $('searchForm').addEventListener('click', e => {
    const b = e.target.closest('[data-days]');
    if (!b) return;
    const d = b.dataset.days;
    if (d === 'all') { $('sFrom').value = ''; $('sTo').value = ''; }
    else { const today = AdminUtil.listToday(); $('sFrom').value = fmtDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - Number(d))); $('sTo').value = fmtDate(today); }
    document.querySelectorAll('[data-days]').forEach(x => x.classList.toggle('btn-adjust', x === b));
  });
  ['sFrom', 'sTo'].forEach(id => $(id).addEventListener('input', () => document.querySelectorAll('[data-days]').forEach(x => x.classList.remove('btn-adjust'))));
  $('btnReset').addEventListener('click', () => { $('searchForm').reset(); AdminUtil.setDefaultRange(); apply(readSearch()); });
  $('pageSize').addEventListener('change', e => { state.size = Number(e.target.value); state.page = 1; render(); });
  $('pagination').addEventListener('click', e => { const b = e.target.closest('button[data-page]'); if (b && !b.disabled) { state.page = Number(b.dataset.page); render(); } });
  document.querySelector('.order-table thead').addEventListener('click', e => {
    const th = e.target.closest('th.sortable');
    if (!th) return;
    const k = th.dataset.key;
    if (state.sortKey === k) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    else { state.sortKey = k; state.sortDir = ['purchasedAt', 'qty', 'amount', 'used', 'balance'].includes(k) ? 'desc' : 'asc'; }
    sort(); render();
  });

  initSidebar();
  AdminUtil.setDefaultRange();   // 처음 열면 구매일 최근 1개월 (관리자가 바꿔 검색 가능)
  apply(readSearch());
})();

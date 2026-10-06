// 주문 목록 화면 공용 스크립트 (통합 주문 리스트 orders.html / 미입금 주문 리스트 unpaid-orders.html / 후결제 주문 리스트 postpay-orders.html)
// member-type-store.js, member-data.js, order-data.js, deposit-modal.js 다음에 로드하고 OrderList.init({ mode }) 호출
//   mode 'accepted': 주문 전부 (미입금 주문은 결제상태 입금대기로 표시. 후결제 주문은 접수 즉시 여기에도 나옴)
//   mode 'unpaid':   무통장입금 미입금 주문 (결제상태 입금대기). 맨 오른쪽 관리 열에 입금처리 버튼 → 처리하면 이 목록에서 빠지고 통합 주문 리스트에는 결제완료로 반영
//   mode 'postpay':  후결제 주문 전부 (선결제 없이 주문, 상품 수령 후 결제). 구성은 미입금과 같고 후결제대기 건에만 입금처리 버튼
//                    → 처리하면 결제상태(결제완료)·결제수단(입금받은 수단)이 바뀌어 이 목록과 통합 주문 리스트에 같이 반영 (목록에서 빠지지 않음)
// 세 화면의 검색 조건·목록·엑셀 구성은 같고, 화면별 HTML(검색 폼·표)은 각 파일에 둠
(function () {
  'use strict';
  const { toast, initSidebar } = AdminUtil;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const won = n => `${Number(n).toLocaleString()}원`;

  function init({ mode }) {
    const unpaid = mode !== 'accepted';   // 미입금·후결제: 입금처리 대상 목록 (관리 열 표시)
    const postpay = mode === 'postpay';
    // ===== 주문 데이터: order-data.js (주문 상세와 공유) =====
    const { ORDERS, TODAY } = OrderData;
    const source = () => (postpay ? ORDERS.filter(OrderData.isPostpayOrder) : unpaid ? ORDERS.filter(OrderData.isUnpaid) : ORDERS);

    // ===== 상세검색 항목 (다중 선택) =====
    // 회원구분 선택지는 회원 유형 관리 > 회원구분 탭의 항목 (회원 리스트와 같은 방식, 숨긴 구분도 검색 가능)
    // 결제수단 선택지는 order-data.js의 PAY_METHODS (별도결제 포함). 미입금 화면은 결제수단·결제상태가 정해져 있어 두 항목을 뺌
    // TODO: 결제수단·입금상태·진행상태·배송방법 선택지는 실서비스에서 주문 설정값으로 대체
    const CAT_TREE = MemberTypeStore.categoryTree();
    const DETAIL_FIELDS = [
      ...(unpaid && !postpay ? [] : [
        ...(postpay ? [] : [{ key: 'payMethod', label: '결제수단', options: OrderData.PAY_METHODS.map(v => [v, v]) }]),
        // 입금대기: 무통장입금 미입금 (통합 주문 리스트에만) / 후결제대기·부분결제: 후결제 주문 중 입금 전·일부 입금 (통합 주문 리스트에도 나오므로 두 화면 모두 선택지에 둠)
        { key: 'payStatus', label: '결제상태', options: [...(postpay ? [] : ['입금대기']), '후결제대기', '부분결제', '결제완료', '부분취소', '전체취소'].map(v => [v, v]) }
      ]),
      // 제작상태: 상품별 진행상태. 고른 상태의 상품이 하나라도 있는 주문을 찾음 (미입금은 입금 전이라 접수대기뿐, 후결제는 제작·배송이 진행됨)
      { key: 'status', label: '제작상태', options: (unpaid && !postpay ? ['접수대기'] : OrderData.ITEM_STATUS_ORDER).map(v => [v, v]) },
      { key: 'category', label: '회원구분', options: CAT_TREE.map(c => [c.code, c.label + (c.hidden ? ' (숨김)' : '')]) },
      // 상담여부: 관리자 메모 구분 (주문 상세 > 관리정보에서 등록). 고른 구분의 메모가 있는 주문을 찾음
      { key: 'inquiry', label: '상담여부', options: OrderData.MEMO_CATEGORIES.map(c => [c, c]) },
      { key: 'shipMethod', label: '배송방법', options: ['택배', '방문수령', '퀵서비스'].map(v => [v, v]) }
    ];
    // 드롭다운(버튼 + 체크 목록). 버튼에는 '전체' / '신용카드' / '신용카드 외 2'처럼 요약 표시
    $('detailSearch').innerHTML = DETAIL_FIELDS.map(f => `
      <div class="field">
        <label id="lbl-${f.key}">${f.label}</label>
        <div class="multi-select" data-key="${f.key}">
          <button type="button" class="ms-btn" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="lbl-${f.key} ms-text-${f.key}">
            <span class="ms-text" id="ms-text-${f.key}">전체</span>
          </button>
          <div class="ms-panel" role="group" aria-labelledby="lbl-${f.key}" hidden>
            <label class="ms-opt ms-all"><input type="checkbox" data-all="${f.key}" checked> 전체</label>${f.options.map(([v, t]) => `
            <label class="ms-opt"><input type="checkbox" name="${f.key}" value="${esc(v)}"> ${esc(t)}</label>`).join('')}
          </div>
        </div>
      </div>`).join('');
    const checkedValues = key => [...document.querySelectorAll(`input[name=${key}]:checked`)].map(i => i.value);
    const optionText = (key, v) => { const f = DETAIL_FIELDS.find(x => x.key === key); const o = f && f.options.find(x => x[0] === v); return o ? o[1] : v; };

    // 버튼 요약 문구와 '전체' 체크 상태 갱신
    function syncMulti(key) {
      const vals = checkedValues(key);
      document.querySelector(`[data-all=${key}]`).checked = !vals.length;
      const text = !vals.length ? '전체' : vals.length === 1 ? optionText(key, vals[0]) : `${optionText(key, vals[0])} 외 ${vals.length - 1}`;
      const el = $('ms-text-' + key);
      el.textContent = text;
      el.title = vals.map(v => optionText(key, v)).join(', ');
      el.closest('.multi-select').classList.toggle('has-value', !!vals.length);
    }
    const syncAllMulti = () => DETAIL_FIELDS.forEach(f => syncMulti(f.key));

    function closeMulti(except) {
      document.querySelectorAll('.multi-select').forEach(ms => {
        if (ms === except) return;
        ms.querySelector('.ms-panel').hidden = true;
        ms.querySelector('.ms-btn').setAttribute('aria-expanded', 'false');
      });
    }
    $('detailSearch').addEventListener('click', e => {
      const btn = e.target.closest('.ms-btn');
      if (!btn) return;
      const ms = btn.closest('.multi-select');
      const panel = ms.querySelector('.ms-panel');
      closeMulti(ms);
      panel.hidden = !panel.hidden;
      btn.setAttribute('aria-expanded', String(!panel.hidden));
      if (!panel.hidden) panel.querySelector('input').focus();
    });
    $('detailSearch').addEventListener('change', e => {
      const all = e.target.dataset.all;
      if (all) {   // '전체'를 체크하면 개별 선택 해제. 이미 전체인 상태에서 해제하려 하면 그대로 유지
        document.querySelectorAll(`input[name=${all}]`).forEach(i => { i.checked = false; });
        syncMulti(all);
      } else if (e.target.name) syncMulti(e.target.name);
    });
    // 바깥을 누르거나 Esc를 누르면 닫힘
    document.addEventListener('click', e => { if (!e.target.closest('.multi-select')) closeMulti(); });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      const open = document.querySelector('.ms-panel:not([hidden])');
      if (open) { closeMulti(); open.closest('.multi-select').querySelector('.ms-btn').focus(); }
    });

    // ===== 기간 빠른 선택 (오늘 / 7일 / 1개월 / 3개월 / 전체) =====
    $('searchForm').addEventListener('click', e => {
      const b = e.target.closest('[data-days]');
      if (!b) return;
      const d = b.dataset.days;
      if (d === 'all') { $('sFrom').value = ''; $('sTo').value = ''; }
      else {
        const from = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() - Number(d));
        $('sFrom').value = fmtDate(from);
        $('sTo').value = fmtDate(TODAY);
      }
      document.querySelectorAll('[data-days]').forEach(x => x.classList.toggle('btn-adjust', x === b));
    });
    // 날짜를 직접 고치면 빠른 선택 표시 해제
    ['sFrom', 'sTo'].forEach(id => $(id).addEventListener('input', () => document.querySelectorAll('[data-days]').forEach(x => x.classList.remove('btn-adjust'))));

    // ===== 상세검색 아코디언 =====
    // 접혀 있어도 적용 중인 상세조건 개수를 표시해 숨은 필터를 놓치지 않게 한다
    function updateDetailCount() {
      const n = DETAIL_FIELDS.filter(f => checkedValues(f.key).length).length;   // 값을 하나라도 고른 항목 수
      $('detailCount').textContent = n ? `(${n})` : '';
    }
    $('btnDetail').addEventListener('click', () => {
      const open = $('detailSearch').hidden;
      $('detailSearch').hidden = !open;
      $('btnDetail').setAttribute('aria-expanded', String(open));
    });
    $('detailSearch').addEventListener('change', updateDetailCount);

    // ===== 검색 조건 읽기 =====
    // 반환: 조건 객체 또는 null(입력 오류)
    // TODO: 실서비스에서는 GET /api/admin/orders?{조건} 로 조회 (미입금 화면은 unpaid=true)
    function readSearch() {
      const v = id => $(id).value;
      const from = v('sFrom'), to = v('sTo');
      if (from && to && from > to) { toast('기간 시작일이 종료일보다 늦습니다.'); $('sFrom').focus(); return null; }
      const s = { type: v('sType'), keyword: v('sKeyword').trim(), dateType: v('sDateType'), from, to };
      DETAIL_FIELDS.forEach(f => { s[f.key] = checkedValues(f.key); });   // 상세 조건은 배열 (빈 배열 = 전체)
      return s;
    }

    // 적용 중인 조건을 목록 상단에 한 줄로 표시
    function describe(s) {
      const parts = [];
      if (s.keyword) parts.push(`${$('sType').selectedOptions[0].textContent} "${s.keyword}"`);
      if (s.from || s.to) parts.push(`${$('sDateType').selectedOptions[0].textContent} ${s.from || '처음'} ~ ${s.to || '오늘'}`);
      DETAIL_FIELDS.forEach(f => { if (s[f.key].length) parts.push(`${f.label} ${s[f.key].map(v => optionText(f.key, v)).join(', ')}`); });
      return parts;
    }

    // ===== 검색 적용 =====
    // 상세 조건은 항목 안에서는 '하나라도 해당', 항목끼리는 '모두 해당'
    // 상품명 검색은 주문의 모든 상품명(productNames)에서 찾음 ('마이트립북 외 2종'의 나머지 상품도 검색됨)
    const KEYWORD_FIELDS = ['orderNo', 'name', 'recipient', 'userId', 'email', 'phone', 'productNames'];
    const DATE_KEY = { orderedAt: 'orderDate', paidAt: 'paidAt', shippedAt: 'shippedAt' };
    const state = { filtered: [], page: 1, size: 10, sortKey: 'orderedAt', sortDir: 'desc', search: null, tab: 'all' };
    const inSet = (list, v) => !list || !list.length || list.includes(v);
    // 상담여부: 고른 구분의 관리자 메모가 하나라도 있으면 해당
    const matchInquiry = (list, o) => !list.length || OrderData.memoCategories(o.orderNo).some(c => list.includes(c));
    const inquiryText = o => OrderData.memoCategories(o.orderNo).join(', ');   // 엑셀 상담여부 열: 메모 구분 나열

    // ===== 결제상태 탭 (후결제 주문 리스트: 전체 / 후결제대기 / 부분결제 / 결제완료) =====
    // 검색 조건과 함께 적용. 탭 건수는 검색 결과 기준. 입금을 등록하면 입금 합계에 따라 후결제대기 → 부분결제 → 결제완료 탭으로 옮겨감
    // (부분취소·전체취소 건은 전체 탭에서만 보임)
    const TABS = $('statusTabs') ? [
      { key: 'all', label: '전체', test: () => true },
      ...['후결제대기', '부분결제', '결제완료'].map(st => ({ key: st, label: st, test: o => o.payStatus === st }))
    ] : null;
    function renderTabs(base) {
      if (!TABS) return;
      $('statusTabs').innerHTML = TABS.map(t => `
        <button type="button" role="tab" class="tab ${t.key === state.tab ? 'active' : ''}" aria-selected="${t.key === state.tab}" data-status="${t.key}">
          ${t.label} <span class="tab-count">${base.filter(t.test).length.toLocaleString()}</span></button>`).join('');
    }
    if (TABS) $('statusTabs').addEventListener('click', e => {
      const b = e.target.closest('[data-status]');
      if (!b) return;
      state.tab = b.dataset.status;
      state.page = 1;
      refilter();
    });

    function applySearch(s) {
      state.search = s;
      const parts = describe(s);
      $('listGuide').innerHTML = parts.length ? `· ${parts.map(p => `<b>${esc(p)}</b>`).join(' · ')}` : '';
      state.page = 1;
      refilter();
    }

    // 현재 조건으로 다시 거름 (입금처리 뒤 목록에서 빠진 주문 반영. 페이지는 유지, 범위를 넘으면 render에서 맞춤)
    function refilter() {
      const s = state.search;
      const kw = s.keyword.toLowerCase().replace(/-/g, '');
      const fields = s.type === 'all' ? KEYWORD_FIELDS : [s.type === 'product' ? 'productNames' : s.type];
      const dk = DATE_KEY[s.dateType];
      const base = source().filter(o =>
        (!kw || fields.some(f => String(o[f]).toLowerCase().replace(/-/g, '').includes(kw))) &&
        (!(s.from || s.to) || (o[dk] && (!s.from || o[dk] >= s.from) && (!s.to || o[dk] <= s.to))) &&   // 결제·발송 전 주문은 해당 기간 검색에서 제외
        inSet(s.payMethod, o.payMethod) && inSet(s.payStatus, o.payStatus) && (!s.status.length || o.statusCounts.some(([st]) => s.status.includes(st))) &&
        inSet(s.category, o.categoryCode) && matchInquiry(s.inquiry, o) && inSet(s.shipMethod, o.shipMethod)
      );
      renderTabs(base);
      const tab = TABS && TABS.find(t => t.key === state.tab);
      state.filtered = tab ? base.filter(tab.test) : base;
      sortData();
      render();
    }

    function sortData() {
      const { sortKey: k, sortDir: d } = state;
      state.filtered.sort((a, b) => {
        const r = typeof a[k] === 'number' ? a[k] - b[k] : String(a[k]).localeCompare(String(b[k]), 'ko');
        return (d === 'asc' ? r : -r) || b.orderedAt.localeCompare(a.orderedAt);
      });
    }

    // ===== 목록 =====
    const payBadge = (s, suffix = '') => `<span class="badge ps-${esc(s)}">${esc(s)}${suffix}</span>`;
    // 제작상태는 목록에 표시하지 않음 (검색단 제작상태 검색·엑셀에는 유지)
    // 결제상태: 부분취소는 취소된 상품 수를 함께 표시. 예) 부분취소(1)
    const payCell = o => payBadge(o.payStatus, o.payStatus === '부분취소' ? `(${o.canceledItems})` : '');
    const COLS = unpaid ? 13 : 12;

    function render() {
      const total = state.filtered.length;
      const pages = Math.max(1, Math.ceil(total / state.size));
      if (state.page > pages) state.page = pages;
      const start = (state.page - 1) * state.size;
      $('totalCount').textContent = total.toLocaleString();
      $('allCount').textContent = source().length.toLocaleString();
      $('listBody').innerHTML = state.filtered.slice(start, start + state.size).map(o => `<tr>
          <td><span class="env-tag env-${o.env}" title="${o.env === 'MO' ? '모바일' : 'PC'}에서 결제">${o.env}</span></td>
          <td title="${o.orderedAt}">${o.orderedAt.slice(0, 16)}</td>
          <td>${esc(o.name)}</td>
          <td class="left ellip" title="${esc(o.email)}">${esc(o.email.split('@')[0])}</td>
          <td class="mono"><a class="name-link" href="order-detail.html?orderNo=${encodeURIComponent(o.orderNo)}">${esc(o.orderNo)}</a></td>
          <td class="left ellip" title="${esc(o.productNames)}">${esc(o.title)}</td>
          <td class="num">${o.kinds}건/${o.qty}부</td>
          <td class="num">${won(o.listPrice)}</td>
          <td class="num">${o.discount ? `-${won(o.discount)}` : '<span class="muted">0원</span>'}</td>
          <td class="num"><b>${won(o.amount)}</b></td>
          <td class="c-pay">${esc(o.payMethod)}</td>
          <td>${payCell(o)}</td>
          ${postpay ? `<td class="c-act"><button type="button" class="btn btn-xs ${OrderData.isWaiting(o) ? 'btn-primary' : ''}" data-deposit="${esc(o.orderNo)}">입금관리</button></td>`
            : unpaid ? `<td class="c-act">${OrderData.isWaiting(o) ? `<button type="button" class="btn btn-xs btn-primary" data-deposit="${esc(o.orderNo)}">입금처리</button>` : '<span class="muted">입금완료</span>'}</td>` : ''}
        </tr>`).join('') || `<tr><td colspan="${COLS}" class="empty">${unpaid && !source().length ? `${postpay ? '후결제' : '미입금'} 주문이 없습니다.` : '검색 결과가 없습니다.'}</td></tr>`;

      document.querySelectorAll('.order-table th.sortable').forEach(th => {
        const active = th.dataset.key === state.sortKey;
        const label = th.textContent.replace(/[▲▼↕]/g, '').trim();
        th.innerHTML = `${label}<span class="arrow">${active ? (state.sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>`;
      });
      renderPagination(pages);
    }

    function renderPagination(pages) {
      const cur = state.page;
      const blockStart = Math.floor((cur - 1) / 10) * 10 + 1;
      const blockEnd = Math.min(pages, blockStart + 9);
      let html = `<button data-page="1" ${cur === 1 ? 'disabled' : ''}>«</button>`;
      html += `<button data-page="${cur - 1}" ${cur === 1 ? 'disabled' : ''}>‹</button>`;
      for (let p = blockStart; p <= blockEnd; p++) html += `<button data-page="${p}" class="${p === cur ? 'active' : ''}">${p}</button>`;
      html += `<button data-page="${cur + 1}" ${cur === pages ? 'disabled' : ''}>›</button>`;
      html += `<button data-page="${pages}" ${cur === pages ? 'disabled' : ''}>»</button>`;
      $('pagination').innerHTML = html;
    }

    $('searchForm').addEventListener('submit', e => {
      e.preventDefault();
      closeMulti();
      const s = readSearch();
      if (s) applySearch(s);
    });
    $('btnReset').addEventListener('click', () => {
      $('searchForm').reset();
      document.querySelectorAll('[data-days]').forEach(x => x.classList.remove('btn-adjust'));
      closeMulti();
      syncAllMulti();
      updateDetailCount();
      applySearch(readSearch());
    });
    $('pageSize').addEventListener('change', e => { state.size = Number(e.target.value); state.page = 1; render(); });
    document.querySelector('.order-table thead').addEventListener('click', e => {
      const th = e.target.closest('th.sortable');
      if (!th) return;
      const key = th.dataset.key;
      if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      else { state.sortKey = key; state.sortDir = ['orderedAt', 'qty', 'listPrice', 'discount', 'amount'].includes(key) ? 'desc' : 'asc'; }
      sortData(); render();
    });
    $('pagination').addEventListener('click', e => {
      const b = e.target.closest('button[data-page]');
      if (b && !b.disabled) { state.page = Number(b.dataset.page); render(); }
    });

    // ===== 입금처리 / 입금관리 (미입금·후결제 주문 리스트 > 관리) =====
    // 미입금: 입금처리 모달에서 결제수단·입금액·입금일시 입력 → 결제완료·주문 접수 → 이 목록에서 빠지고 통합 주문 리스트에는 결제완료로 반영
    // 후결제: 입금관리 모달에서 사업자 정보·입금 내역을 보고 입금을 등록 (분할 가능) → 결제완료/부분결제. 이 목록에 남고 통합 주문 리스트에도 반영
    if (unpaid) $('listBody').addEventListener('click', e => {
      const b = e.target.closest('[data-deposit]');
      if (!b) return;
      const o = OrderData.find(b.dataset.deposit);
      if (o) DepositModal.open(o, refilter);
    });

    // ===== 엑셀(CSV) 다운로드: 현재 검색 결과 전체, 목록 정렬 순서대로 =====
    // 목록 열 + 목록에 없는 주문 정보(수취인·연락처·회원구분·배송방법 등). 이메일은 전체 주소
    // 금액·수량은 단위 없이 숫자만 → 엑셀 합계·정렬 가능
    // TODO: 실서비스에서는 서버에서 파일 생성 (GET /api/admin/orders/export?{조건})
    // 단위 선택: 주문번호 단위(주문 1건 = 1행) / 상품 제작번호 단위(주문 상품 1개 = 1행, 주문 정보는 상품마다 반복)
    const catName = code => { const c = CAT_TREE.find(x => x.code === code); return c ? c.label : ''; };
    const payStatusText = o => (o.payStatus === '부분취소' ? `부분취소(${o.canceledItems})` : o.payStatus);
    const FILE_PREFIX = postpay ? '후결제' : unpaid ? '미입금' : '';
    // 주문 공통 열 (두 단위 모두 앞쪽에 들어감)
    const ORDER_HEAD_COLS = [
      ['주문일시', o => o.orderedAt], ['주문번호', o => o.orderNo], ['결제환경', o => o.env]
    ];
    const BUYER_COLS = [
      ['주문자명', o => o.name], ['아이디', o => o.userId], ['이메일', o => o.email], ['휴대폰', o => '\t' + o.phone],   // 앞자리 0 유지
      ['회원구분', o => catName(o.categoryCode)], ['수취인명', o => o.recipient]
    ];
    const EXPORT_UNITS = {
      order: {
        label: '주문번호 단위', file: `${FILE_PREFIX}주문목록`, unit: '주문',
        cols: [...ORDER_HEAD_COLS, ...BUYER_COLS,
          ['주문상품', o => o.title], ['주문건수(건)', o => o.kinds], ['주문부수(부)', o => o.qty],
          ['주문금액(원)', o => o.listPrice], ['할인금액(원)', o => o.discount], ['취소금액(원)', o => o.cancelAmount], ['결제금액(원)', o => o.amount],
          ['결제수단', o => o.payMethod], ['결제상태', payStatusText], ['결제일', o => o.paidAt],
          ['제작상태', o => o.statusCounts.map(([st, n]) => `${st}(${n})`).join(' ')], ['배송방법', o => o.shipMethod], ['배송시작일', o => o.shippedAt],
          ['상담여부', inquiryText]
        ].map(([h, f]) => [h, (o) => f(o)]),
        rows: list => list.map(o => [o])
      },
      item: {
        label: '상품 제작번호 단위', file: `${FILE_PREFIX}주문상품목록`, unit: '상품',
        cols: [...ORDER_HEAD_COLS.map(([h, f]) => [h, (o) => f(o)]),
          ['상품 제작번호', (o, it) => it.spec.makeNo],
          ...BUYER_COLS.map(([h, f]) => [h, (o) => f(o)]),
          ['상품구분', (o, it) => it.category], ['상품명', (o, it) => it.name], ['수량(부)', (o, it) => it.qty],
          ['상품단가(원)', (o, it) => it.price.unitPrice], ['추가금액(원)', (o, it) => it.price.extra],
          ['주문금액(원)', (o, it) => it.listPrice], ['할인금액(원)', (o, it) => it.discount], ['취소금액(원)', (o, it) => it.cancel], ['결제금액(원)', (o, it) => it.paid],
          ['결제수단', (o) => o.payMethod], ['결제상태', (o, it) => it.payStatus], ['주문 결제상태', payStatusText],
          ['진행상태', (o, it) => it.status], ['현재 공정', (o, it) => (it.flow.canceled ? `${OrderData.PROCESS_STEPS[it.flow.step]}(취소)` : OrderData.PROCESS_STEPS[it.flow.step])],
          ['제작처', (o, it) => it.maker],
          ['상품형태', (o, it) => it.spec.form], ['사이즈', (o, it) => it.spec.size], ['커버종류', (o, it) => it.spec.cover], ['코팅종류', (o, it) => it.spec.coating],
          ['페이지', (o, it) => (it.spec.basePages ? `${it.spec.basePages}p${it.spec.addPages ? `(+${it.spec.addPages}p)` : ''}` : '')], ['후가공', (o, it) => it.spec.finishing],
          ['표지 디자인', (o, it) => it.spec.coverDesign], ['내지 디자인', (o, it) => it.spec.innerDesign],
          ['최초 편집 시작일', (o, it) => it.spec.editStartedAt], ['편집 완료일', (o, it) => it.spec.editDoneAt],
          ['배송방법', (o) => o.shipMethod], ['배송시작일', (o) => o.shippedAt], ['상담여부', inquiryText]
        ],
        rows: list => list.flatMap(o => o.items.map(it => [o, it]))
      }
    };

    function downloadExcel(unitKey) {
      if (!state.filtered.length) { toast('다운로드할 데이터가 없습니다.'); return; }
      const u = EXPORT_UNITS[unitKey];
      const cell = v => {
        let s = String(v ?? '');
        if (/^[=+\-@]/.test(s)) s = "'" + s;            // CSV 수식 주입 방지
        return '"' + s.replace(/"/g, '""') + '"';
      };
      const rows = u.rows(state.filtered);
      const lines = [u.cols.map(c => cell(c[0])).join(','), ...rows.map(args => u.cols.map(c => cell(c[1](...args))).join(','))];
      const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${u.file}_${fmtDate(new Date()).replace(/-/g, '')}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      toast(`${u.label}로 ${rows.length.toLocaleString()}건(${u.unit})을 다운로드했습니다.`);
    }

    // 엑셀 다운로드 버튼 → 단위 선택 메뉴
    const closeDlMenu = () => { $('dlMenu').hidden = true; $('btnExcel').setAttribute('aria-expanded', 'false'); };
    $('btnExcel').addEventListener('click', e => {
      e.stopPropagation();
      const open = $('dlMenu').hidden;
      $('dlMenu').hidden = !open;
      $('btnExcel').setAttribute('aria-expanded', String(open));
    });
    $('dlMenu').addEventListener('click', e => {
      const b = e.target.closest('[data-unit]');
      if (!b) return;
      closeDlMenu();
      downloadExcel(b.dataset.unit);
    });
    document.addEventListener('click', e => { if (!e.target.closest('.dl-wrap')) closeDlMenu(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDlMenu(); });

    initSidebar();
    applySearch(readSearch());
  }

  window.OrderList = { init };
})();

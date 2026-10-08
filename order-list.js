// 주문 목록 화면 공용 스크립트 (통합 주문 관리 orders.html / 결제 완료 주문 paid-orders.html / 미입금 주문 unpaid-orders.html / 후결제 주문 postpay-orders.html)
// member-type-store.js, member-data.js, order-data.js, deposit-modal.js 다음에 로드하고 OrderList.init({ mode }) 호출
//   mode 'accepted': 주문 전부 (미입금 주문은 결제상태 입금대기로 표시. 후결제 주문은 접수 즉시 여기에도 나옴)
//   mode 'canceled': 취소된 상품이 있는 주문 (취소 주문 canceled-orders.html, 부분취소·전체취소). 상품별 보기는 취소된 상품만
//   mode 'paid':     결제가 이루어진 주문 (결제상태 입금대기·후결제대기·전체취소 제외, 상품별 보기는 취소 상품 제외). 구성은 통합 주문 관리와 같음
//                    → 미입금·후결제 주문에 입금을 등록하면 이 목록에 들어옴
//   mode 'outsource': 제작처가 KSI가 아닌 상품 (외주 제작 outsource-orders.html). 상품 1개 = 1행
//   mode 'ordered':  제작상태가 주문완료(공정 주문접수)인 상품 전부 (주문 완료 ordered-orders.html). 접수 후 제작이 시작되지 않은 상품 확인용
//   mode 'making':   제작상태가 제작중인 상품 전부 (제작 중 making-orders.html). 열은 외주제작과 같고 관리 열·탭 없음
//   mode 'shipping': 제작상태가 배송중인 상품 전부 (배송 중 shipping-orders.html). 구성은 제작 중과 같음
//   mode 'delivered': 제작상태가 배송완료인 상품 전부 (배송 완료 delivered-orders.html). 기본 검색 줄은 배송방법, 공정상태는 상세검색 맨 뒤
//                    → 주문수량·금액·결제상태는 상품 기준, 제작처 열 + 관리 열(제작관리 → 주문 상세에서 그 상품의 제작 공정)
//   mode 'unpaid':   무통장입금 미입금 주문 (결제상태 입금대기). 맨 오른쪽 관리 열에 입금처리 버튼 → 처리하면 이 목록에서 빠지고 통합 주문 관리에는 결제완료로 반영
//   mode 'postpay':  후결제 주문 전부 (선결제 없이 주문, 상품 수령 후 결제). 구성은 미입금과 같고 후결제대기 건에만 입금처리 버튼
//                    → 처리하면 결제상태(결제완료)·결제수단(입금받은 수단)이 바뀌어 이 목록과 통합 주문 관리에 같이 반영 (목록에서 빠지지 않음)
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
    const paid = mode === 'paid';
    const canceled = mode === 'canceled';   // 취소 주문: 취소된 상품이 있는 주문 (부분취소·전체취소). 상품별 보기는 취소된 상품만
    const isCanceledOrder = o => o.items.some(it => it.payStatus === '취소');
    const outsource = mode === 'outsource';   // 외주제작: 주문이 아니라 상품 1개 = 1행
    // 제작상태별 상품 목록: 주문완료 / 제작중 / 배송중 / 배송 완료 (같은 구성, 보여주는 제작상태만 다름)
    //   주문완료 = 공정 주문접수 (접수는 끝났지만 아직 제작이 시작되지 않은 상품)
    const STATUS_LIST = { ordered: '주문완료', making: '제작중', shipping: '배송중', delivered: '배송완료' }[mode] || '';
    const making = !!STATUS_LIST;             // 제작중·배송중: 그 제작상태인 상품 전부 (자체·외주), 상품 1개 = 1행, 관리 열·탭 없음
    const itemMode = outsource || making;     // 상품 행 목록 (열 구성 공통)
    const unpaid = mode === 'unpaid' || mode === 'postpay';   // 미입금·후결제: 입금처리 대상 목록 (관리 열 표시)
    const postpay = mode === 'postpay';
    // 주문관리 리스트(통합·결제완료·미입금·후결제): 주문별 / 상품별 보기 탭. 상품별은 주문 상품 1개 = 1행 (상품제작번호·제작상태 열 추가)
    const orderList = !itemMode;
    // 결제 완료 주문에서 빼는 결제상태: 결제 전(입금대기·후결제대기) + 결제 후 전체취소
    const UNPAID_STATUSES = ['입금대기', '후결제대기', '전체취소'];
    // ===== 주문 데이터: order-data.js (주문 상세와 공유) =====
    const { ORDERS } = OrderData;
    // 출고일: 상품 공정의 출고완료 단계 처리 시각('MM-DD HH:MM')에 주문 연도를 붙인 날짜 (주문일보다 앞이면 다음 해)
    const outDateOf = (o, it) => {
      const f = it.flow, k = f.steps.indexOf('출고완료');
      if (k < 0 || f.step < k || f.canceled || !f.times[k]) return '';
      const md = f.times[k].slice(0, 5), year = Number(o.orderDate.slice(0, 4));
      return `${md < o.orderDate.slice(5, 10) ? year + 1 : year}-${md}`;
    };
    // 외주제작 상품 행: 주문 정보에 상품 값(상품명·수량·금액·결제상태·제작처)을 덮어쓴 행. order = 원래 주문, item = 상품, itemIdx = 주문 안 상품 순번
    // (검색·정렬·목록이 주문 행과 같은 필드명을 쓰도록 맞춤)
    const itemRow = (o, it, i) => Object.assign({}, o, {
      order: o, item: it, itemIdx: i, rowKey: `${o.orderNo}#${i}`,
      title: it.name, productNames: it.name, kinds: 1, qty: it.qty,
      listPrice: it.listPrice, discount: it.discount, amount: it.paid,
      payStatus: it.payStatus, statusCounts: it.status ? [[it.status, 1]] : [], maker: it.maker,
      stepName: it.flow.steps[it.flow.step],   // 공정상태 (현재 공정 단계)
      outDate: outDateOf(o, it)                 // 출고일 (공정 출고완료 시각의 날짜, 출고 전이면 '')
    });
    // 외주제작: 입금대기(무통장입금 미입금)·취소 상품은 제작 대상이 아니므로 제외
    const OUT_EXCLUDED = ['입금대기', '취소'];
    const source = () => (outsource ? ORDERS.flatMap(o => o.items.map((it, i) => (OrderData.isKsiMaker(it.maker) || OUT_EXCLUDED.includes(it.payStatus) ? null : itemRow(o, it, i))).filter(Boolean))
      : making ? ORDERS.flatMap(o => o.items.map((it, i) => (it.status === STATUS_LIST && it.payStatus !== '취소' ? itemRow(o, it, i) : null)).filter(Boolean))
      : orderList && state.view === 'item' ? orderSource().flatMap(o => o.items.map((it, i) => ((canceled && it.payStatus !== '취소') || (paid && it.payStatus === '취소') ? null :   /* 취소 주문: 취소 상품만 / 결제 완료 주문: 취소 상품 제외 */ Object.assign(itemRow(o, it, i), { orderPayStatus: o.payStatus })))).filter(Boolean)
      : orderSource());
    // 주문관리 리스트의 주문 목록 (주문별 보기 = 이 목록, 상품별 보기 = 이 주문들의 상품)
    const orderSource = () => (postpay ? ORDERS.filter(OrderData.isPostpayOrder) : unpaid ? ORDERS.filter(OrderData.isUnpaid)
      : paid ? ORDERS.filter(o => !UNPAID_STATUSES.includes(o.payStatus)) : canceled ? ORDERS.filter(isCanceledOrder) : ORDERS);
    // 상품 행으로 보여주는지 (제작관리 리스트는 항상, 주문관리 리스트는 상품별 탭일 때)
    const byItem = () => itemMode || state.view === 'item';
    // 결제상태 검색·결제상태 탭은 주문관리 리스트의 상품별 보기에서도 주문의 결제상태 기준 (부분취소·전체취소 등 주문 단위 값)
    const payStatusOf = o => o.orderPayStatus || o.payStatus;
    // 외주 제작처 목록 (상세검색 선택지)
    const OUT_MAKERS = itemMode ? [...new Set(source().map(r => r.maker))].sort((a, b) => a.localeCompare(b, 'ko')) : [];
    // 공정상태 선택지 (제작중·외주제작): 목록에 있는 공정 단계를 공정 순서대로 (외주제작은 외주 공정 순서, 제작중은 자체 공정 → 외주 공정 중 자체에 없는 단계)
    const STEP_OPTIONS = itemMode ? (() => {
      const present = new Set(source().map(r => r.stepName));
      return [...new Set(outsource ? OrderData.OUTSOURCE_STEPS : [...OrderData.PROCESS_STEPS, ...OrderData.OUTSOURCE_STEPS])].filter(s => present.has(s));
    })() : [];

    // ===== 상세검색 항목 (다중 선택) =====
    // 회원구분 선택지는 회원 유형 관리 > 회원구분 탭의 항목 (전체 회원 관리와 같은 방식, 숨긴 구분도 검색 가능)
    // 결제수단 선택지는 order-data.js의 PAY_METHODS (별도결제 포함). 미입금 화면은 결제수단·결제상태가 정해져 있어 두 항목을 뺌
    // TODO: 결제수단·입금상태·진행상태·배송방법 선택지는 실서비스에서 주문 설정값으로 대체
    const CAT_TREE = MemberTypeStore.categoryTree();
    const DETAIL_FIELDS = [
      ...(unpaid && !postpay ? [] : [
        ...(postpay || itemMode ? [] : [{ key: 'payMethod', label: '결제수단', options: OrderData.PAY_METHODS.map(v => [v, v]) }]),
        // 입금대기: 무통장입금 미입금 (통합 주문 관리에만) / 후결제대기·부분결제: 후결제 주문 중 입금 전·일부 입금 (통합 주문 관리에도 나오므로 두 화면 모두 선택지에 둠)
        // 결제 완료 주문: 결제 전 상태(입금대기·후결제대기)는 목록에 없으므로 선택지에서 뺌
        // 외주제작(상품 행): 상품별 결제상태 (부분취소·전체취소 대신 상품 단위 '취소')
        { key: 'payStatus', label: '결제상태', options: (itemMode ? ['후결제대기', '부분결제', '결제완료']
          : ['입금대기', '후결제대기', '부분결제', '결제완료', '부분취소', '전체취소'])
          .filter(v => !(postpay && v === '입금대기') && !(paid && UNPAID_STATUSES.includes(v)) && !(canceled && !['부분취소', '전체취소'].includes(v))).map(v => [v, v]) }
      ]),
      // main: 상세검색이 아니라 기본 검색 줄(기간 오른쪽)에 둠 → 외주 제작은 제작처, 제작 중은 공정상태
      ...(outsource ? [{ key: 'maker', label: '제작처', options: OUT_MAKERS.map(v => [v, v]), main: true }] : []),
      // 공정상태: 제작중은 기본 검색 줄, 외주제작은 상세검색
      ...(itemMode ? [{ key: 'step', label: '공정상태', options: STEP_OPTIONS.map(v => [v, v]), main: making && mode !== 'delivered' }] : []),
      // 제작상태: 상품별 진행상태. 고른 상태의 상품이 하나라도 있는 주문을 찾음 (미입금은 입금 전이라 주문대기뿐, 후결제는 제작·배송이 진행됨)
      { key: 'status', label: '제작상태', options: (unpaid && !postpay ? ['주문대기'] : OrderData.ITEM_STATUS_ORDER).map(v => [v, v]) },
      // 제작 중: 제작처는 상세검색 (결제상태 · 제작상태 · 제작처 · 회원구분 · 상담여부 · 배송방법 순)
      ...(making ? [{ key: 'maker', label: '제작처', options: OUT_MAKERS.map(v => [v, v]) }] : []),
      { key: 'category', label: '회원구분', options: CAT_TREE.map(c => [c.code, c.label + (c.hidden ? ' (숨김)' : '')]) },
      // 상담여부: 관리자 메모 구분 (주문 상세 > 관리정보에서 등록). 고른 구분의 메모가 있는 주문을 찾음
      { key: 'inquiry', label: '상담여부', options: OrderData.MEMO_CATEGORIES.map(c => [c, c]) },
      // 배송 완료: 배송방법을 기본 검색 줄에 (공정상태와 자리를 바꿈)
      { key: 'shipMethod', label: '배송방법', options: ['택배', '방문수령', '퀵서비스'].map(v => [v, v]), main: mode === 'delivered' }
    ];
    // 제작 중의 상세검색 순서: 제작처 · 제작상태 · 결제상태 · 회원구분 · 상담여부 · 배송방법 (기본 검색 줄의 공정상태는 맨 앞 유지)
    // 외주 제작의 상세검색 순서: 제작상태 · 공정상태 · 결제상태 · 회원구분 · 상담여부 · 배송방법 (제작처는 기본 검색 줄)
    if (itemMode) {
      const ORDER = mode === 'delivered' ? ['shipMethod', 'maker', 'status', 'payStatus', 'category', 'inquiry', 'step']
        : making ? ['step', 'maker', 'status', 'payStatus', 'category', 'inquiry', 'shipMethod'] : ['maker', 'status', 'step', 'payStatus', 'category', 'inquiry', 'shipMethod'];
      DETAIL_FIELDS.sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
    }
    // 드롭다운(버튼 + 체크 목록). 버튼에는 '전체' / '신용카드' / '신용카드 외 2'처럼 요약 표시
    const fieldHtml = f => `
      <div class="field${f.main ? ` f-${f.key}` : ''}">
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
      </div>`;
    $('detailSearch').innerHTML = DETAIL_FIELDS.filter(f => !f.main).map(fieldHtml).join('');
    document.querySelector('#searchForm .order-search').insertAdjacentHTML('beforeend', DETAIL_FIELDS.filter(f => f.main).map(fieldHtml).join(''));
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
    // 드롭다운은 상세검색·기본 검색 줄 모두에 있으므로 검색 폼 전체에서 처리
    $('searchForm').addEventListener('click', e => {
      const btn = e.target.closest('.ms-btn');
      if (!btn) return;
      const ms = btn.closest('.multi-select');
      const panel = ms.querySelector('.ms-panel');
      closeMulti(ms);
      panel.hidden = !panel.hidden;
      btn.setAttribute('aria-expanded', String(!panel.hidden));
      if (!panel.hidden) panel.querySelector('input').focus();
    });
    $('searchForm').addEventListener('change', e => {
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
      else {   // 오늘 기준 (기간 기본값과 같은 기준일)
        const today = AdminUtil.listToday();
        const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - Number(d));
        $('sFrom').value = fmtDate(from);
        $('sTo').value = fmtDate(today);
      }
      document.querySelectorAll('[data-days]').forEach(x => x.classList.toggle('btn-adjust', x === b));
    });
    // 날짜를 직접 고치면 빠른 선택 표시 해제
    ['sFrom', 'sTo'].forEach(id => $(id).addEventListener('input', () => document.querySelectorAll('[data-days]').forEach(x => x.classList.remove('btn-adjust'))));

    // ===== 상세검색 아코디언 =====
    // 접혀 있어도 적용 중인 상세조건 개수를 표시해 숨은 필터를 놓치지 않게 한다
    function updateDetailCount() {
      const n = DETAIL_FIELDS.filter(f => !f.main && checkedValues(f.key).length).length;   // 값을 하나라도 고른 상세검색 항목 수
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
    const DATE_KEY = { orderedAt: 'orderDate', paidAt: 'paidAt', shippedAt: 'shippedAt', outAt: 'outDate' };   // outAt: 출고일 (배송중·외주 제작, 상품 기준)
    const state = { filtered: [], page: 1, size: 10, sortKey: 'orderedAt', sortDir: 'desc', search: null, tab: 'all', view: 'order' };
    const inSet = (list, v) => !list || !list.length || list.includes(v);
    // 상담여부: 고른 구분의 관리자 메모가 하나라도 있으면 해당
    const matchInquiry = (list, o) => !list.length || OrderData.memoCategories(o.orderNo).some(c => list.includes(c));
    const inquiryText = o => OrderData.memoCategories(o.orderNo).join(', ');   // 엑셀 상담여부 열: 메모 구분 나열

    // ===== 결제상태 탭 (후결제 주문: 전체 / 후결제대기 / 부분결제 / 결제완료) =====
    // 검색 조건과 함께 적용. 탭 건수는 검색 결과 기준. 입금을 등록하면 입금 합계에 따라 후결제대기 → 부분결제 → 결제완료 탭으로 옮겨감
    // (부분취소·전체취소 건은 전체 탭에서만 보임)
    // 외주 제작: 전체 / 의뢰대기(결제완료·주문완료, 공정 주문접수) / 의뢰완료(의뢰완료 이후 공정 전부: 의뢰완료~배송완료, 취소 제외)
    const TABS = !$('statusTabs') ? null : outsource ? [
      { key: 'all', label: '전체', test: () => true },
      { key: 'waiting', label: '의뢰대기', test: r => OrderData.isRequestWaiting(r.item) },
      { key: 'requested', label: '의뢰완료', test: r => OrderData.isRequested(r.item) }
    ] : [
      { key: 'all', label: '전체', test: () => true },
      ...['후결제대기', '부분결제', '결제완료'].map(st => ({ key: st, label: st, test: o => payStatusOf(o) === st }))
    ];
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
      checkedRows.clear();   // 탭을 바꾸면 선택 해제
      refilter();
    });

    // ===== 주문별 / 상품별 보기 탭 (주문관리 리스트) =====
    // 탭 옆 건수는 검색 전 전체 기준 (주문 수 / 그 주문들의 상품 수). 보기를 바꿔도 검색 조건·결제상태 탭은 유지
    function renderViewTabs() {
      const orders = orderSource(), items = orders.reduce((n, o) => n + o.items.filter(it => (canceled ? it.payStatus === '취소' : !(paid && it.payStatus === '취소'))).length, 0);
      $('viewTabs').innerHTML = [['order', '주문별', orders.length], ['item', '상품별', items]].map(([k, label, n]) => `
        <button type="button" role="tab" class="tab ${state.view === k ? 'active' : ''}" aria-selected="${state.view === k}" data-view="${k}">
          ${label} <span class="tab-count">${n.toLocaleString()}</span></button>`).join('');
      $('viewUnit').textContent = state.view === 'item' ? '(상품 기준)' : '';
    }
    if (orderList) $('viewTabs').addEventListener('click', e => {
      const b = e.target.closest('[data-view]');
      if (!b || b.dataset.view === state.view) return;
      state.view = b.dataset.view;
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
        inSet(s.payMethod, o.payMethod) && inSet(s.payStatus, payStatusOf(o)) && (!s.status.length || o.statusCounts.some(([st]) => s.status.includes(st))) &&
        inSet(s.category, o.categoryCode) && matchInquiry(s.inquiry, o) && inSet(s.shipMethod, o.shipMethod) && inSet(s.maker, o.maker) && inSet(s.step, o.stepName)
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
    // 외주제작: 금액 3열(주문·할인·결제금액)·결제수단 열 없음, 제작상태·공정상태(현재 공정 단계) 열 추가 → 12열
    // 상품 행 목록은 주문번호 다음에 상품제작번호 열 추가 (누르면 아래에 상품정보·제작 공정 아코디언)
    const baseCols = outsource ? 13 : making ? 12 : unpaid ? 13 : 12;
    // 외주제작 > 의뢰대기 탭: 맨 앞 체크박스 열 + 우측 상단 의뢰서 다운로드 (선택한 상품 의뢰서 일괄 다운로드)
    const selectMode = () => outsource && state.tab === 'waiting';
    const checkedRows = new Set();   // 체크한 상품 행 (rowKey). 페이지를 넘겨도 유지, 탭을 바꾸면 해제
    const openRows = new Set();   // 펼친 상품 행 (rowKey). 검색·페이지 이동 뒤 다시 그려도 유지

    function render() {
      const sel = selectMode(), iv = byItem(), COLS = baseCols + (sel ? 1 : 0) + (orderList && iv ? 2 : 0);   // 주문관리 상품별: 상품제작번호·제작상태 열
      if (orderList) { document.querySelectorAll('.order-table th.v-item').forEach(th => { th.hidden = !iv; }); renderViewTabs(); }
      const total = state.filtered.length;
      const pages = Math.max(1, Math.ceil(total / state.size));
      if (state.page > pages) state.page = pages;
      const start = (state.page - 1) * state.size;
      $('totalCount').textContent = total.toLocaleString();
      $('allCount').textContent = source().length.toLocaleString();
      $('listBody').innerHTML = state.filtered.slice(start, start + state.size).map(o => `<tr${iv ? ` class="${openRows.has(o.rowKey) ? 'open' : ''}" data-row="${esc(o.rowKey)}"` : ''}>${sel ? `
          <td class="c-chk"><input type="checkbox" class="row-chk" value="${esc(o.rowKey)}" aria-label="${esc(o.item.spec.makeNo)} 선택"${checkedRows.has(o.rowKey) ? ' checked' : ''}></td>` : ''}
          <td><span class="env-tag env-${o.env}" title="${o.env === 'MO' ? '모바일' : 'PC'}에서 결제">${o.env}</span></td>
          <td title="${o.orderedAt}">${o.orderedAt.slice(0, 16)}</td>
          <td>${esc(o.name)}</td>
          <td class="left ellip" title="${esc(o.email)}">${esc(o.email.split('@')[0])}</td>
          <td class="mono"><a class="name-link" href="order-detail.html?orderNo=${encodeURIComponent(o.orderNo)}">${esc(o.orderNo)}</a></td>
          ${iv ? `<td class="mono"><button type="button" class="link-btn mono make-toggle" data-toggle="${esc(o.rowKey)}" aria-expanded="${openRows.has(o.rowKey)}" title="상품정보·제작 공정 보기">${esc(o.item.spec.makeNo)} <span class="make-chev">▾</span></button></td>` : ''}
          <td class="left ellip" title="${esc(o.productNames)}">${esc(o.title)}</td>
          <td class="num">${iv ? `${o.qty}부` : `${o.kinds}건/${o.qty}부`}</td>
          ${itemMode ? '' : `<td class="num">${won(o.listPrice)}</td>
          <td class="num">${o.discount ? `-${won(o.discount)}` : '<span class="muted">0원</span>'}</td>
          <td class="num"><b>${won(o.amount)}</b></td>
          <td class="c-pay">${esc(o.payMethod)}</td>`}
          <td>${payCell(o)}</td>
          ${itemMode ? `<td>${o.item.status ? `<span class="badge ${MemberData.statusClass(o.item.status)}">${esc(o.item.status)}</span>` : '<span class="muted">-</span>'}</td>
          <td>${esc(o.item.flow.steps[o.item.flow.step])}${o.item.flow.canceled ? ' <span class="muted">(취소)</span>' : ''}</td>
          <td>${esc(o.maker)}</td>
          ${making ? '' : `<td class="c-act"><button type="button" class="btn btn-xs ${OrderData.isRequestWaiting(o.item) ? 'btn-primary' : ''}" data-make="${esc(o.rowKey)}">제작관리</button></td>`}`
            : `${iv ? `<td>${o.item.status ? `<span class="badge ${MemberData.statusClass(o.item.status)}">${esc(o.item.status)}</span>` : '<span class="muted">-</span>'}</td>` : ''}${postpay ? `<td class="c-act"><button type="button" class="btn btn-xs ${OrderData.isWaiting(o.order || o) ? 'btn-primary' : ''}" data-deposit="${esc(o.orderNo)}">입금관리</button></td>`
            : unpaid ? `<td class="c-act">${OrderData.isWaiting(o.order || o) ? `<button type="button" class="btn btn-xs btn-primary" data-deposit="${esc(o.orderNo)}">입금처리</button>` : '<span class="muted">입금완료</span>'}</td>` : ''}`}
        </tr>${iv ? `<tr class="item-detail" data-detail="${esc(o.rowKey)}"${openRows.has(o.rowKey) ? '' : ' hidden'}><td colspan="${COLS}">${openRows.has(o.rowKey) ? ItemDetail.html(o.item, o.itemIdx) : ''}</td></tr>` : ''}`).join('') || `<tr><td colspan="${COLS}" class="empty">${(unpaid || itemMode) && !source().length ? `${postpay ? '후결제' : outsource ? '외주제작' : making ? STATUS_LIST : '미입금'} 주문이 없습니다.` : '검색 결과가 없습니다.'}</td></tr>`;

      document.querySelectorAll('.order-table th.sortable').forEach(th => {
        const active = th.dataset.key === state.sortKey;
        const label = th.textContent.replace(/[▲▼↕]/g, '').trim();
        th.innerHTML = `${label}<span class="arrow">${active ? (state.sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>`;
      });
      if (outsource) syncSelectUi();   // 행을 그린 뒤 헤더 체크박스 상태 갱신
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
      AdminUtil.setDefaultRange();   // 초기화하면 기간은 기본값(최근 1개월)으로
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

    // ===== 입금처리 / 입금관리 (미입금·후결제 주문 > 관리) =====
    // 미입금: 입금처리 모달에서 결제수단·입금액·입금일시 입력 → 결제완료·주문 접수 → 이 목록에서 빠지고 통합 주문 관리에는 결제완료로 반영
    // 후결제: 입금관리 모달에서 사업자 정보·입금 내역을 보고 입금을 등록 (분할 가능) → 결제완료/부분결제. 이 목록에 남고 통합 주문 관리에도 반영
    // ===== 상품제작번호 아코디언 (제작중·외주 제작) =====
    // 상품제작번호를 누르면 바로 아래 행에 상품정보·제작 공정이 펼쳐짐 (주문 상세 > 주문정보와 같은 화면, 여러 개 동시에 펼칠 수 있음)
    // 펼칠 때 그 상품의 최신 상태로 그림 (의뢰완료 처리 뒤 다시 펼치면 반영)
    $('listBody').addEventListener('click', e => {
      if (ItemDetail.openViewer(e)) return;
      const b = e.target.closest('[data-toggle]');
      if (!b) return;
      const key = b.dataset.toggle, row = source().find(r => r.rowKey === key);
      const detail = [...$('listBody').querySelectorAll('tr.item-detail')].find(tr => tr.dataset.detail === key);
      if (!row || !detail) return;
      const open = detail.hidden;
      if (open) { detail.firstElementChild.innerHTML = ItemDetail.html(row.item, row.itemIdx); openRows.add(key); } else openRows.delete(key);
      detail.hidden = !open;
      b.setAttribute('aria-expanded', String(open));
      b.closest('tr').classList.toggle('open', open);
    });
    // ===== 의뢰서 일괄 다운로드 (외주제작 > 의뢰대기 탭) =====
    // 같은 제작처 상품끼리만 선택 가능 (의뢰서는 제작처별로 보냄). 처음 체크한 상품의 제작처가 기준, 다른 제작처는 체크 불가
    // 헤더 체크박스: 현재 페이지에서 기준 제작처(선택이 없으면 첫 행의 제작처) 상품만 전체 선택/해제. 선택 건수·제작처는 버튼 옆에 표시
    const makerOfKey = key => { const r = source().find(x => x.rowKey === key); return r ? r.maker : ''; };
    const selectedMaker = () => (checkedRows.size ? makerOfKey([...checkedRows][0]) : '');
    function syncSelectUi() {
      const sel = selectMode(), maker = selectedMaker();
      $('thChk').hidden = !sel;
      $('btnSheets').hidden = !sel;
      $('selInfo').hidden = !sel;
      $('selInfo').textContent = checkedRows.size ? `${maker} · 선택 ${checkedRows.size}건` : '같은 제작처 상품만 함께 선택할 수 있습니다';
      const boxes = [...$('listBody').querySelectorAll('.row-chk')];
      const base = maker || (boxes[0] ? makerOfKey(boxes[0].value) : '');
      const same = boxes.filter(c => makerOfKey(c.value) === base);
      $('chkAllRows').checked = sel && same.length > 0 && same.every(c => checkedRows.has(c.value));
    }
    if (outsource) {
      $('listBody').addEventListener('change', e => {
        const c = e.target.closest('.row-chk');
        if (!c) return;
        const maker = selectedMaker();
        if (c.checked && maker && makerOfKey(c.value) !== maker) {
          c.checked = false;
          toast(`같은 제작처(${maker}) 상품만 함께 선택할 수 있습니다. 다른 제작처는 선택을 해제한 뒤 따로 다운로드하세요.`);
          return;
        }
        if (c.checked) checkedRows.add(c.value); else checkedRows.delete(c.value);
        syncSelectUi();
      });
      $('chkAllRows').addEventListener('change', e => {
        const boxes = [...$('listBody').querySelectorAll('.row-chk')];
        const base = selectedMaker() || (boxes[0] ? makerOfKey(boxes[0].value) : '');
        let skipped = 0;
        boxes.forEach(c => {
          if (makerOfKey(c.value) !== base) { if (e.target.checked) skipped++; return; }
          c.checked = e.target.checked;
          if (c.checked) checkedRows.add(c.value); else checkedRows.delete(c.value);
        });
        if (skipped) toast(`${base} 상품만 선택했습니다. 다른 제작처 ${skipped}건은 제외했습니다.`);
        syncSelectUi();
      });
      $('btnSheets').addEventListener('click', () => {
        const rows = source().filter(r => checkedRows.has(r.rowKey));
        if (!rows.length) { toast('의뢰서를 다운로드할 상품을 선택하세요.'); return; }
        if (new Set(rows.map(r => r.maker)).size > 1) { toast('의뢰서는 같은 제작처 상품끼리만 다운로드할 수 있습니다.'); return; }
        MakeModal.downloadSheets(rows.map(r => ({ o: r.order, idx: r.itemIdx })));
        toast(`${rows[0].maker} 의뢰서 ${rows.length}건을 다운로드했습니다.`);
      });
    }
    // ===== 제작관리 (외주 제작 > 관리) =====
    // 제작관리 모달(make-modal.js): 상품·제작처·현재 공정·의뢰서 다운로드·히스토리, 의뢰대기 상품은 의뢰완료 처리
    // 처리하면 의뢰대기 탭에서 의뢰완료 탭으로 옮겨감. 모달에서 주문 상세(그 상품의 제작 공정)로 이동 가능
    if (outsource) $('listBody').addEventListener('click', e => {
      const b = e.target.closest('[data-make]');
      if (!b) return;
      const row = source().find(r => r.rowKey === b.dataset.make);
      if (!row) return;
      MakeModal.open(row.order, row.itemIdx, ok => {
        refilter();
        toast(ok ? '의뢰완료 처리했습니다. 의뢰완료 탭으로 옮겨졌습니다.' : '저장소를 사용할 수 없어 이 화면에만 반영되었습니다.');
      }, { detailLink: true });
    });
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
    const FILE_PREFIX = postpay ? '후결제' : unpaid ? '미입금' : paid ? '결제완료' : canceled ? '취소' : outsource ? '외주제작' : making ? STATUS_LIST : '';
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
        // 상품별 보기에서는 목록 상품들의 주문을 한 번씩
        rows: list => (byItem() ? [...new Map(list.map(r => [r.orderNo, r.order || r])).values()] : list).map(o => [o])
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
          ['제작상태', (o, it) => it.status], ['현재 공정', (o, it) => (it.flow.canceled ? `${it.flow.steps[it.flow.step]}(취소)` : it.flow.steps[it.flow.step])],
          ['제작처', (o, it) => it.maker],
          ['상품형태', (o, it) => it.spec.form], ['사이즈', (o, it) => it.spec.size], ['커버종류', (o, it) => it.spec.cover], ['코팅종류', (o, it) => it.spec.coating],
          ['페이지', (o, it) => (it.spec.basePages ? `${it.spec.basePages}p${it.spec.addPages ? `(+${it.spec.addPages}p)` : ''}` : '')], ['후가공', (o, it) => it.spec.finishing],
          ['표지 디자인', (o, it) => it.spec.coverDesign], ['내지 디자인', (o, it) => it.spec.innerDesign],
          ['최초 편집 시작일', (o, it) => it.spec.editStartedAt], ['편집 완료일', (o, it) => it.spec.editDoneAt],
          ['배송방법', (o) => o.shipMethod], ['배송시작일', (o) => o.shippedAt], ['상담여부', inquiryText]
        ],
        // 외주제작: 목록의 상품 행 그대로 (주문 열은 원래 주문 값)
        rows: list => (byItem() ? list.map(r => [r.order, r.item]) : list.flatMap(o => o.items.map(it => [o, it])))
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
    AdminUtil.setDefaultRange();   // 처음 열면 최근 1개월 (관리자가 바꿔 검색 가능)
    applySearch(readSearch());
  }

  window.OrderList = { init };
})();

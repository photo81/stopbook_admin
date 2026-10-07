// 상품 제작 상세 (상품정보 + 제작 공정) 공용 렌더링
// 주문 상세 > 주문정보의 상품 아코디언, 제작중·외주제작 주문 리스트의 상품제작번호 아코디언에서 같은 화면을 씀
// member-type-store.js(AdminUtil), member-data.js(MemberData) 다음에 로드
// 사용: ItemDetail.html(item, i, { productLink })  → 상품정보 상자 + 제작 공정 플로우 HTML
//   productLink: 상품 코드를 버튼(data-product=i)으로 그림 (주문 상세에서 상품 정보 모달을 엶). 없으면 글자만
//   편집내용보기 링크는 data-viewer → 화면에서 팝업으로 열도록 ItemDetail.openViewer 사용
(function () {
  'use strict';
  const { esc } = AdminUtil;
  const dash = v => (v ? esc(v) : '<span class="muted">-</span>');

  // 제작 공정 플로우: 지난 단계 ✓(채움) · 현재 단계(강조) · 남은 단계(빈 원). 단계 아래 처리 시각
  // 취소된 상품은 멈춘 단계 뒤를 흐리게 하고 '취소' 표시
  // 단계 아래에 고객에게 노출되는 제작상태 구간을 표시 (주문대기=접수대기 | 주문완료=주문접수 | 제작중=합성완료~제본완료 | 배송중=출고완료~배송중 | 배송완료)
  // 외주 제작 상품은 공정이 다름 (접수대기·주문접수·의뢰완료·제작중·출고완료·배송중·배송완료, 제작중 구간 = 의뢰완료~제작중) → 상품의 flow.steps·groups 사용
  function flowHtml(f) {
    const steps = f.steps;
    // 고객 노출 제작상태 구간: 지난 구간(done) · 현재 구간(current, 취소면 stopped) · 남은 구간(todo)
    const gCls = g => (f.step > g.to || (f.delivered && f.step === g.to) ? 'done' : f.step >= g.from ? (f.canceled ? 'stopped' : 'current') : 'todo');
    const groupsHtml = `<div class="flow-groups-cap">고객 노출 제작상태</div>
      <div class="flow-groups" style="grid-template-columns:repeat(${steps.length},1fr)">${f.groups.map(g => `
        <div class="flow-group ${gCls(g)}" style="grid-column:${g.from + 1} / span ${g.to - g.from + 1}">${esc(g.label)}</div>`).join('')}
      </div>`;
    // 배송완료: 마지막 단계(배송완료)까지 모두 끝남 → 전 단계 ✓
    const cls = k => (k < f.step || (f.delivered && k === f.step) ? 'done' : k === f.step ? (f.canceled ? 'stopped' : 'current') : 'todo');
    const statusBadge = f.status ? `<span class="badge ${MemberData.statusClass(f.status)}">${esc(f.status)}</span>` : '';
    const head = f.canceled
      ? `<span class="badge ps-취소">취소</span> ${esc(steps[f.step])} 단계에서 취소되었습니다.`
      : f.delivered
        ? `${statusBadge} 제작부터 배송까지 모든 단계가 완료되었습니다.`
        : `${statusBadge} 현재 공정 <b>${esc(steps[f.step])}</b> <span class="muted">(${f.step + 1}/${steps.length}단계)</span>`;
    return `<div class="flow${f.canceled ? ' is-canceled' : ''}">
      <div class="flow-head"><b>제작 공정</b>${f.outsource ? ' <span class="badge">외주 제작</span>' : ''} <span class="flow-now">${head}</span></div>
      <ol class="flow-steps">${steps.map((name, k) => `
        <li class="flow-step ${cls(k)}"${k === f.step ? ' aria-current="step"' : ''}>
          <span class="flow-dot">${k < f.step || (f.delivered && k === f.step) ? '✓' : k + 1}</span>
          <span class="flow-label">${esc(name)}</span>
          <span class="flow-time">${f.times[k] || ''}</span>
        </li>`).join('')}
      </ol>
      ${groupsHtml}
    </div>`;
  }

  // 페이지: 기본 페이지수(추가 페이지수). 예) 24p(+6p), 추가 없으면 24p
  const pagesText = sp => (sp.basePages ? `${sp.basePages}p${sp.addPages ? `(+${sp.addPages}p)` : ''}` : '');

  // 상품정보 상자 + 제작 공정 (펼친 상세 순서: 상품정보 → 제작 공정)
  function html(it, i, opts = {}) {
    const sp = it.spec;
    const specOpts = [['상품형태', sp.form], ['사이즈', sp.size], ['커버종류', sp.cover], ['코팅종류', sp.coating], ['페이지', pagesText(sp)], ['후가공', sp.finishing]];
    // 편집 서비스: 직접편집 / 편집메이트, 오른쪽 끝에 편집내용보기(스탑북 뷰어)
    const editorCell = `<div class="spec-title"><span class="badge edit-${sp.editService === '편집메이트' ? 'mate' : 'self'}">${esc(sp.editService)}</span>
      <a class="btn btn-xs" href="${esc(sp.viewerUrl)}" target="_blank" rel="noopener" data-viewer>편집내용보기</a></div>`;
    const codeCell = opts.productLink
      ? `<button type="button" class="link-btn mono" data-product="${i}" title="상품 정보 보기">${esc(it.code)}</button>`
      : `<span class="mono">${esc(it.code)}</span>`;
    return `<div class="spec-box">
      <div class="flow-head"><b>상품정보</b></div>
      <!-- 첫 줄은 항목 3쌍(6칸), 아래 줄들은 항목 2쌍(4칸)이라 표를 나눠 각 표 안에서 칸 폭을 같게 맞춤 -->
      <table class="spec-table">
        <colgroup><col class="c-th"><col><col class="c-th"><col><col class="c-th"><col></colgroup>
        <tr>
          <th>상품 제작 번호</th><td class="mono">${esc(sp.makeNo)}</td>
          <th>상품 코드</th><td>${codeCell}</td>
          <th>편집 서비스 이용</th><td>${editorCell}</td>
        </tr>
      </table>
      <table class="spec-table spec-table-sub">
        <colgroup><col class="c-th"><col><col class="c-th"><col></colgroup>
        <tr><th>주문사양</th><td colspan="3" class="spec-opts-cell">
          <div class="spec-opts">${specOpts.map(([k, v]) => `<div><span>${k}</span><b>${dash(v)}</b></div>`).join('')}</div>
        </td></tr>
        <tr>
          <th>부가서비스</th><td>${dash(sp.services.join(', '))}</td>
          <th>추가상품 구매</th><td>${sp.addons.length
            ? `<div class="addon-list">${sp.addons.map(a => `<span class="addon-chip">${esc(a.name)} <b>${a.qty}개</b></span>`).join('')}</div>`
            : dash('')}</td>
        </tr>
        <tr><th>표지 디자인</th><td>${dash(sp.coverDesign)}</td><th>내지 디자인</th><td>${dash(sp.innerDesign)}</td></tr>
        <tr><th>최초 편집 시작일</th><td>${esc(sp.editStartedAt)}</td><th>편집 완료일</th><td>${esc(sp.editDoneAt)}</td></tr>
      </table>
    </div>
    ${flowHtml(it.flow)}`;
  }

  // 편집내용보기: 스탑북 뷰어를 새 창(팝업)으로. 팝업이 막히면 링크의 target=_blank로 새 탭에서 열림
  // 클릭 이벤트에서 호출. 편집내용보기 링크를 누른 경우 true
  function openViewer(e) {
    const v = e.target.closest('[data-viewer]');
    if (!v) return false;
    const w = window.open(v.href, 'stopbookViewer', 'width=1100,height=900,resizable=yes,scrollbars=yes');
    if (w) { w.opener = null; w.focus(); e.preventDefault(); }
    return true;
  }

  window.ItemDetail = { html, flowHtml, openViewer };
})();

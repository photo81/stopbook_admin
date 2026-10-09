// 상품 제작 상세 (상품정보 + 제작 공정) 공용 렌더링
// 주문 상세 > 주문정보의 상품 아코디언, 제작중·외주 제작의 상품제작번호 아코디언에서 같은 화면을 씀
// member-type-store.js(AdminUtil), member-data.js(MemberData) 다음에 로드
// 사용: ItemDetail.html(item, i)  → 상품정보 상자 + 제작 공정 플로우 HTML (상품 코드는 표시하지 않음. 옵션 인자는 호환용으로 받기만 함)
//   편집내용 확인: 편집기 버튼(data-editor → 샘플 편집기 모달) · 미리보기 링크(data-viewer → ItemDetail.openViewer 팝업)
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
    // 편집 서비스 이용: 직접편집 / 편집메이트
    const serviceCell = `<span class="badge edit-${sp.editService === '편집메이트' ? 'mate' : 'self'}">${esc(sp.editService)}</span>`;
    // 편집내용 확인: 편집기(주문한 작업물을 편집기로 열기 — 프로토타입은 샘플 화면) · 미리보기(스탑북 뷰어)
    const checkCell = `<div class="spec-title spec-actions">
      <button type="button" class="btn btn-xs" data-editor="${i}" data-name="${esc(it.name)}" data-make="${esc(sp.makeNo)}" data-size="${esc(sp.size || '')}" data-pages="${esc(pagesText(sp))}" data-service="${esc(sp.editService)}" title="주문한 작업물을 편집기로 엽니다">편집기</button>
      <a class="btn btn-xs" href="${esc(sp.viewerUrl)}" target="_blank" rel="noopener" data-viewer title="편집한 내용을 뷰어로 봅니다">미리보기</a></div>`;
    return `<div class="spec-box">
      <div class="flow-head"><b>상품정보</b></div>
      <!-- 첫 줄은 항목 3쌍(6칸), 아래 줄들은 항목 2쌍(4칸)이라 표를 나눠 각 표 안에서 칸 폭을 같게 맞춤 (상품 코드는 표시하지 않음) -->
      <table class="spec-table">
        <colgroup><col class="c-th"><col><col class="c-th"><col><col class="c-th"><col></colgroup>
        <tr>
          <th>상품 제작 번호</th><td class="mono">${esc(sp.makeNo)}</td>
          <th>편집 서비스 이용</th><td>${serviceCell}</td>
          <th>편집내용 확인</th><td>${checkCell}</td>
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

  // ===== 편집기 (샘플) =====
  // 편집기 버튼을 누르면 주문한 작업물이 열린 편집기 화면을 모달로 보여줌. 프로토타입이라 실제 편집기 대신 SVG로 그린 예시 화면
  // TODO: 실서비스에서는 작업 키(mskey)로 스탑북 편집기(직접편집) 또는 편집메이트 작업 화면을 새 창으로 열기
  function editorSvg(d) {
    const photo = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#dfe3ea"/><path d="M${x + w * 0.1} ${y + h * 0.78} l${w * 0.22} -${h * 0.3} l${w * 0.18} ${h * 0.18} l${w * 0.15} -${h * 0.22} l${w * 0.25} ${h * 0.34} z" fill="#c3c9d4"/><circle cx="${x + w * 0.72}" cy="${y + h * 0.26}" r="${Math.min(w, h) * 0.08}" fill="#c3c9d4"/>`;
    const thumb = (n, y, cur) => `<rect x="14" y="${y}" width="86" height="56" rx="4" fill="#fff" stroke="${cur ? '#4f46e5' : '#d4d4d8'}" stroke-width="${cur ? 2 : 1}"/><rect x="20" y="${y + 6}" width="35" height="44" fill="#e4e4e7"/><rect x="59" y="${y + 6}" width="35" height="44" fill="#e4e4e7"/><text x="57" y="${y + 68}" text-anchor="middle" font-size="9" fill="#71717a">${n}</text>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 640" font-family="Pretendard, Malgun Gothic, sans-serif" role="img" aria-label="편집기 예시 화면">
      <rect width="1000" height="640" fill="#f4f4f5"/>
      <!-- 상단 바 -->
      <rect width="1000" height="44" fill="#18181b"/>
      <rect x="14" y="13" width="18" height="18" rx="5" fill="#fff"/><text x="40" y="28" font-size="14" font-weight="700" fill="#fff">STOPBOOK 편집기</text>
      <text x="200" y="28" font-size="12" fill="#d4d4d8">파일</text><text x="236" y="28" font-size="12" fill="#d4d4d8">편집</text><text x="272" y="28" font-size="12" fill="#d4d4d8">사진</text><text x="308" y="28" font-size="12" fill="#d4d4d8">텍스트</text><text x="354" y="28" font-size="12" fill="#d4d4d8">배경</text><text x="390" y="28" font-size="12" fill="#d4d4d8">레이아웃</text>
      <rect x="800" y="10" width="78" height="24" rx="4" fill="#3f3f46"/><text x="839" y="26" text-anchor="middle" font-size="12" fill="#fff">저장</text>
      <rect x="886" y="10" width="100" height="24" rx="4" fill="#4f46e5"/><text x="936" y="26" text-anchor="middle" font-size="12" fill="#fff">주문하기</text>
      <!-- 왼쪽 페이지 목록 -->
      <rect x="0" y="44" width="114" height="596" fill="#fafafa"/><line x1="114" y1="44" x2="114" y2="640" stroke="#e4e4e7"/>
      <text x="14" y="66" font-size="11" font-weight="600" fill="#52525b">페이지</text>
      ${thumb('표지', 78, false)}${thumb('1-2', 158, false)}${thumb('3-4', 238, true)}${thumb('5-6', 318, false)}${thumb('7-8', 398, false)}${thumb('9-10', 478, false)}
      <!-- 가운데 펼침면 -->
      <text x="557" y="68" text-anchor="middle" font-size="12" fill="#52525b">${esc(d.name)} · ${esc(d.size || '-')} · ${esc(d.pages || '-')} · 3-4 페이지</text>
      <rect x="146" y="84" width="820" height="470" rx="4" fill="#fff" stroke="#d4d4d8"/>
      <line x1="556" y1="84" x2="556" y2="554" stroke="#e4e4e7" stroke-dasharray="4 4"/>
      ${photo(176, 114, 350, 230)}${photo(176, 360, 165, 160)}${photo(361, 360, 165, 160)}
      ${photo(586, 114, 350, 300)}
      <rect x="586" y="434" width="350" height="86" rx="3" fill="#f4f4f5"/><text x="600" y="462" font-size="13" fill="#3f3f46">우리 가족의 가을 여행</text><text x="600" y="484" font-size="11" fill="#71717a">2026. 10. 제주 · 사진 12장</text><text x="600" y="504" font-size="11" fill="#71717a">텍스트를 입력하세요</text>
      <rect x="176" y="114" width="350" height="230" rx="3" fill="none" stroke="#4f46e5" stroke-width="2"/>
      <circle cx="176" cy="114" r="4" fill="#fff" stroke="#4f46e5"/><circle cx="526" cy="114" r="4" fill="#fff" stroke="#4f46e5"/><circle cx="176" cy="344" r="4" fill="#fff" stroke="#4f46e5"/><circle cx="526" cy="344" r="4" fill="#fff" stroke="#4f46e5"/>
      <text x="557" y="582" text-anchor="middle" font-size="11" fill="#a1a1aa">◀  3 - 4 / ${esc(d.pages || '24p')}  ▶</text>
      <!-- 하단 사진 보관함 -->
      <rect x="146" y="596" width="820" height="36" rx="4" fill="#fff" stroke="#e4e4e7"/><text x="158" y="618" font-size="11" fill="#52525b">사진 보관함</text>
      ${[0, 1, 2, 3, 4, 5, 6, 7].map(k => `<rect x="${240 + k * 46}" y="602" width="38" height="24" rx="2" fill="#dfe3ea"/>`).join('')}
      <!-- 오른쪽 속성 -->
      <rect x="880" y="44" width="120" height="596" fill="#fafafa"/><line x1="880" y1="44" x2="880" y2="640" stroke="#e4e4e7"/>
      <text x="892" y="66" font-size="11" font-weight="600" fill="#52525b">속성</text>
      <text x="892" y="90" font-size="10" fill="#71717a">선택: 사진 1</text>
      <text x="892" y="112" font-size="10" fill="#71717a">크기 350 × 230</text>
      <text x="892" y="134" font-size="10" fill="#71717a">테두리 없음</text>
      <text x="892" y="156" font-size="10" fill="#71717a">그림자 없음</text>
      <rect x="892" y="176" width="96" height="22" rx="4" fill="#fff" stroke="#d4d4d8"/><text x="940" y="191" text-anchor="middle" font-size="10" fill="#3f3f46">사진 바꾸기</text>
      <rect x="892" y="204" width="96" height="22" rx="4" fill="#fff" stroke="#d4d4d8"/><text x="940" y="219" text-anchor="middle" font-size="10" fill="#3f3f46">자르기</text>
      <text x="892" y="600" font-size="10" fill="#a1a1aa">${esc(d.service)}</text><text x="892" y="616" font-size="10" fill="#a1a1aa">${esc(d.make)}</text>
    </svg>`;
  }
  function ensureEditorModal() {
    if (document.getElementById('editorModal')) return;
    const el = document.createElement('div');
    el.className = 'modal-bg modal-top';
    el.id = 'editorModal';
    el.innerHTML = `<div class="modal modal-wide editor-modal" role="dialog" aria-modal="true" aria-labelledby="editorTitle">
      <div class="modal-header"><h2 id="editorTitle">편집기</h2><button type="button" class="close" data-eclose aria-label="닫기">&times;</button></div>
      <div class="modal-body"><div class="readonly at-note" id="editorNote" style="margin:0 0 8px"></div><div class="editor-frame" id="editorFrame"></div></div>
      <div class="modal-footer"><span class="readonly" style="margin-right:auto">프로토타입 예시 화면입니다. 실서비스에서는 주문한 작업물이 편집기에서 열립니다.</span><button type="button" class="btn" data-eclose>닫기</button></div>
    </div>`;
    document.body.appendChild(el);
    const close = () => el.classList.remove('open');
    el.querySelectorAll('[data-eclose]').forEach(b => b.addEventListener('click', close));
    el.addEventListener('click', e => { if (e.target === el) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  }
  // 편집기 버튼은 어느 화면에서든 같은 모달로 열리도록 문서 전체에서 처리
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-editor]');
    if (!b) return;
    ensureEditorModal();
    const d = b.dataset;
    document.getElementById('editorTitle').textContent = `편집기 - ${d.name} (${d.service})`;
    document.getElementById('editorNote').textContent = `상품 제작 번호 ${d.make} · ${d.size || '-'} · ${d.pages || '-'} · 고객이 주문한 작업물을 ${d.service === '편집메이트' ? '편집메이트 작업 화면' : '스탑북 편집기'}에서 연 상태`;
    document.getElementById('editorFrame').innerHTML = editorSvg(d);
    document.getElementById('editorModal').classList.add('open');
  });

  window.ItemDetail = { html, flowHtml, openViewer };
})();

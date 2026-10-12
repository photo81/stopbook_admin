// 목록 공통 도구: 목록 오른쪽 위 'N개씩' 선택 + 엑셀 다운로드(단위 선택 메뉴), 목록 아래 페이지 번호
// 주문 리스트(order-list.js)와 같은 모양·동작을 다른 화면(클레임관리 등)에서도 쓰기 위한 것
// member-type-store.js(AdminUtil) 다음에 로드
// 사용:
//   const tools = ListTools.create({
//     section,                 // 목록 패널(.panel) 요소: .list-head 오른쪽에 도구를 넣고 표 아래에 페이지 번호를 붙임
//     onChange,                // 페이지·개수가 바뀌면 다시 그리기
//     units: [{ label, desc, file, rows: () => [[머리글...], [값...], ...] }]   // 엑셀 단위 (첫 줄 = 머리글)
//   });
//   render 안에서: const pageRows = tools.page(rows);   // 현재 페이지 몫만 돌려주고 페이지 번호를 그림
//   검색·탭이 바뀌면: tools.first();                     // 1페이지로
(function () {
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`; };
  const toast = msg => (window.AdminUtil ? AdminUtil.toast(msg) : alert(msg));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const openMenus = new Set();
  document.addEventListener('click', e => { openMenus.forEach(close => close(e)); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') openMenus.forEach(close => close()); });

  // CSV (엑셀에서 열림): BOM + 따옴표 감싸기, 수식 주입 방지
  function downloadCsv(rows, fileName) {
    const cell = v => { let s = String(v ?? ''); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const blob = new Blob(['﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  function create({ section, onChange, units = [], size = 10 }) {
    const state = { page: 1, size };
    const head = section.querySelector('.list-head');
    let right = head.querySelector('.right');
    if (!right) { right = document.createElement('div'); right.className = 'right'; head.appendChild(right); }
    const box = document.createElement('div');
    box.className = 'right lt-tools';
    box.innerHTML = `
      <select class="lt-size" aria-label="한 페이지에 보일 개수">
        ${[10, 20, 50].map(n => `<option value="${n}"${n === size ? ' selected' : ''}>${n}개씩</option>`).join('')}
      </select>
      ${units.length ? `<div class="dl-wrap">
        <button type="button" class="btn btn-excel lt-excel" aria-haspopup="menu" aria-expanded="false">엑셀 다운로드 ▾</button>
        <div class="dl-menu" role="menu" hidden>${units.map((u, i) => `
          <button type="button" role="menuitem" data-unit="${i}"><b>${esc(u.label)}</b><span>${esc(u.desc || '')}</span></button>`).join('')}
        </div>
      </div>` : ''}`;
    right.appendChild(box);
    const pager = document.createElement('div');
    pager.className = 'pagination';
    const wrap = section.querySelector('.table-wrap');
    wrap.parentNode.insertBefore(pager, wrap.nextSibling);

    box.querySelector('.lt-size').addEventListener('change', e => { state.size = Number(e.target.value); state.page = 1; onChange(); });
    pager.addEventListener('click', e => {
      const b = e.target.closest('button[data-page]');
      if (b && !b.disabled) { state.page = Number(b.dataset.page); onChange(); }
    });

    const btn = box.querySelector('.lt-excel'), menu = box.querySelector('.dl-menu');
    if (btn) {
      const closeMenu = e => { if (e && e.target && e.target.closest && e.target.closest('.dl-wrap') === btn.parentNode) return; menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
      openMenus.add(closeMenu);
      btn.addEventListener('click', () => { const open = menu.hidden; menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); });
      menu.addEventListener('click', e => {
        const b = e.target.closest('[data-unit]');
        if (!b) return;
        menu.hidden = true; btn.setAttribute('aria-expanded', 'false');
        const u = units[Number(b.dataset.unit)];
        const rows = u.rows();
        if (rows.length <= 1) { toast('다운로드할 데이터가 없습니다.'); return; }
        downloadCsv(rows, `${u.file}_${today()}.csv`);
        toast(`${u.label}로 ${(rows.length - 1).toLocaleString()}건을 다운로드했습니다.`);
      });
    }

    function renderPager(pages) {
      const cur = state.page, bs = Math.floor((cur - 1) / 10) * 10 + 1, be = Math.min(pages, bs + 9);
      let html = `<button data-page="1" ${cur === 1 ? 'disabled' : ''}>«</button><button data-page="${cur - 1}" ${cur === 1 ? 'disabled' : ''}>‹</button>`;
      for (let p = bs; p <= be; p++) html += `<button data-page="${p}" class="${p === cur ? 'active' : ''}">${p}</button>`;
      html += `<button data-page="${cur + 1}" ${cur === pages ? 'disabled' : ''}>›</button><button data-page="${pages}" ${cur === pages ? 'disabled' : ''}>»</button>`;
      pager.innerHTML = html;
    }
    return {
      // 현재 페이지에 보일 행만 돌려줌 (페이지가 범위를 넘으면 마지막 페이지로)
      page(rows) {
        const pages = Math.max(1, Math.ceil(rows.length / state.size));
        if (state.page > pages) state.page = pages;
        renderPager(pages);
        const start = (state.page - 1) * state.size;
        return rows.slice(start, start + state.size);
      },
      first() { state.page = 1; },
      state
    };
  }

  window.ListTools = { create, downloadCsv };
})();

// 피드백 입력 (모든 화면 공통): 왼쪽 아래 플로팅 버튼 → 모달에서 구분(오류/개선/기타)·내용·확인자명(선택) 입력 → 구글 시트로 전송
// member-type-store.js(AdminUtil) 다음에 로드. 다른 화면 안에 끼워 넣은 화면(body.embed)에서는 버튼을 숨김
//
// 구글 시트 취합: 구글 Apps Script 웹 앱(feedback-apps-script.gs)으로 전송 → 시트에 한 줄씩 추가
//   FEEDBACK_ENDPOINT 에 배포한 웹 앱 URL(https://script.google.com/macros/s/.../exec)을 넣으면 연결됨
//   전송은 text/plain POST + no-cors (CORS 사전 요청 없이 정적 페이지에서 바로 전송, 응답 내용은 읽지 않음)
//   URL이 비어 있거나 전송에 실패하면 이 브라우저(localStorage)에 보관해 두고, 다음에 피드백을 보낼 때 함께 다시 보냄
// 함께 수집하는 기기 정보: 기기 종류(PC/모바일/태블릿)·운영체제·브라우저·화면·창 크기·픽셀 비율·터치·언어·시간대·User-Agent
// 화면 정보: 화면 이름·주소·프로토타입 버전·작성 시각
(function () {
  'use strict';
  const FEEDBACK_ENDPOINT = 'https://script.google.com/macros/s/AKfycby4owZAlEGfuRdwHpmAn8hnYi9r11hotcCbWVHEVpqwB1E7ogmU4Ks3Vc6t9oloNZNC/exec';   // 구글 Apps Script 웹 앱 배포 URL (feedback-apps-script.gs)
  const PENDING_KEY = 'stopbook.feedbackPending.v1';
  const CHECKER_KEY = 'stopbook.feedbackChecker.v1';   // 마지막에 입력한 확인자명 (다음에 열 때 채워 둠)
  const TYPES = ['오류', '개선', '기타'];
  const MAX_LEN = 1000;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = msg => (window.AdminUtil ? AdminUtil.toast(msg) : alert(msg));
  const pad = n => String(n).padStart(2, '0');
  const nowText = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

  // ===== 기기 정보 =====
  function deviceInfo() {
    const ua = navigator.userAgent;
    const os = /Windows NT 10/.test(ua) ? 'Windows 10/11' : /Windows/.test(ua) ? 'Windows'
      : /iPhone|iPad|iPod/.test(ua) ? `iOS ${(ua.match(/OS (\d+[_\d]*)/) || [, ''])[1].replace(/_/g, '.')}`.trim()
      : /Android/.test(ua) ? `Android ${(ua.match(/Android ([\d.]+)/) || [, ''])[1]}`.trim()
      : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '기타';
    const browser = /Edg\/([\d]+)/.test(ua) ? `Edge ${RegExp.$1}` : /Whale\/([\d]+)/.test(ua) ? `Whale ${RegExp.$1}`
      : /SamsungBrowser\/([\d]+)/.test(ua) ? `Samsung Internet ${RegExp.$1}` : /Chrome\/([\d]+)/.test(ua) ? `Chrome ${RegExp.$1}`
      : /Firefox\/([\d]+)/.test(ua) ? `Firefox ${RegExp.$1}` : /Version\/([\d.]+).*Safari/.test(ua) ? `Safari ${RegExp.$1}` : '기타';
    const touch = navigator.maxTouchPoints > 0;
    const device = /iPad|Tablet/.test(ua) || (/Macintosh/.test(ua) && touch) ? '태블릿' : /Mobi|iPhone|Android/.test(ua) ? '모바일' : 'PC';
    return {
      device, os, browser,
      screen: `${screen.width}x${screen.height}`,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      pixelRatio: window.devicePixelRatio || 1,
      touch: touch ? 'Y' : 'N',
      language: navigator.language || '',
      timezone: (Intl.DateTimeFormat().resolvedOptions().timeZone) || '',
      userAgent: ua
    };
  }

  // ===== 전송 =====
  const loadPending = () => { try { return JSON.parse(localStorage.getItem(PENDING_KEY)) || []; } catch (e) { return []; } };
  const savePending = list => { try { localStorage.setItem(PENDING_KEY, JSON.stringify(list)); } catch (e) { /* 저장소 사용 불가 */ } };
  async function post(rec) {
    await fetch(FEEDBACK_ENDPOINT, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(rec) });
  }
  // 보관 중인 피드백 + 새 피드백을 차례로 전송. 반환: { sent, kept }
  async function send(rec) {
    const queue = loadPending().concat([rec]);
    if (!FEEDBACK_ENDPOINT) { savePending(queue); return { sent: 0, kept: queue.length }; }
    const failed = [];
    for (const r of queue) { try { await post(r); } catch (e) { failed.push(r); } }
    savePending(failed);
    return { sent: queue.length - failed.length, kept: failed.length };
  }

  // ===== 화면 =====
  function ensure() {
    if ($('fbModal')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fb-float';
    btn.id = 'fbOpen';
    btn.innerHTML = '<span aria-hidden="true">✎</span> 피드백 입력';
    document.body.appendChild(btn);

    const el = document.createElement('div');
    el.className = 'modal-bg';
    el.id = 'fbModal';
    el.innerHTML = `
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="fbTitle" style="width:560px">
    <div class="modal-header">
      <h2 id="fbTitle">피드백 입력</h2>
      <button type="button" class="close" data-fbclose aria-label="닫기">&times;</button>
    </div>
    <form class="modal-body" id="fbForm" novalidate>
      <table class="form-table">
        <tr><th>피드백 구분 *</th><td>
          <div class="check-chips" role="radiogroup" aria-label="피드백 구분">${TYPES.map((t, i) => `
            <label class="check-chip"><input type="radio" name="fbType" value="${esc(t)}"${i === 0 ? ' checked' : ''}> ${esc(t)}</label>`).join('')}
          </div>
        </td></tr>
        <tr><th>내용 *</th><td>
          <textarea id="fbText" maxlength="${MAX_LEN}" placeholder="어떤 화면에서 무엇을 했을 때 어떤 일이 있었는지, 개선 의견 등을 적어 주세요." style="height:140px"></textarea>
          <div class="readonly fb-meta"><span id="fbLen">0 / ${MAX_LEN}</span></div>
          <div class="err" id="fbErr"></div>
        </td></tr>
        <tr><th>확인자명</th><td>
          <input type="text" id="fbChecker" maxlength="20" placeholder="선택 입력 (예: 홍길동)">
        </td></tr>
      </table>
      <p class="readonly fb-note" id="fbNote"></p>
    </form>
    <div class="modal-footer">
      <button type="button" class="btn" data-fbclose>닫기</button>
      <button type="submit" form="fbForm" class="btn btn-primary" id="fbSubmit">보내기</button>
    </div>
  </div>`;
    document.body.appendChild(el);

    const close = () => el.classList.remove('open');
    btn.addEventListener('click', open);
    el.querySelectorAll('[data-fbclose]').forEach(b => b.addEventListener('click', close));
    el.addEventListener('click', e => { if (e.target === el) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && el.classList.contains('open')) close(); });
    $('fbText').addEventListener('input', () => { $('fbLen').textContent = `${$('fbText').value.length} / ${MAX_LEN}`; $('fbErr').classList.remove('show'); });
    $('fbForm').addEventListener('submit', async e => {
      e.preventDefault();
      const text = $('fbText').value.trim();
      if (!text) { $('fbErr').textContent = '내용을 입력하세요.'; $('fbErr').classList.add('show'); $('fbText').focus(); return; }
      const ver = document.querySelector('[data-proto-version]');
      const rec = Object.assign({
        submittedAt: nowText(),
        type: document.querySelector('input[name=fbType]:checked').value,
        content: text,
        checker: $('fbChecker').value.trim(),   // 확인자명 (선택)
        page: (document.querySelector('h1') || {}).childNodes ? (document.querySelector('h1').childNodes[0].textContent || '').trim() : document.title,
        url: location.href,
        version: ver ? ver.textContent.trim() : '',
        admin: (window.AdminUtil && AdminUtil.ADMIN_NAME) || ''
      }, deviceInfo());
      try { localStorage.setItem(CHECKER_KEY, rec.checker); } catch (err) { /* 저장소 사용 불가 */ }
      $('fbSubmit').disabled = true;
      const r = await send(rec);
      $('fbSubmit').disabled = false;
      close();
      toast(r.sent ? `피드백을 보냈습니다.${r.sent > 1 ? ` (보관 중이던 ${r.sent - 1}건 포함)` : ''}${r.kept ? ` 전송하지 못한 ${r.kept}건은 보관해 두었다가 다시 보냅니다.` : ''}`
        : '구글 시트가 아직 연결되지 않아 이 브라우저에 보관했습니다. 연결 후 다음 피드백과 함께 전송됩니다.');
    });
  }

  function open() {
    ensure();
    $('fbText').value = '';
    $('fbLen').textContent = `0 / ${MAX_LEN}`;
    $('fbErr').classList.remove('show');
    document.querySelector('input[name=fbType][value="오류"]').checked = true;
    try { $('fbChecker').value = localStorage.getItem(CHECKER_KEY) || ''; } catch (e) { $('fbChecker').value = ''; }
    const pending = loadPending().length;
    $('fbNote').textContent = `보내면 현재 화면 정보와 기기 정보(기기 종류·운영체제·브라우저·화면 크기 등)가 함께 기록됩니다.${pending ? ` 보관 중인 피드백 ${pending}건도 함께 전송합니다.` : ''}`;
    $('fbModal').classList.add('open');
    $('fbText').focus();
  }

  function init() {
    if (document.body.classList.contains('embed')) return;   // 다른 화면 안에 끼워 넣은 화면에서는 숨김
    ensure();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.Feedback = { open, deviceInfo };
})();

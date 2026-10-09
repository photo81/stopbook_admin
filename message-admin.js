// 발송 관리 화면 공용 스크립트 (SMS 발송 관리 message-sms.html / 알림톡 발송 관리 message-alimtalk.html / 이메일 발송 관리 message-email.html)
// member-type-store.js, alimtalk.js, message-store.js 다음에 로드하고 MessageAdmin.init({ channel }) 호출
//   탭 1 발송 내역(기본): 메시지 전송 화면에서 이 채널로 보낸 기록
//   탭 2 발송양식: SMS·이메일은 추가·수정·삭제 (모달), 알림톡은 비즈엠 승인 템플릿이라 목록만 (등록·수정은 비즈엠에서)
(function () {
  'use strict';
  const { esc, toast, initSidebar } = AdminUtil;
  const S = MessageStore;
  const $ = id => document.getElementById(id);
  const cut = (t, n) => (t.length > n ? t.slice(0, n) + '…' : t);

  function init({ channel }) {
    const ch = S.CHANNELS[channel];
    const editable = channel !== 'alimtalk';
    const isEmail = channel === 'email';

    // ===== 발송양식 =====
    function renderTemplates() {
      const list = S.templates(channel);
      $('tmplCount').textContent = `${list.length}개`;
      $('tmplBody').innerHTML = list.length ? list.map(t => `<tr>
          <td class="left"><b>${esc(t.name)}</b>${t.ad ? ' <span class="badge nt-ad">광고</span>' : ''}${t.approved ? ' <span class="badge ps-결제완료">승인</span>' : ''}
            ${channel === 'alimtalk' ? `<div class="muted mono" style="font-size:11px">${esc(t.id)}</div>` : ''}</td>
          ${isEmail ? `<td class="left">${esc(t.subject || '')}</td>` : ''}
          <td class="left tmpl-body"><span title="${esc(t.body)}">${esc(cut(t.body.replace(/\n/g, ' / '), 90))}</span></td>
          <td>${channel === 'sms' ? S.smsKind(t.body) : channel === 'alimtalk' ? (t.button ? `버튼: ${esc(t.button.name)}` : '-') : `${t.body.length.toLocaleString()}자`}</td>
          <td class="left">${S.varKeys(t.body).map(k => `<span class="chip-sm">#{${esc(k)}}</span>`).join(' ') || '<span class="muted">-</span>'}</td>
          <td class="keep">${editable ? `<button type="button" class="btn btn-sm" data-edit="${esc(t.id)}">수정</button> <button type="button" class="btn btn-sm btn-danger" data-del="${esc(t.id)}">삭제</button>`
            : '<span class="muted">비즈엠에서 관리</span>'}</td>
        </tr>`).join('') : `<tr><td colspan="${isEmail ? 6 : 5}" class="empty">등록된 발송양식이 없습니다.</td></tr>`;
    }

    // 양식 추가·수정 모달 (SMS·이메일)
    let editing = null;
    function openForm(t) {
      editing = t || null;
      $('fTitle').textContent = t ? '발송양식 수정' : '발송양식 추가';
      $('fName').value = t ? t.name : '';
      if (isEmail) $('fSubject').value = t ? (t.subject || '') : '';
      $('fBody').value = t ? t.body : '';
      $('fAd').checked = !!(t && t.ad);
      $('fErr').classList.remove('show');
      syncBody();
      $('tmplModal').classList.add('open');
      $('fName').focus();
    }
    const closeForm = () => { $('tmplModal').classList.remove('open'); editing = null; };
    function syncBody() {
      const body = $('fBody').value;
      $('fBodyInfo').textContent = channel === 'sms' ? `${S.smsBytes(body).toLocaleString()} / ${S.SMS_MAX.toLocaleString()}byte · ${S.smsKind(body)}` : `${body.length.toLocaleString()}자`;
      const manual = S.manualKeys(body);
      $('fVarNote').textContent = manual.length ? `보낼 때 입력하는 변수: ${manual.map(k => `#{${k}}`).join(', ')}` : '';
    }
    function submitForm(e) {
      e.preventDefault();
      const name = $('fName').value.trim(), body = $('fBody').value.trim();
      const subject = isEmail ? $('fSubject').value.trim() : '';
      let msg = '';
      if (!name) msg = '양식 이름을 입력하세요.';
      else if (isEmail && !subject) msg = '메일 제목을 입력하세요.';
      else if (!body) msg = '본문을 입력하세요.';
      else if (channel === 'sms' && S.smsBytes(body) > S.SMS_MAX) msg = `본문은 ${S.SMS_MAX.toLocaleString()}byte 이내여야 합니다.`;
      $('fErr').textContent = msg;
      $('fErr').classList.toggle('show', !!msg);
      if (msg) return;
      const rec = { id: editing ? editing.id : '', name, body, ad: $('fAd').checked };
      if (isEmail) rec.subject = subject;
      const saved = S.saveTemplate(channel, rec);
      closeForm();
      renderTemplates();
      toast(saved ? `발송양식을 ${editing ? '수정' : '추가'}했습니다.` : '저장소를 사용할 수 없어 이 화면에만 반영되었습니다.');
    }

    if (editable) {
      $('btnTmplAdd').addEventListener('click', () => openForm(null));
      $('btnTmplReset').addEventListener('click', () => {
        if (!confirm('발송양식을 기본 목록으로 되돌리시겠습니까? 추가·수정한 양식은 사라집니다.')) return;
        S.resetTemplates(channel); renderTemplates(); toast('기본 발송양식으로 되돌렸습니다.');
      });
      $('tmplBody').addEventListener('click', e => {
        const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
        if (ed) openForm(S.templates(channel).find(t => t.id === ed.dataset.edit));
        if (del) {
          const t = S.templates(channel).find(x => x.id === del.dataset.del);
          if (t && confirm(`'${t.name}' 양식을 삭제하시겠습니까?`)) { S.deleteTemplate(channel, t.id); renderTemplates(); toast('발송양식을 삭제했습니다.'); }
        }
      });
      $('tmplForm').addEventListener('submit', submitForm);
      $('fBody').addEventListener('input', syncBody);
      // 변수 끼워 넣기: 커서 위치에 #{변수}
      $('varChips').innerHTML = S.AUTO_VARS.map(v => `<button type="button" class="btn btn-xs" data-var="${esc(v.key)}" title="${esc(v.desc)}">#{${esc(v.key)}}</button>`).join('')
        + '<span class="readonly" style="margin-left:6px">그 밖의 #{변수}는 보낼 때 직접 입력</span>';
      $('varChips').addEventListener('click', e => {
        const b = e.target.closest('[data-var]');
        if (!b) return;
        const ta = $('fBody'), s = ta.selectionStart, v = `#{${b.dataset.var}}`;
        ta.value = ta.value.slice(0, s) + v + ta.value.slice(ta.selectionEnd);
        ta.focus(); ta.selectionStart = ta.selectionEnd = s + v.length;
        syncBody();
      });
      document.querySelectorAll('#tmplModal [data-close]').forEach(b => b.addEventListener('click', closeForm));
      $('tmplModal').addEventListener('click', e => { if (e.target === $('tmplModal')) closeForm(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') closeForm(); });
    }

    // ===== 발송 내역 =====
    function renderLogs() {
      const list = S.logs(channel);
      $('logCount').textContent = `${list.length}건`;
      $('logBody').innerHTML = list.length ? list.map(l => `<tr>
          <td>${esc(l.at)}</td>
          <td class="left"><b>${esc(l.templateName)}</b>${l.ad ? ' <span class="badge nt-ad">광고</span>' : ''}</td>
          <td class="num">${l.count.toLocaleString()}명</td>
          <td><span class="yn-on">${l.success.toLocaleString()}</span>${l.fail ? ` / <span class="warn">실패 ${l.fail.toLocaleString()}</span>` : ''}</td>
          <td>${l.reserveAt ? `<span class="badge ps-입금대기">예약</span> ${esc(l.reserveAt)}` : '<span class="badge ps-결제완료">즉시</span>'}</td>
          <td class="left tmpl-body"><span title="${esc(l.sample || '')}">${esc(cut((l.sample || '').replace(/\n/g, ' / '), 70))}</span></td>
          <td>${esc(l.by)}</td>
        </tr>`).join('') : '<tr><td colspan="7" class="empty">발송 내역이 없습니다. 메시지 전송 화면에서 보낸 기록이 여기에 쌓입니다.</td></tr>';
    }

    // ===== 탭: 발송 내역(기본) / 발송양식 =====
    $('adminTabs').addEventListener('click', e => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      $('adminTabs').querySelectorAll('[data-tab]').forEach(x => { const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-selected', String(on)); });
      $('panelLog').hidden = b.dataset.tab !== 'log';
      $('panelTmpl').hidden = b.dataset.tab !== 'tmpl';
    });

    renderTemplates();
    renderLogs();
    initSidebar();
  }

  window.MessageAdmin = { init };
})();

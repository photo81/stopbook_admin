// 메시지 전송 공용 데이터 (메시지 전송 message-send.html / SMS·알림톡·이메일 발송 관리)
// member-type-store.js(AdminUtil), alimtalk.js(Alimtalk) 다음에 로드
//   발송양식(템플릿): 알림톡 = 비즈엠 승인 템플릿(alimtalk.js, 읽기 전용) / SMS·이메일 = 관리 메뉴에서 등록·수정·삭제 (localStorage)
//   발송 내역: 메시지 전송에서 보낸 기록 (localStorage). 관리 메뉴에서 채널별로 확인
// TODO: 실서비스에서는 GET/POST/PUT/DELETE /api/admin/message-templates?channel=, GET /api/admin/message-logs?channel=
(function () {
  'use strict';
  const TEMPLATE_KEY = { sms: 'stopbook.smsTemplates.v1', email: 'stopbook.emailTemplates.v1' };
  const LOG_KEY = 'stopbook.messageLogs.v1';
  const pad = n => String(n).padStart(2, '0');
  const nowText = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

  const CHANNELS = {
    // 알림톡 수신 동의 = SMS 수신 동의로 간주 (별도 동의 항목 없음). 정보성 메시지라 필수는 아니고 '수신 동의 회원만' 필터로 씀
    alimtalk: { label: '알림톡', page: 'message-alimtalk.html', to: m => m.phone, toLabel: '휴대폰', consent: 'marketingSms' },
    sms: { label: 'SMS', page: 'message-sms.html', to: m => m.phone, toLabel: '휴대폰', consent: 'marketingSms' },
    email: { label: '이메일', page: 'message-email.html', to: m => m.email, toLabel: '이메일', consent: 'marketingEmail' }
  };

  // 본문 변수: 회원 정보로 자동 치환되는 것. 그 밖의 #{변수}는 보낼 때 관리자가 값을 입력
  const AUTO_VARS = [
    { key: '이름', desc: '회원 이름', auto: m => m.name },
    { key: '아이디', desc: '회원 아이디', auto: m => m.userId },
    { key: '등급', desc: '회원등급', auto: m => m.grade },
    { key: '회원구분', desc: '회원구분', auto: m => m.category },
    { key: '보유마일리지', desc: '보유 마일리지(P)', auto: m => (m.mileage || 0).toLocaleString() },
    { key: '휴대폰', desc: '휴대폰번호', auto: m => m.phone },
    { key: '이메일', desc: '이메일', auto: m => m.email }
  ];
  const varKeys = body => [...new Set([...String(body).matchAll(/#\{([^}]+)\}/g)].map(x => x[1]))];
  const manualKeys = body => varKeys(body).filter(k => !AUTO_VARS.some(v => v.key === k));
  // 회원 + 관리자 입력값으로 본문 치환 (값이 없는 변수는 그대로 남겨 미리보기에서 표시)
  const fill = (body, member, values) => String(body).replace(/#\{([^}]+)\}/g, (all, k) => {
    if (values && values[k] !== undefined && String(values[k]).trim() !== '') return values[k];
    const v = AUTO_VARS.find(x => x.key === k);
    const r = v && member ? v.auto(member) : '';
    return r !== '' && r !== undefined && r !== null ? r : all;
  });

  // 문자 바이트(EUC-KR 기준: 한글 2byte). 90byte 이하 SMS, 2,000byte 이하 LMS
  const smsBytes = s => [...String(s)].reduce((n, c) => n + (c.charCodeAt(0) > 127 ? 2 : 1), 0);
  const smsKind = s => (smsBytes(s) > 90 ? 'LMS' : 'SMS');
  const SMS_MAX = 2000;

  // ===== 기본 발송양식 (SMS · 이메일) =====
  // ad: 광고성 → 수신 동의 회원에게만, 본문 앞에 (광고), 끝에 무료수신거부 안내 (정보통신망법)
  const DEFAULTS = {
    sms: [
      { id: 'sms_order', name: '주문 접수 안내', ad: false, body: '[스탑북] #{이름}님, 주문이 접수되었습니다.\n주문번호 #{주문번호}\n마이페이지에서 진행 상황을 확인하실 수 있습니다.' },
      { id: 'sms_deposit', name: '미입금 안내', ad: false, body: '[스탑북] #{이름}님, 주문하신 건의 입금이 확인되지 않았습니다.\n주문번호 #{주문번호}\n입금 기한 #{입금기한}까지 입금해 주세요. 기한이 지나면 주문이 취소됩니다.' },
      { id: 'sms_ship', name: '배송 시작 안내', ad: false, body: '[스탑북] #{이름}님, 주문하신 상품이 출고되었습니다.\n#{택배사} #{운송장번호}\n배송 조회는 마이페이지에서 확인해 주세요.' },
      { id: 'sms_grade', name: '회원 등급 안내', ad: false, body: '[스탑북] #{이름}님의 이번 달 회원 등급은 #{등급}입니다. 등급 혜택은 마이페이지에서 확인하세요.' },
      { id: 'sms_event', name: '이벤트 안내 (광고)', ad: true, body: '#{이름}님, 스탑북 가을 포토북 제작 이벤트! #{기간} 동안 전 상품 #{할인율} 할인.\n지금 만들기 ▶ https://m.stopbook.co.kr/event' }
    ],
    email: [
      { id: 'email_welcome', name: '가입 환영', ad: false, subject: '[스탑북] #{이름}님, 가입을 환영합니다', body: '#{이름}님, 스탑북 회원이 되신 것을 환영합니다.\n\n아이디: #{아이디}\n회원등급: #{등급}\n\n첫 주문 시 사용할 수 있는 쿠폰이 쿠폰함에 지급되었습니다.\n스탑북에서 소중한 순간을 책으로 남겨 보세요.' },
      { id: 'email_order', name: '주문 접수 안내', ad: false, subject: '[스탑북] 주문이 접수되었습니다 (#{주문번호})', body: '#{이름}님, 주문해 주셔서 감사합니다.\n\n주문번호: #{주문번호}\n주문상품: #{주문상품}\n\n제작이 시작되면 다시 안내드리겠습니다.' },
      { id: 'email_grade', name: '회원 등급 안내', ad: false, subject: '[스탑북] 이번 달 회원 등급 안내', body: '#{이름}님의 이번 달 회원 등급은 #{등급}입니다.\n보유 마일리지: #{보유마일리지}P\n\n등급별 혜택은 마이페이지 > 등급 혜택에서 확인하실 수 있습니다.' },
      { id: 'email_news', name: '신상품 소식 (광고)', ad: true, subject: '#{이름}님께 드리는 스탑북 신상품 소식', body: '#{이름}님, 안녕하세요. 스탑북입니다.\n\n이번 달 새로 나온 #{신상품}을 소개합니다.\n#{기간} 동안 출시 기념 #{할인율} 할인을 진행합니다.\n\n자세히 보기: https://www.stopbook.co.kr/new' }
    ]
  };

  const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } };
  const write = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch (e) { return false; } };

  // 발송양식 목록. 알림톡은 비즈엠 승인 템플릿(읽기 전용, 변수는 alimtalk.js의 vars)
  function templates(channel) {
    if (channel === 'alimtalk') {
      return (window.Alimtalk ? Alimtalk.TEMPLATES : []).map(t => ({ id: t.tmplId, name: t.name, body: t.body, button: t.button, vars: t.vars, approved: true, readonly: true, ad: false, raw: t }));
    }
    const saved = read(TEMPLATE_KEY[channel]);
    return (Array.isArray(saved) ? saved : DEFAULTS[channel].map(t => Object.assign({}, t))).map(t => Object.assign({ ad: false }, t));
  }
  // 추가(id 없음)·수정(id 있음). 반환: 저장 성공 여부
  function saveTemplate(channel, tmpl) {
    if (!TEMPLATE_KEY[channel]) return false;
    const list = templates(channel);
    if (tmpl.id) { const i = list.findIndex(t => t.id === tmpl.id); if (i >= 0) list[i] = Object.assign(list[i], tmpl); else list.push(tmpl); }
    else { tmpl.id = `${channel}_${Date.now().toString(36)}`; list.push(tmpl); }
    return write(TEMPLATE_KEY[channel], list.map(t => { const c = Object.assign({}, t); delete c.raw; return c; }));
  }
  function deleteTemplate(channel, id) {
    if (!TEMPLATE_KEY[channel]) return false;
    return write(TEMPLATE_KEY[channel], templates(channel).filter(t => t.id !== id));
  }
  // 기본 양식으로 되돌리기 (관리 메뉴)
  const resetTemplates = channel => { try { localStorage.removeItem(TEMPLATE_KEY[channel]); return true; } catch (e) { return false; } };

  // ===== 발송 내역 =====
  // { id, at, channel, templateId, templateName, count, success, fail, reserveAt, by, sample(첫 수신자 본문) }
  const logs = channel => (read(LOG_KEY) || []).filter(l => !channel || l.channel === channel).sort((a, b) => b.at.localeCompare(a.at));
  function addLog(entry) {
    const list = read(LOG_KEY) || [];
    list.push(Object.assign({ id: 'l' + Date.now().toString(36), at: nowText() }, entry));
    return write(LOG_KEY, list);
  }

  window.MessageStore = { CHANNELS, AUTO_VARS, varKeys, manualKeys, fill, smsBytes, smsKind, SMS_MAX, templates, saveTemplate, deleteTemplate, resetTemplates, logs, addLog, nowText };
})();

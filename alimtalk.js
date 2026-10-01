// 알림톡 발송 (스윗트래커 비즈엠 API v2.29.7 기준)
// - 알림톡은 비즈엠에서 사전 승인된 템플릿으로만 발송 가능. 템플릿 본문은 고정이고 #{변수}만 치환한다.
//   (승인된 템플릿과 본문이 다르면 K105:NoMatchedTemplate 로 실패)
// - 정보성 메시지 전용. 광고성 문구는 템플릿 검수에서 반려되며, 광고는 브랜드메시지(FT 등)로 별도 발송해야 함.
// - 발송 실패 시 문자(SMS/LMS) 대체 발송 가능. 발신번호는 비즈엠에 사전 등록·승인된 번호만 사용.
//
// 프로토타입: 실제 호출 대신 요청 본문을 만들고 응답을 시뮬레이션한다.
// TODO: 실서비스에서는 브라우저가 비즈엠을 직접 호출하지 않는다.
//   관리자 화면 → POST /api/admin/members/{no}/alimtalk → 서버가 POST {host}/v2/sender/send 호출
//   (userid 헤더·발신프로필키는 서버 설정에만 보관, ConnectTimeout 15초 / ReadTimeout 100초 권장)
(function () {
  'use strict';

  // TODO: 서버 설정값. 화면에는 표시 용도로만 둠
  const CONFIG = {
    host: 'https://alimtalk-api.bizmsg.kr',            // 개발: https://dev-alimtalk-api.bizmsg.kr:1443
    path: '/v2/sender/send',
    userid: '{비즈엠 계정}',
    profile: '{발신프로필키 40자}',
    smsSender: '15880000'                                // TODO: 비즈엠 등록 승인된 발신번호 (숫자만)
  };

  const MSG_MAX = 1300;   // 알림톡 텍스트 타입 msg 최대 길이

  // 승인 템플릿 목록 (tmplId = 비즈엠 템플릿 코드)
  // vars: 치환할 변수. auto(m)가 있으면 회원 정보로 자동 입력, 없으면 관리자가 입력
  // TODO: 실서비스에서는 비즈엠에 등록·승인된 템플릿을 서버에서 조회 (GET /api/admin/alimtalk/templates)
  const TEMPLATES = [
    {
      tmplId: 'stopbook_grade_01', name: '회원 등급 안내',
      body: '[스탑북] 회원 등급 안내\n#{이름}님의 이번 달 회원 등급은 #{등급}입니다.\n\n등급 혜택은 마이페이지에서 확인하실 수 있습니다.',
      vars: [{ key: '이름', auto: m => m.name }, { key: '등급', auto: m => m.grade }],
      button: { name: '마이페이지', type: 'WL', url_mobile: 'https://m.stopbook.co.kr/mypage', url_pc: 'https://www.stopbook.co.kr/mypage' }
    },
    {
      tmplId: 'stopbook_mileage_01', name: '마일리지 지급 안내',
      body: '[스탑북] 마일리지 지급 안내\n#{이름}님, 마일리지 #{지급마일리지}P가 지급되었습니다.\n\n■ 지급 사유: #{사유}\n■ 보유 마일리지: #{보유마일리지}P',
      vars: [
        { key: '이름', auto: m => m.name },
        { key: '지급마일리지', placeholder: '예) 1,000' },
        { key: '사유', placeholder: '예) 이벤트 당첨' },
        { key: '보유마일리지', auto: m => (m.mileage || 0).toLocaleString() }
      ],
      button: { name: '마일리지 확인', type: 'WL', url_mobile: 'https://m.stopbook.co.kr/mypage/mileage', url_pc: 'https://www.stopbook.co.kr/mypage/mileage' }
    },
    {
      tmplId: 'stopbook_coupon_01', name: '쿠폰 지급 안내',
      body: '[스탑북] 쿠폰 지급 안내\n#{이름}님, #{쿠폰명} 쿠폰이 지급되었습니다.\n\n■ 사용 기한: #{사용기한}까지',
      vars: [
        { key: '이름', auto: m => m.name },
        { key: '쿠폰명', placeholder: '예) 3,000원 할인' },
        { key: '사용기한', placeholder: '예) 2026-12-31' }
      ],
      button: { name: '쿠폰함 보기', type: 'WL', url_mobile: 'https://m.stopbook.co.kr/mypage/coupon', url_pc: 'https://www.stopbook.co.kr/mypage/coupon' }
    },
    {
      tmplId: 'stopbook_group_01', name: '단체 회원 승인 안내',
      body: '[스탑북] 단체 회원 승인 안내\n#{이름}님, #{단체명} 단체 회원 신청이 승인되었습니다.\n\n■ 적용 기간: #{적용기간}',
      vars: [
        { key: '이름', auto: m => m.name },
        { key: '단체명', auto: m => (m.business ? m.business.companyName : ''), placeholder: '단체명' },
        { key: '적용기간', auto: m => (m.business && m.business.periodFrom ? `${m.business.periodFrom} ~ ${m.business.periodTo}` : ''), placeholder: '예) 2026-10-01 ~ 2027-09-30' }
      ]
    },
    {
      tmplId: 'stopbook_notice_01', name: '고객 문의 답변 안내',
      body: '[스탑북] 문의 답변 안내\n#{이름}님, 문의하신 내용에 대한 답변이 등록되었습니다.\n\n■ 문의 제목: #{문의제목}',
      vars: [{ key: '이름', auto: m => m.name }, { key: '문의제목', placeholder: '문의 제목' }],
      button: { name: '답변 확인', type: 'WL', url_mobile: 'https://m.stopbook.co.kr/mypage/qna', url_pc: 'https://www.stopbook.co.kr/mypage/qna' }
    }
  ];

  const fill = (body, values) => body.replace(/#\{([^}]+)\}/g, (all, k) => (values[k] !== undefined && values[k] !== '' ? values[k] : all));

  // 010-1234-5678 → 821012345678 (국가코드 82 포함)
  const toPhn = phone => {
    const d = String(phone).replace(/\D/g, '');
    return d.startsWith('0') ? '82' + d.slice(1) : d;
  };

  // 문자 바이트 (EUC-KR 기준: 한글 2byte, 그 외 1byte)
  const smsBytes = s => [...s].reduce((n, c) => n + (c.charCodeAt(0) > 127 ? 2 : 1), 0);
  const hasEmoji = s => /\p{Extended_Pictographic}/u.test(s);

  const pad = n => String(n).padStart(2, '0');
  const compactDt = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

  // 입력 검증 후 { payload } 또는 { error }
  // opts: { tmpl, values, fallback: boolean, reserveAt: Date|null }
  function buildPayload(member, opts) {
    const { tmpl, values } = opts;
    const missing = tmpl.vars.filter(v => !String(values[v.key] || '').trim()).map(v => v.key);
    if (missing.length) return { error: `템플릿 변수를 입력하세요: ${missing.join(', ')}` };
    const msg = fill(tmpl.body, values);
    if (msg.length > MSG_MAX) return { error: `메시지가 ${MSG_MAX.toLocaleString()}자를 초과합니다. (${msg.length.toLocaleString()}자)` };
    if (opts.reserveAt && opts.reserveAt.getTime() < Date.now() + 10 * 60000) return { error: '예약 시간은 현재부터 10분 이후로 지정하세요.' };

    const p = {
      message_type: 'AT',
      phn: toPhn(member.phone),
      profile: CONFIG.profile,
      tmplId: tmpl.tmplId,
      msg,
      reserveDt: opts.reserveAt ? compactDt(opts.reserveAt) : '00000000000000'
    };
    if (tmpl.button) p.button1 = tmpl.button;

    // 대체 문자: 알림톡 실패 시 같은 내용을 문자로 발송. 90byte 이하 SMS, 초과 시 LMS(2,000byte)
    if (opts.fallback) {
      if (hasEmoji(msg)) return { error: '이모지가 포함된 내용은 대체 문자로 발송할 수 없습니다.' };
      const bytes = smsBytes(msg);
      if (bytes > 2000) return { error: `대체 문자는 2,000byte 이내여야 합니다. (${bytes.toLocaleString()}byte)` };
      Object.assign(p, { smsKind: bytes > 90 ? 'L' : 'S', msgSms: msg, smsSender: CONFIG.smsSender });
      if (p.smsKind === 'L') p.smsLmsTit = msg.split('\n')[0].slice(0, 30);
    } else {
      p.smsKind = 'N';
    }
    return { payload: p };
  }

  // 응답 시뮬레이션 (실서비스에서는 서버 응답을 그대로 사용)
  // 응답 형식: [{ code, data: { phn, type, msgid }, message, originMessage }]
  let seq = 0;
  function simulateSend(payload) {
    const now = new Date();
    const msgid = `WEB${compactDt(now)}${String(now.getMilliseconds()).padStart(3, '0')}${String(++seq).padStart(3, '0')}`;
    const ok = /^8210\d{7,8}$/.test(payload.phn);
    return [{
      code: ok ? 'success' : 'fail',
      data: { phn: payload.phn, type: 'at', msgid },
      message: ok ? (payload.reserveDt !== '00000000000000' ? 'R000' : 'K000') : 'E104:InvalidPhoneNumber',
      originMessage: null
    }];
  }

  // 결과 코드 표시용 (전체 코드: https://alimtalk-center-api.bizmsg.kr/codeList.html)
  function resultText(r) {
    if (r.code === 'success') return r.message === 'R000' ? '예약 완료' : r.message === 'K000' ? '발송 성공' : `처리 (${r.message})`;
    return `실패 (${r.message})`;
  }

  window.Alimtalk = { CONFIG, TEMPLATES, MSG_MAX, fill, toPhn, smsBytes, buildPayload, simulateSend, resultText };
})();

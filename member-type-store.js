// 회원 유형 관리(구분/유형/등급) 혜택 설정 저장소 + 공통 헬퍼
// 프로토타입: 목록/상세 페이지 간 데이터 공유를 위해 localStorage 사용.
// TODO: 실서비스에서는 GET/PUT /api/admin/member-types 로 대체
(function () {
  'use strict';

  const KEY = 'stopbook.memberTypes.v3';   // v3: 등급은 정기 지급 혜택(benefit)만 사용
  const CREATED = [{ at: '2026-01-02 09:00', content: '항목 생성', by: '시스템' }];

  const item = (code, name, rate, desc, flags) => Object.assign({
    code, name, discountRate: rate, desc,
    mileageEarn: true, mileageUse: true, couponUse: true, stackOther: false, stackEvent: true,
    memos: [], history: CREATED.slice()
  }, flags);

  // 탭 순서 = 배열 순서
  const DEFAULTS = [
    { key: 'category', label: '구분', items: [
      item('normal', '일반', 0, '개인 회원 기본 구분. 마일리지 적립·사용과 쿠폰 사용이 가능합니다.'),
      item('group', '단체', 10, '학교·도서관·기관 등 단체 구매 회원. 단체 할인율을 적용하는 대신 마일리지·쿠폰 혜택은 제외합니다.',
        { mileageEarn: false, mileageUse: false, couponUse: false, stackEvent: false })
    ]},
    { key: 'memberType', label: '유형', items: [
      item('stopbook', '스탑북회원', 0, '스탑북 아이디/패스워드로 가입한 회원.'),
      item('kakao', '카카오회원', 0, '카카오 간편 로그인으로 가입한 회원.'),
      item('naver', '네이버회원', 0, '네이버 간편 로그인으로 가입한 회원.'),
      item('google', '구글회원', 0, '구글 간편 로그인으로 가입한 회원.')
    ]},
    // 등급은 혜택 플래그/할인율 대신 정기 지급 혜택(benefit)과 설명만 가짐
    { key: 'grade', label: '등급', items: [
      gradeItem('normal', '일반', '가입 시 기본 등급.', {}),
      gradeItem('starter', '스타터', '최근 6개월 구매 1회 이상.',
        { cycle: 'monthly', monthDay: 1, coupons: ['3,000원 할인'], mileageOn: true, mileage: 500 }),
      gradeItem('holic', '홀리커', '최근 6개월 구매 5회 이상.',
        { cycle: 'monthly', monthDay: 1, coupons: ['3,000원 할인', '무료배송'], mileageOn: true, mileage: 1000, discountOn: true, discountRate: 2 }),
      gradeItem('master', '마스터', '최근 6개월 구매 10회 이상.',
        { cycle: 'monthly', monthDay: 1, coupons: ['무료배송', '도서 2권 이상 15% 할인'], mileageOn: true, mileage: 2000, discountOn: true, discountRate: 3 }),
      gradeItem('master-vip', '마스터 VIP', '최근 6개월 구매 20회 이상.',
        { cycle: 'weekly', weekday: 0, coupons: ['무료배송', '3,000원 할인', '도서 2권 이상 15% 할인'], mileageOn: true, mileage: 3000, discountOn: true, discountRate: 5 })
    ]}
  ];

  function gradeItem(code, name, desc, benefit) {
    return { code, name, desc, benefit: Object.assign(emptyBenefit(), benefit), memos: [], history: CREATED.slice() };
  }

  function emptyBenefit() {
    return { cycle: 'none', weekday: 0, monthDay: 1, coupons: [], mileageOn: false, mileage: 0, discountOn: false, discountRate: 0 };
  }

  // 혜택 항목 정의: 목록 컬럼, 상세 폼, 히스토리 문구에서 공통 사용
  const FLAGS = [
    { key: 'mileageEarn', label: '마일리지 적립', on: '가능', off: '불가' },
    { key: 'mileageUse',  label: '마일리지 사용', on: '가능', off: '불가' },
    { key: 'couponUse',   label: '쿠폰 사용',     on: '가능', off: '불가' },
    { key: 'stackOther',  label: '타할인 중복',   on: '허용', off: '불허' },
    { key: 'stackEvent',  label: '이벤트 중복',   on: '허용', off: '불허' }
  ];

  // 탭별로 쓰지 않는 혜택 항목 (등급은 FLAGS 대신 GradeBenefit 사용)
  const EXCLUDED_FLAGS = { memberType: ['stackOther'] };
  const flagsFor = groupKey => FLAGS.filter(f => !(EXCLUDED_FLAGS[groupKey] || []).includes(f.key));

  const clone = v =>JSON.parse(JSON.stringify(v));

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* 저장소 사용 불가 시 기본값 */ }
    return clone(DEFAULTS);
  }

  function save(groups) {
    try { localStorage.setItem(KEY, JSON.stringify(groups)); return true; }
    catch (e) { return false; }
  }

  // ===== 공통 헬퍼 =====
  const pad = n => String(n).padStart(2, '0');
  const fmtDateTime = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let toastTimer;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
  }

  function initSidebar() {
    document.querySelectorAll('.sidebar .menu-parent').forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      const open = a.parentElement.classList.toggle('open');
      a.setAttribute('aria-expanded', String(open));
    }));
  }

  // ===== 등급 정기 혜택 (지급 주기 + 쿠폰/마일리지/할인) =====
  // 쿠폰·마일리지는 지급 주기에 맞춰 자동 지급, 할인은 해당 등급 주문 시 상시 적용
  // TODO: 쿠폰 목록은 실서비스에서 쿠폰 관리 API에서 조회 (members.html COUPONS와 동일하게 유지)
  const COUPONS = ['신규가입 10% 할인', '3,000원 할인', '무료배송', '생일축하 5,000원', '도서 2권 이상 15% 할인'];
  const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
  const CYCLES = [['none', '지급 안 함'], ['daily', '매일'], ['weekly', '매주'], ['monthly', '매월']];

  const GradeBenefit = {
    empty: emptyBenefit,

    // form-table에 들어갈 <tr> 묶음. prefix로 id를 구분해 한 페이지에 여러 번 써도 충돌 없음
    formHtml(p) {
      return `
        <tr><th>지급 주기</th><td>
          <div class="inline-row">
            <select id="${p}Cycle">${CYCLES.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>
            <select id="${p}Weekday" hidden>${WEEKDAYS.map((d, i) => `<option value="${i}">${d}요일</option>`).join('')}</select>
            <select id="${p}MonthDay" hidden>${Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}">${i + 1}일</option>`).join('')}<option value="last">말일</option></select>
            <span class="readonly">지급일 00:00 자동 지급</span>
          </div>
        </td></tr>
        <tr><th>쿠폰</th><td>
          <div class="check-chips">${COUPONS.map((c, i) => `
            <label class="check-chip"><input type="checkbox" name="${p}Coupon" id="${p}Coupon${i}" value="${esc(c)}"> ${esc(c)}</label>`).join('')}
          </div>
        </td></tr>
        <tr><th>마일리지 지급</th><td>
          <div class="inline-row">
            <label><input type="checkbox" id="${p}MileageOn"> 지급</label>
            <input type="text" id="${p}Mileage" inputmode="numeric" class="w-num"> P
          </div>
        </td></tr>
        <tr><th>할인 적용</th><td>
          <div class="inline-row">
            <label><input type="checkbox" id="${p}DiscountOn"> 적용</label>
            <input type="text" id="${p}DiscountRate" inputmode="numeric" class="w-num"> %
            <span class="readonly">주문 시 상시 적용</span>
          </div>
          <div class="err" id="${p}BenefitErr"></div>
        </td></tr>`;
    },

    bind(p) {
      const $ = id => document.getElementById(p + id);
      const sync = () => {
        $('Weekday').hidden = $('Cycle').value !== 'weekly';
        $('MonthDay').hidden = $('Cycle').value !== 'monthly';
        $('Mileage').disabled = !$('MileageOn').checked;
        $('DiscountRate').disabled = !$('DiscountOn').checked;
      };
      ['Cycle', 'MileageOn', 'DiscountOn'].forEach(id => $(id).addEventListener('change', sync));
      this._sync = this._sync || {};
      this._sync[p] = sync;
    },

    fill(p, b) {
      const $ = id => document.getElementById(p + id);
      $('Cycle').value = b.cycle;
      $('Weekday').value = String(b.weekday);
      $('MonthDay').value = String(b.monthDay);
      document.querySelectorAll(`input[name=${p}Coupon]`).forEach(cb => { cb.checked = b.coupons.includes(cb.value); });
      $('MileageOn').checked = b.mileageOn;
      $('Mileage').value = b.mileageOn ? b.mileage : '';
      $('DiscountOn').checked = b.discountOn;
      $('DiscountRate').value = b.discountOn ? b.discountRate : '';
      $('BenefitErr').classList.remove('show');
      if (this._sync && this._sync[p]) this._sync[p]();
    },

    // 입력값 검증 후 { value } 또는 { error } 반환
    read(p) {
      const $ = id => document.getElementById(p + id);
      const md = $('MonthDay').value;
      const b = {
        cycle: $('Cycle').value,
        weekday: Number($('Weekday').value),
        monthDay: md === 'last' ? 'last' : Number(md),
        coupons: [...document.querySelectorAll(`input[name=${p}Coupon]:checked`)].map(cb => cb.value),
        mileageOn: $('MileageOn').checked,
        mileage: 0,
        discountOn: $('DiscountOn').checked,
        discountRate: 0
      };
      const mText = $('Mileage').value.replace(/,/g, '').trim();
      const dText = $('DiscountRate').value.trim();
      let error = '';
      if (b.mileageOn && !(/^\d+$/.test(mText) && Number(mText) >= 1 && Number(mText) <= 1000000)) error = '마일리지는 1 ~ 1,000,000 사이 숫자로 입력하세요.';
      else if (b.discountOn && !(/^\d{1,3}$/.test(dText) && Number(dText) >= 1 && Number(dText) <= 100)) error = '할인율은 1~100 사이 정수로 입력하세요.';
      else if (b.cycle === 'none' && (b.coupons.length || b.mileageOn)) error = '쿠폰·마일리지를 지급하려면 지급 주기를 선택하세요.';
      if (b.mileageOn) b.mileage = Number(mText);
      if (b.discountOn) b.discountRate = Number(dText);
      $('BenefitErr').textContent = error;
      $('BenefitErr').classList.toggle('show', !!error);
      return error ? { error } : { value: b };
    },

    cycleText(b) {
      if (b.cycle === 'daily') return '매일';
      if (b.cycle === 'weekly') return `매주 ${WEEKDAYS[b.weekday]}요일`;
      if (b.cycle === 'monthly') return b.monthDay === 'last' ? '매월 말일' : `매월 ${b.monthDay}일`;
      return '지급 안 함';
    },
    mileageText: b => (b.mileageOn ? `${b.mileage.toLocaleString()}P` : '없음'),
    discountText: b => (b.discountOn ? `${b.discountRate}%` : '없음'),

    // 히스토리용 변경 내역
    diff(a, b) {
      const out = [];
      if (this.cycleText(a) !== this.cycleText(b)) out.push(`지급 주기 변경: ${this.cycleText(a)} → ${this.cycleText(b)}`);
      const added = b.coupons.filter(c => !a.coupons.includes(c));
      const removed = a.coupons.filter(c => !b.coupons.includes(c));
      if (added.length) out.push(`쿠폰 추가: ${added.join(', ')}`);
      if (removed.length) out.push(`쿠폰 제외: ${removed.join(', ')}`);
      if (this.mileageText(a) !== this.mileageText(b)) out.push(`마일리지 지급 변경: ${this.mileageText(a)} → ${this.mileageText(b)}`);
      if (this.discountText(a) !== this.discountText(b)) out.push(`할인 적용 변경: ${this.discountText(a)} → ${this.discountText(b)}`);
      return out;
    }
  };

  window.MemberTypeStore = { load, save, FLAGS, flagsFor, GradeBenefit };
  window.AdminUtil = { fmtDateTime, esc, toast, initSidebar, ADMIN_NAME: '관리자' };  // TODO: 로그인 관리자명
})();

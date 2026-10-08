// 회원 유형 관리(구분/유형/등급) 혜택 설정 저장소 + 공통 헬퍼
// 프로토타입: 목록/상세 페이지 간 데이터 공유를 위해 localStorage 사용.
// TODO: 실서비스에서는 GET/PUT /api/admin/member-types 로 대체
(function () {
  'use strict';

  const KEY = 'stopbook.memberTypes.v5';   // v4: 무료배송(freeShipping) 추가 / v5: 등급 평가 조건(policy)·등급별 평가 기준(criteria) 추가
  const CREATED = [{ at: '2026-01-02 09:00', content: '항목 생성', by: '시스템' }];

  const item = (code, name, rate, desc, flags) => Object.assign({
    code, name, discountRate: rate, desc,
    mileageEarn: true, mileageUse: true, couponUse: true, stackOther: false, stackEvent: true, freeShipping: false,
    memos: [], history: CREATED.slice()
  }, flags);

  // 탭 순서 = 배열 순서
  const DEFAULTS = [
    // 구분의 각 항목은 subs = 종류 목록을 가짐
    // (회원 정보 상세의 구분 > 종류 선택지, 단체회원 신청 승인 시 지정하는 종류 선택지로 사용)
    { key: 'category', label: '회원구분', items: [
      item('normal', '일반', 0, '개인 회원 기본 구분. 마일리지 적립·사용과 쿠폰 사용이 가능합니다.', { subs: [] }),
      item('group', '단체', 10, '기관·회사·학교 등 단체 구매 회원. 단체 할인율과 무료배송을 적용하는 대신 마일리지·쿠폰 혜택은 제외합니다.',
        { mileageEarn: false, mileageUse: false, couponUse: false, stackEvent: false, freeShipping: true,
          subs: ['기관', '회사', '학교', '유치원', '어린이집', '동호회', '기타'] })
    ]},
    { key: 'memberType', label: '가입유형', items: [
      item('stopbook', '스탑북회원', 0, '스탑북 아이디/패스워드로 가입한 회원.'),
      item('kakao', '카카오회원', 0, '카카오 간편 로그인으로 가입한 회원.'),
      item('naver', '네이버회원', 0, '네이버 간편 로그인으로 가입한 회원.'),
      item('google', '구글회원', 0, '구글 간편 로그인으로 가입한 회원.')
    ]},
    // 등급은 혜택 플래그/할인율 대신 평가 기준(criteria)·정기 지급 혜택(benefit)·설명을 가짐
    // policy: 등급 탭 상단의 회원 등급 평가 조건 (자동 등급 설정, 산정 주기, 평가 기준, 평가 기간)
    { key: 'grade', label: '회원등급', policy: { auto: true, cycle: 'monthly', monthDay: 1, basis: 'count', period: 'monthly' }, items: [
      gradeItem('normal', '일반', '가입 시 기본 등급.', {}, {}),
      gradeItem('starter', '스타터', '구매를 시작한 회원.',{ minCount: 1, minAmount: 50000 },
        { cycle: 'monthly', monthDay: 1, coupons: ['3,000원 할인'], mileageOn: true, mileage: 500 }),
      gradeItem('holic', '홀리커', '꾸준히 구매하는 단골 회원.',{ minCount: 5, minAmount: 200000 },
        { cycle: 'monthly', monthDay: 1, coupons: ['3,000원 할인', '무료배송'], mileageOn: true, mileage: 1000, discountOn: true, discountRate: 2 }),
      gradeItem('master', '마스터', '구매가 많은 우수 회원.',{ minCount: 10, minAmount: 500000 },
        { cycle: 'monthly', monthDay: 1, coupons: ['무료배송', '도서 2권 이상 15% 할인'], mileageOn: true, mileage: 2000, discountOn: true, discountRate: 3 }),
      gradeItem('master-vip', '마스터 VIP', '최상위 우수 회원.',{ minCount: 20, minAmount: 1000000 },
        { cycle: 'weekly', weekday: 0, coupons: ['무료배송', '3,000원 할인', '도서 2권 이상 15% 할인'], mileageOn: true, mileage: 3000, discountOn: true, discountRate: 5 })
    ]}
  ];

  function gradeItem(code, name, desc, criteria, benefit) {
    return {
      code, name, desc,
      criteria: Object.assign(emptyCriteria(), criteria),
      benefit: Object.assign(emptyBenefit(), benefit),
      memos: [], history: CREATED.slice()
    };
  }

  function emptyBenefit() {
    return { cycle: 'none', weekday: 0, monthDay: 1, coupons: [], mileageOn: false, mileage: 0, discountOn: false, discountRate: 0 };
  }

  function emptyCriteria() {
    return { minCount: 0, minAmount: 0 };   // 0 = 조건 없음(기본 등급)
  }

  function emptyPolicy() {
    return { auto: false, cycle: 'monthly', weekday: 0, monthDay: 1, basis: 'count', period: 'monthly', from: '', to: '' };
  }

  // 혜택 항목 정의: 목록 컬럼, 상세 폼, 히스토리 문구에서 공통 사용
  const FLAGS = [
    { key: 'mileageEarn', label: '마일리지 적립', on: '가능', off: '불가' },
    { key: 'mileageUse',  label: '마일리지 사용', on: '가능', off: '불가' },
    { key: 'couponUse',   label: '쿠폰 사용',     on: '가능', off: '불가' },
    { key: 'stackOther',  label: '타할인 중복',   on: '허용', off: '불허' },
    { key: 'stackEvent',  label: '이벤트 중복',   on: '허용', off: '불허' },
    { key: 'freeShipping', label: '무료배송',     on: '적용', off: '미적용' }
  ];

  // 탭별로 쓰지 않는 혜택 항목 (등급은 FLAGS 대신 GradeBenefit 사용)
  const EXCLUDED_FLAGS = { memberType: ['stackOther'] };
  const flagsFor = groupKey => FLAGS.filter(f => !(EXCLUDED_FLAGS[groupKey] || []).includes(f.key));

  const clone = v =>JSON.parse(JSON.stringify(v));

  function load() {
    let groups = null;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) groups = JSON.parse(raw);
    } catch (e) { /* 저장소 사용 불가 시 기본값 */ }
    groups = groups || clone(DEFAULTS);
    // 탭 이름(label)은 관리자가 바꾸는 값이 아니므로 항상 기본값 사용 (예전 이름 '구분/유형/등급'으로 저장된 데이터 보정)
    groups.forEach(g => { const d = DEFAULTS.find(x => x.key === g.key); if (d) g.label = d.label; });
    // 저장된 데이터 보정 (기존 수정 내용은 유지)
    // - 종류(subs) 도입 전 데이터: 기본값으로 채움
    // - 이전 샘플 목록을 그대로 쓰고 있으면 새 샘플 목록으로 교체 (관리자가 수정한 목록은 그대로 둠)
    const OLD_SAMPLE = '학교|유치원|도서관|기업|공공기관|학원|기타 단체';
    const cat = groups.find(g => g.key === 'category');
    const defCat = DEFAULTS.find(g => g.key === 'category');
    if (cat) cat.items.forEach(it => {
      const def = defCat.items.find(d => d.code === it.code);
      if (!Array.isArray(it.subs) || it.subs.join('|') === OLD_SAMPLE) it.subs = def ? def.subs.slice() : [];
    });
    // - 등급 설명에 산정 조건(구매 횟수)을 적어 둔 예전 샘플 문구는 새 샘플 문구로 교체
    //   (산정 조건은 회원 상세에서 평가 조건·기준값으로 따로 표시하므로 설명과 어긋나지 않게 함. 관리자가 고친 설명은 그대로 둠)
    const OLD_GRADE_DESC = { starter: '평가 기간 내 구매 1회 이상.', holic: '평가 기간 내 구매 5회 이상.', master: '평가 기간 내 구매 10회 이상.', 'master-vip': '평가 기간 내 구매 20회 이상.' };
    const grade = groups.find(g => g.key === 'grade');
    const defGrade = DEFAULTS.find(g => g.key === 'grade');
    if (grade) grade.items.forEach(it => {
      const def = defGrade.items.find(d => d.code === it.code);
      if (def && it.desc === OLD_GRADE_DESC[it.code]) it.desc = def.desc;
    });
    return groups;
  }

  // ===== 구분 참조 =====
  // 구분명은 중복될 수 있으므로 회원·단체 신청은 구분을 code로 참조한다.
  //   회원: categoryCode(기준) + category(표시용 이름, 화면 로드 시 code로 갱신)
  //   신청: assignCategoryCode(승인 시 지정한 구분), expireToCode(만료 후 전환 구분)
  // code가 없는 예전 데이터는 이름(또는 바뀌기 전 이름 aliases)으로 code를 찾아 채운다.
  // TODO: 실서비스에서는 서버가 구분 ID로 저장·조회
  const CATEGORY_NAME_MAX = 20;
  const PROTECTED_CATEGORIES = ['normal', 'group'];   // 시스템이 사용하는 기본 구분 (삭제 불가, 숨김·이름 변경은 가능)

  const categoryItems = groups => ((groups || load()).find(g => g.key === 'category') || { items: [] }).items;

  // 구분 → 종류 목록. 회원 정보 화면 등에서 선택지로 사용
  // 반환: [{ code, name, label, subs: [...], hidden }]
  //   label = 선택지 표시명. 같은 이름이 여러 개면 '단체 (2)'처럼 순번을 붙여 구별
  //   hidden = 구분 목록에서 '숨김'으로 설정 (새로 고르는 선택지에서 제외)
  const categoryTree = groups => {
    const items = categoryItems(groups);
    return items.map(it => {
      const same = items.filter(x => x.name === it.name);
      return {
        code: it.code, name: it.name, subs: (it.subs || []).slice(), hidden: !!it.hidden,
        label: same.length > 1 ? `${it.name} (${same.indexOf(it) + 1})` : it.name
      };
    });
  };

  // code → 현재 구분명 / 구분 항목
  const categoryByCode = (code, groups) => categoryItems(groups).find(x => x.code === code) || null;
  const categoryName = (code, groups) => { const it = categoryByCode(code, groups); return it ? it.name : ''; };

  // 이름(현재 또는 바뀌기 전 이름) → code. 같은 이름이 여럿이면 목록의 첫 번째. 없으면 ''
  const codeByName = (name, groups) => {
    if (!name) return '';
    const items = categoryItems(groups);
    const hit = items.find(x => x.name === name) || items.find(x => (x.aliases || []).includes(name));
    return hit ? hit.code : '';
  };

  // 회원·단체 신청의 구분 참조 정리 (각 화면에서 데이터 로드 직후 1회 호출)
  // code가 있으면 그 구분의 현재 이름으로 표시명을 갱신, 없으면 이름으로 code를 찾아 채움
  // 삭제된 구분은 code·이름을 그대로 둠 (화면에서 '(삭제됨)' 표시)
  function normalizeCategoryRefs(data, groups) {
    const g = groups || load();
    const fix = (obj, codeKey, nameKey) => {
      if (!obj[codeKey] && obj[nameKey]) obj[codeKey] = codeByName(obj[nameKey], g);
      const it = obj[codeKey] && categoryByCode(obj[codeKey], g);
      if (it) obj[nameKey] = it.name;
    };
    (data.members || []).forEach(m => fix(m, 'categoryCode', 'category'));
    (data.applications || []).forEach(a => {
      if (a.reqCategoryCode) fix(a, 'reqCategoryCode', 'reqCategory');
      if (a.expireTo) fix(a, 'expireToCode', 'expireTo');
      if (a.assignCategoryCode) fix(a, 'assignCategoryCode', 'assignCategory');
    });
  }

  // 구분명 검증 (중복 이름 허용). 반환: 오류 메시지 또는 ''
  function checkCategoryName(name) {
    const v = String(name).trim();
    if (!v) return '회원구분명을 입력하세요.';
    if (v.length > CATEGORY_NAME_MAX) return `회원구분명은 ${CATEGORY_NAME_MAX}자 이내로 입력하세요.`;
    return '';
  }

  // 종류 입력값 검증 (한 번에 하나만, 같은 구분 안에서 중복 불가). 반환: 오류 메시지 또는 ''
  const SUB_MAX = 20;
  const checkSub = (value, list) => {
    const v = String(value).trim();
    if (!v) return '종류를 입력하세요.';
    if (/[,\n]/.test(v)) return '종류는 한 번에 하나만 입력하세요.';
    if (v.length > SUB_MAX) return `종류는 ${SUB_MAX}자 이내로 입력하세요.`;
    if ((list || []).includes(v)) return `이미 등록된 종류입니다: ${v}`;
    return '';
  };

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

  // 주기 선택 UI(매일/매주/매월 + 요일/일자)는 등급 혜택 지급 주기와 등급 평가 산정 주기에서 공통 사용
  const cycleSelectsHtml = (p, cycles) => `
    <select id="${p}Cycle">${cycles.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>
    <select id="${p}Weekday" hidden>${WEEKDAYS.map((d, i) => `<option value="${i}">${d}요일</option>`).join('')}</select>
    <select id="${p}MonthDay" hidden>${Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}">${i + 1}일</option>`).join('')}<option value="last">말일</option></select>`;
  const syncCycleSelects = p => {
    const cycle = document.getElementById(p + 'Cycle').value;
    document.getElementById(p + 'Weekday').hidden = cycle !== 'weekly';
    document.getElementById(p + 'MonthDay').hidden = cycle !== 'monthly';
  };
  const fillCycleSelects = (p, b) => {
    document.getElementById(p + 'Cycle').value = b.cycle;
    document.getElementById(p + 'Weekday').value = String(b.weekday);
    document.getElementById(p + 'MonthDay').value = String(b.monthDay);
  };
  const readCycleSelects = p => {
    const md = document.getElementById(p + 'MonthDay').value;
    return {
      cycle: document.getElementById(p + 'Cycle').value,
      weekday: Number(document.getElementById(p + 'Weekday').value),
      monthDay: md === 'last' ? 'last' : Number(md)
    };
  };
  function cycleText(b) {
    if (b.cycle === 'daily') return '매일';
    if (b.cycle === 'weekly') return `매주 ${WEEKDAYS[b.weekday]}요일`;
    if (b.cycle === 'monthly') return b.monthDay === 'last' ? '매월 말일' : `매월 ${b.monthDay}일`;
    return '지급 안 함';
  }

  const GradeBenefit = {
    empty: emptyBenefit,

    // form-table에 들어갈 <tr> 묶음. prefix로 id를 구분해 한 페이지에 여러 번 써도 충돌 없음
    formHtml(p) {
      return `
        <tr><th>지급 주기</th><td>
          <div class="inline-row">
            ${cycleSelectsHtml(p, CYCLES)}
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
        syncCycleSelects(p);
        $('Mileage').disabled = !$('MileageOn').checked;
        $('DiscountRate').disabled = !$('DiscountOn').checked;
      };
      ['Cycle', 'MileageOn', 'DiscountOn'].forEach(id => $(id).addEventListener('change', sync));
      this._sync = this._sync || {};
      this._sync[p] = sync;
    },

    fill(p, b) {
      const $ = id => document.getElementById(p + id);
      fillCycleSelects(p, b);
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
      const b = Object.assign(readCycleSelects(p), {
        coupons: [...document.querySelectorAll(`input[name=${p}Coupon]:checked`)].map(cb => cb.value),
        mileageOn: $('MileageOn').checked,
        mileage: 0,
        discountOn: $('DiscountOn').checked,
        discountRate: 0
      });
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

    cycleText,
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

  // ===== 회원 등급 평가 조건 (등급 탭 공통 설정) =====
  // 자동 등급 설정 사용 시 산정 주기마다 평가 기간의 주문 실적을 평가 기준으로 집계해 등급을 재산정
  // TODO: 실서비스에서는 GET/PUT /api/admin/member-grades/policy 로 대체
  const POLICY_CYCLES = [['daily', '매일'], ['weekly', '매주'], ['monthly', '매월']];
  const BASES = [['amount', '주문금액'], ['count', '주문횟수'], ['both', '주문횟수+주문금액']];
  const PERIODS = [['daily', '매일 (전일 주문)'], ['weekly', '매주 (최근 1주)'], ['monthly', '매월 (최근 1개월)'], ['range', '특정 기간']];
  const labelOf = (list, v) => (list.find(x => x[0] === v) || [v, v])[1];

  const GradePolicy = {
    empty: emptyPolicy,
    BASES,

    formHtml(p) {
      return `
        <tr><th>자동 등급 설정</th><td>
          <label><input type="radio" name="${p}Auto" value="Y"> 사용</label>
          <label style="margin-left:12px"><input type="radio" name="${p}Auto" value="N"> 미사용</label>
          <span class="readonly" style="margin-left:8px">미사용 시 등급을 자동으로 재산정하지 않습니다.</span>
        </td></tr>
        <tr><th>산정 주기</th><td>
          <div class="inline-row">
            ${cycleSelectsHtml(p, POLICY_CYCLES)}
            <span class="readonly">산정일 00:00 자동 산정</span>
          </div>
        </td></tr>
        <tr><th>평가 기준</th><td>
          ${BASES.map(([v, t], i) => `<label${i ? ' style="margin-left:12px"' : ''}><input type="radio" name="${p}Basis" value="${v}"> ${t}</label>`).join('')}
          <span class="readonly" style="margin-left:8px">등급별 기준값은 각 등급 상세에서 설정</span>
        </td></tr>
        <tr><th>평가 기간</th><td>
          <div class="inline-row">
            <select id="${p}Period">${PERIODS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>
            <span class="inline-row" id="${p}Range" hidden>
              <input type="date" id="${p}From" style="width:150px"> ~ <input type="date" id="${p}To" style="width:150px">
            </span>
            <span class="readonly">기간 내 총 주문금액·주문횟수로 평가</span>
          </div>
          <div class="err" id="${p}PolicyErr"></div>
        </td></tr>`;
    },

    bind(p) {
      const $ = id => document.getElementById(p + id);
      const sync = () => {
        syncCycleSelects(p);
        $('Range').hidden = $('Period').value !== 'range';
        const autoEl = document.querySelector(`input[name=${p}Auto]:checked`);
        const off = !!autoEl && autoEl.value === 'N';
        ['Cycle', 'Weekday', 'MonthDay', 'Period', 'From', 'To'].forEach(id => { $(id).disabled = off; });
        document.querySelectorAll(`input[name=${p}Basis]`).forEach(r => { r.disabled = off; });
      };
      ['Cycle', 'Period'].forEach(id => $(id).addEventListener('change', sync));
      document.querySelectorAll(`input[name=${p}Auto]`).forEach(r => r.addEventListener('change', sync));
      this._sync = this._sync || {};
      this._sync[p] = sync;
    },

    fill(p, pol) {
      const $ = id => document.getElementById(p + id);
      document.querySelector(`input[name=${p}Auto][value=${pol.auto ? 'Y' : 'N'}]`).checked = true;
      fillCycleSelects(p, pol);
      document.querySelector(`input[name=${p}Basis][value=${pol.basis}]`).checked = true;
      $('Period').value = pol.period;
      $('From').value = pol.from || '';
      $('To').value = pol.to || '';
      $('PolicyErr').classList.remove('show');
      if (this._sync && this._sync[p]) this._sync[p]();
    },

    read(p) {
      const $ = id => document.getElementById(p + id);
      const pol = Object.assign(emptyPolicy(), readCycleSelects(p), {
        auto: document.querySelector(`input[name=${p}Auto]:checked`).value === 'Y',
        basis: document.querySelector(`input[name=${p}Basis]:checked`).value,
        period: $('Period').value,
        from: $('From').value,
        to: $('To').value
      });
      let error = '';
      if (pol.period === 'range') {
        if (!pol.from || !pol.to) error = '특정 기간은 시작일과 종료일을 모두 선택하세요.';
        else if (pol.from > pol.to) error = '종료일은 시작일 이후여야 합니다.';
      } else { pol.from = ''; pol.to = ''; }
      $('PolicyErr').textContent = error;
      $('PolicyErr').classList.toggle('show', !!error);
      return error ? { error } : { value: pol };
    },

    basisText: pol => labelOf(BASES, pol.basis),
    periodText: pol => (pol.period === 'range' ? `${pol.from} ~ ${pol.to}` : labelOf(PERIODS, pol.period)),
    // 상세 화면 안내용 한 줄 요약
    summary(pol) {
      if (!pol.auto) return '자동 등급 설정 미사용';
      return `자동 등급 설정 사용 · 산정 주기 ${cycleText(pol)} · 평가 기준 ${labelOf(BASES, pol.basis)} · 평가 기간 ${this.periodText(pol)}`;
    }
  };

  // ===== 등급별 평가 기준값 (주문횟수/주문금액 하한) =====
  const GradeCriteria = {
    empty: emptyCriteria,
    usesCount: basis => basis !== 'amount',
    usesAmount: basis => basis !== 'count',

    // 평가 기준(basis)에 해당하는 값만 표시. 조건이 없으면 기본 등급
    text(c, basis) {
      const parts = [];
      if (this.usesCount(basis) && c.minCount > 0) parts.push(`주문 ${c.minCount.toLocaleString()}회 이상`);
      if (this.usesAmount(basis) && c.minAmount > 0) parts.push(`${c.minAmount.toLocaleString()}원 이상`);
      return parts.length ? parts.join(' · ') : '기본 등급';
    },

    // 주문횟수·주문금액 두 항목을 항상 표시하되, 현재 평가 기준(basis)에서 쓰지 않는 항목은 비활성화 (값은 보관)
    formHtml(p, basis) {
      const unused = '<span class="readonly">현재 평가 기준에서 사용하지 않음</span>';
      const row = (label, id, unit, on) => `
        <tr><th>${label}</th><td>
          <div class="inline-row">
            <input type="text" id="${p}${id}" inputmode="numeric" class="w-num"${on ? '' : ' disabled'}>
            <span${on ? '' : ' class="readonly"'}>${unit} 이상</span> ${on ? '' : unused}
          </div>
        </td></tr>`;
      return `
        ${row('주문횟수', 'MinCount', '회', this.usesCount(basis))}
        ${row('주문금액', 'MinAmount', '원', this.usesAmount(basis))}
        <tr><th></th><td>
          <span class="readonly">0 입력 시 조건 없음(기본 등급). 평가 기간 내 주문 실적이 기준값 이상이면 해당 등급으로 산정됩니다.</span>
          <div class="err" id="${p}CriteriaErr"></div>
        </td></tr>`;
    },

    fill(p, c) {
      const $ = id => document.getElementById(p + id);
      $('MinCount').value = c.minCount.toLocaleString();
      $('MinAmount').value = c.minAmount.toLocaleString();
      $('CriteriaErr').classList.remove('show');
    },

    read(p) {
      const $ = id => document.getElementById(p + id);
      const num = id => $(id).value.replace(/,/g, '').trim();
      const cText = num('MinCount'), aText = num('MinAmount');
      let error = '';
      if (!/^\d{1,5}$/.test(cText)) error = '주문횟수는 0~99,999 사이 정수로 입력하세요.';
      else if (!/^\d{1,10}$/.test(aText)) error = '주문금액은 0~9,999,999,999 사이 정수로 입력하세요.';
      $('CriteriaErr').textContent = error;
      $('CriteriaErr').classList.toggle('show', !!error);
      return error ? { error } : { value: { minCount: Number(cText), minAmount: Number(aText) } };
    },

    // 히스토리용: 현재 평가 기준과 무관하게 두 값 모두 비교
    diff(a, b) {
      const out = [];
      if (a.minCount !== b.minCount) out.push(`평가 기준(주문횟수) 변경: ${a.minCount.toLocaleString()}회 → ${b.minCount.toLocaleString()}회`);
      if (a.minAmount !== b.minAmount) out.push(`평가 기준(주문금액) 변경: ${a.minAmount.toLocaleString()}원 → ${b.minAmount.toLocaleString()}원`);
      return out;
    }
  };

  // ===== 등급 자동 산정 =====
  // 산정일 00:00마다 평가 기간의 주문 실적을 평가 기준으로 집계해 조건을 충족하는 가장 높은 등급으로 변경.
  // 프로토타입: 서버 배치 대신 화면을 열 때 산정 시점이 지났으면 실행하고, 결과는 localStorage(RUN_KEY)에 저장해 다음 로드에 반영.
  // 주문 실적 조회(statsFn)는 외부에서 주입 → 주문 리스트 구현 후 MemberData.orderStats만 교체하면 됨
  // TODO: 실서비스에서는 서버 배치가 처리하고 결과만 GET /api/admin/member-grades/runs 로 조회
  const RUN_KEY = 'stopbook.gradeRuns.v1';
  const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const midnight = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  function loadRun() {
    try { return Object.assign({ lastRunAt: '', members: {} }, JSON.parse(localStorage.getItem(RUN_KEY)) || {}); }
    catch (e) { return { lastRunAt: '', members: {} }; }
  }
  function saveRun(run) {
    try { localStorage.setItem(RUN_KEY, JSON.stringify(run)); return true; } catch (e) { return false; }
  }

  // 월 단위 산정일: monthDay('last' 가능)에 해당하는 해당 월의 날짜
  const monthRunDate = (y, mo, monthDay) => (monthDay === 'last' ? new Date(y, mo + 1, 0) : new Date(y, mo, monthDay));

  const GradeEvaluator = {
    // 평가 기간 (YYYY-MM-DD, 양끝 포함). 산정일 전일까지 집계
    periodRange(pol, now) {
      if (pol.period === 'range') return { from: pol.from, to: pol.to };
      const end = addDays(midnight(now), -1);
      let start = end;
      if (pol.period === 'weekly') start = addDays(end, -6);
      else if (pol.period === 'monthly') start = addDays(new Date(end.getFullYear(), end.getMonth() - 1, end.getDate()), 1);
      return { from: fmtDate(start), to: fmtDate(end) };
    },

    // now 이전(당일 포함) 가장 최근 산정 예정일 00:00
    lastScheduled(pol, now) {
      const today = midnight(now);
      if (pol.cycle === 'daily') return today;
      if (pol.cycle === 'weekly') {
        const wd = (today.getDay() + 6) % 7;   // WEEKDAYS 기준 월=0
        return addDays(today, -((wd - pol.weekday + 7) % 7));
      }
      for (let k = 0; k < 2; k++) {
        const d = monthRunDate(today.getFullYear(), today.getMonth() - k, pol.monthDay);
        if (d <= today) return d;
      }
      return today;
    },

    // 다음 산정 예정일 00:00 (화면 안내용)
    nextScheduled(pol, now) {
      const last = this.lastScheduled(pol, now);
      if (pol.cycle === 'daily') return addDays(last, 1);
      if (pol.cycle === 'weekly') return addDays(last, 7);
      return monthRunDate(last.getFullYear(), last.getMonth() + 1, pol.monthDay);
    },

    isDue(pol, lastRunAt, now) {
      return !!pol.auto && (!lastRunAt || new Date(lastRunAt.replace(' ', 'T')) < this.lastScheduled(pol, now));
    },

    // 등급별 기준값 충족 여부 (평가 기준에 해당하는 값만 비교)
    meets(c, stats, basis) {
      const okCount = stats.count >= c.minCount, okAmount = stats.amount >= c.minAmount;
      return basis === 'amount' ? okAmount : basis === 'count' ? okCount : okCount && okAmount;
    },

    // 조건이 있는 등급을 기준값이 높은 순으로 보고 처음 충족하는 등급, 없으면 기본 등급(조건 없는 등급)
    matchGrade(group, stats) {
      const basis = group.policy.basis;
      const hasCond = c => (GradeCriteria.usesCount(basis) && c.minCount > 0) || (GradeCriteria.usesAmount(basis) && c.minAmount > 0);
      const rank = c => (basis === 'amount' ? [c.minAmount, c.minCount] : [c.minCount, c.minAmount]);
      const ranked = group.items.filter(it => hasCond(it.criteria)).sort((a, b) => {
        const ra = rank(a.criteria), rb = rank(b.criteria);
        return (rb[0] - ra[0]) || (rb[1] - ra[1]);
      });
      const hit = ranked.find(it => this.meets(it.criteria, stats, basis));
      const base = group.items.find(it => !hasCond(it.criteria)) || group.items[0];
      return (hit || base).name;
    },

    // 저장된 산정 결과를 회원 목록에 반영 (샘플 회원 데이터는 매번 새로 생성되므로 로드 시마다 필요)
    applyStored(members) {
      const run = loadRun();
      members.forEach(m => {
        const r = run.members[m.no];
        if (!r) return;
        m.grade = r.grade;
        r.history.forEach(h => { if (!m.history.some(x => x.at === h.at && x.content === h.content)) m.history.push(h); });
      });
      return run;
    },

    // 산정 실행. force=false면 산정 예정일이 지났을 때만 실행. 반환: { ran, changes, range, run }
    run(members, group, statsFn, { now = new Date(), force = false } = {}) {
      const pol = Object.assign(emptyPolicy(), group.policy);
      const run = this.applyStored(members);
      if (!force && !this.isDue(pol, run.lastRunAt, now)) return { ran: false, changes: [], run };
      group.items.forEach(it => { it.criteria = Object.assign(emptyCriteria(), it.criteria); });

      const range = this.periodRange(pol, now);
      const at = fmtDateTime(now);
      const changes = [];
      members.forEach(m => {
        const stats = statsFn(m, range.from, range.to);
        const to = this.matchGrade(group, stats);
        if (to === m.grade) return;
        const content = `등급 자동 산정: ${m.grade} → ${to} (평가 기간 ${range.from} ~ ${range.to}, 주문 ${stats.count}회 · ${stats.amount.toLocaleString()}원)`;
        const h = { at, content, by: '시스템' };
        changes.push({ no: m.no, name: m.name, from: m.grade, to, stats });
        m.grade = to;
        m.history.push(h);
        const r = run.members[m.no] || (run.members[m.no] = { grade: to, history: [] });
        r.grade = to;
        r.history.push(h);
      });
      run.lastRunAt = at;
      run.lastRange = range;
      run.lastChanged = changes.length;
      saveRun(run);
      return { ran: true, changes, range, run };
    },

    lastRun: loadRun
  };

  // ===== 탈퇴회원 (탈퇴구분 + 탈퇴 사유) =====
  // 탈퇴구분: 처리 방식(actor)과 탈퇴 조건(cond)을 가짐. 탈퇴 사유는 하나의 탈퇴구분(type = 탈퇴구분 code)에 속함
  // 탈퇴 회원 관리(withdrawn.html)의 검색 선택지·사유 표시에 사용. 탈퇴 기록은 탈퇴 시점의 탈퇴구분명을 그대로 보관
  // hidden = 사용 안 함 (회원 탈퇴 화면·관리자 탈퇴 처리의 선택지에서 빠짐)
  // TODO: 실서비스에서는 GET/PUT /api/admin/withdraw-types, /api/admin/withdraw-reasons 로 대체
  const WD_KEY = 'stopbook.withdrawTypes.v1';
  const WD_ACTORS = [['member', '회원 신청'], ['system', '시스템 자동'], ['admin', '관리자 처리']];
  const WD_REASON_MODES = [['required', '필수'], ['optional', '선택'], ['auto', '자동 지정']];
  const WD_NAME_MAX = 20, WD_REASON_MAX = 30;

  // inactiveDays/noticeDays: 시스템 자동일 때만 사용 · memoRequired: 관리자 처리일 때만 사용
  // reasonMode: required(사유 선택 필수) / optional(선택 사항) / auto(사용 중인 첫 번째 사유를 자동 지정)
  // rejoinDays: 탈퇴 후 같은 아이디로 재가입할 수 없는 기간 (0 = 제한 없음)
  const emptyWdCond = () => ({ inactiveDays: 365, noticeDays: 30, reasonMode: 'required', multi: false, memoRequired: false, rejoinDays: 0 });
  const wdType = (code, name, actor, desc, cond) => ({ code, name, actor, desc, hidden: false, cond: Object.assign(emptyWdCond(), cond) });
  const wdReason = (code, name, type, desc, etcInput) => ({ code, name, type, desc, etcInput: !!etcInput, hidden: false });

  // 사유 code는 탈퇴 기록(reasonCodes)과 같은 값
  const WD_DEFAULTS = {
    types: [
      wdType('voluntary', '자진탈퇴', 'member', '회원이 마이페이지에서 직접 탈퇴를 신청합니다. 탈퇴 사유를 선택하고 의견을 남길 수 있습니다.',
        { reasonMode: 'required', multi: true, rejoinDays: 30 }),
      wdType('dormant', '장기미이용', 'system', '오랫동안 접속하지 않은 회원을 시스템이 자동으로 탈퇴 처리합니다. 처리 전에 이메일·알림톡으로 미리 안내합니다.',
        { inactiveDays: 365, noticeDays: 30, reasonMode: 'auto' }),
      wdType('forced', '강제탈퇴', 'admin', '약관 위반·부정 거래 등이 확인된 회원을 관리자가 탈퇴 처리합니다. 처리 근거를 메모로 남깁니다.',
        { reasonMode: 'required', memoRequired: true, rejoinDays: 180 })
    ],
    reasons: [
      wdReason('PRICE',    '가격이 비쌈',            'voluntary', '상품 가격이나 배송비가 부담되어 다른 업체를 이용하려는 경우.'),
      wdReason('NOUSE',    '더 이상 이용하지 않음',    'voluntary', '필요한 제작을 마쳐 더 이상 서비스를 이용할 계획이 없는 경우.'),
      wdReason('EDITOR',   '편집기 사용이 어려움',     'voluntary', '사진 배치·텍스트 입력 등 편집기 사용이 어렵거나 오류가 잦은 경우.'),
      wdReason('LEADTIME', '제작·배송 기간이 김',      'voluntary', '주문 후 제작·배송까지 걸리는 기간이 길어 원하는 날짜에 받기 어려운 경우.'),
      wdReason('QUALITY',  '인쇄 품질·색감 불만',      'voluntary', '인쇄 결과물의 화질·색감·제본 상태가 기대에 못 미친 경우.'),
      wdReason('PRODUCT',  '원하는 상품·옵션 없음',    'voluntary', '원하는 사이즈·용지·상품 종류가 없는 경우.'),
      wdReason('CS',       '상담·응대 불만',          'voluntary', '문의 답변이 늦거나 상담 응대에 만족하지 못한 경우.'),
      wdReason('PRIVACY',  '개인정보 보호',           'voluntary', '개인정보 유출이 걱정되어 계정을 정리하려는 경우.'),
      wdReason('OTHER',    '기타',                   'voluntary', '위 항목에 해당하지 않는 경우. 회원이 의견을 직접 입력합니다.', true),
      wdReason('DORMANT',  '장기 미접속',             'dormant',   '마지막 접속 후 설정한 기간 동안 이용하지 않아 자동 탈퇴된 경우.'),
      wdReason('ABUSE',    '부정 거래',              'forced',    '쿠폰·마일리지 부정 사용, 허위 주문 등 부정한 방법으로 거래한 경우.'),
      wdReason('TOS',      '이용약관 위반',           'forced',    '욕설·비방, 저작권 침해 등 이용약관을 반복해서 위반한 경우.'),
      wdReason('IDENTITY', '명의 도용',              'forced',    '타인의 명의나 정보로 가입한 사실이 확인된 경우.')
    ]
  };

  const WithdrawStore = {
    ACTORS: WD_ACTORS,
    REASON_MODES: WD_REASON_MODES,
    NAME_MAX: WD_NAME_MAX,
    REASON_MAX: WD_REASON_MAX,
    emptyCond: emptyWdCond,

    load() {
      let data = null;
      try { const raw = localStorage.getItem(WD_KEY); if (raw) data = JSON.parse(raw); } catch (e) { /* 저장소 사용 불가 시 기본값 */ }
      data = data && Array.isArray(data.types) && Array.isArray(data.reasons) ? data : clone(WD_DEFAULTS);
      data.types.forEach(t => { t.cond = Object.assign(emptyWdCond(), t.cond); });
      return data;
    },
    save(data) {
      try { localStorage.setItem(WD_KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
    },

    typeByCode: (data, code) => data.types.find(t => t.code === code) || null,
    actorText: actor => labelOf(WD_ACTORS, actor),

    // 목록 '탈퇴 조건' 열
    condText(t) {
      const c = t.cond;
      if (t.actor === 'system') return `미접속 ${c.inactiveDays.toLocaleString()}일 경과 · ${c.noticeDays ? `${c.noticeDays}일 전 안내` : '사전 안내 없음'}`;
      if (t.actor === 'admin') return `관리자 판단 · 처리 메모 ${c.memoRequired ? '필수' : '선택'}`;
      return '회원 본인 신청';
    },
    reasonModeText(c) {
      if (c.reasonMode === 'auto') return '자동 지정';
      return `${labelOf(WD_REASON_MODES, c.reasonMode)} · ${c.multi ? '복수 선택' : '1개 선택'}`;
    },
    rejoinText: c => (c.rejoinDays ? `${c.rejoinDays.toLocaleString()}일` : '제한 없음'),

    // 이름 검증. 반환: 오류 메시지 또는 ''
    checkTypeName(data, name, selfCode) {
      const v = String(name).trim();
      if (!v) return '탈퇴구분명을 입력하세요.';
      if (v.length > WD_NAME_MAX) return `탈퇴구분명은 ${WD_NAME_MAX}자 이내로 입력하세요.`;
      if (data.types.some(t => t.name === v && t.code !== selfCode)) return '이미 등록된 탈퇴구분명입니다.';
      return '';
    },
    // 탈퇴 사유는 같은 탈퇴구분 안에서만 중복 불가
    checkReasonName(data, name, typeCode, selfCode) {
      const v = String(name).trim();
      if (!v) return '탈퇴 사유를 입력하세요.';
      if (v.length > WD_REASON_MAX) return `탈퇴 사유는 ${WD_REASON_MAX}자 이내로 입력하세요.`;
      if (data.reasons.some(r => r.name === v && r.type === typeCode && r.code !== selfCode)) return '같은 탈퇴구분에 이미 등록된 사유입니다.';
      return '';
    }
  };

  window.MemberTypeStore = { load, save, FLAGS, flagsFor, categoryTree, checkSub,
    categoryName, categoryByCode, codeByName, normalizeCategoryRefs, checkCategoryName, PROTECTED_CATEGORIES, GradeBenefit, GradePolicy, GradeCriteria, GradeEvaluator, WithdrawStore };
  // 리스트 검색 기간 기본값: 최근 1개월 (오늘로부터 30일 전 ~ 오늘). 화면을 열 때와 초기화할 때 채움, 관리자가 바꿔 검색할 수 있음
  // 기준일 = 실제 오늘 날짜 (기간 빠른 선택 버튼도 같은 기준. 샘플 주문은 2026-10-01까지만 있음)
  const listToday = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  function setDefaultRange(fromId = 'sFrom', toId = 'sTo') {
    const today = listToday();
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30);
    const f = document.getElementById(fromId), t = document.getElementById(toId);
    if (f) f.value = fmtDate(from);
    if (t) t.value = fmtDate(today);
    // 기간 빠른 선택 버튼이 있으면 '1개월' 표시
    document.querySelectorAll('[data-days]').forEach(b => b.classList.toggle('btn-adjust', b.dataset.days === '30'));
  }

  window.AdminUtil = { fmtDateTime, esc, toast, initSidebar, setDefaultRange, listToday, ADMIN_NAME: '관리자' };  // TODO: 로그인 관리자명

  // 상단바 프로토타입 버전 표시. 버전을 올릴 때는 여기만 바꾸면 모든 화면에 반영됨 (HTML의 같은 문구는 스크립트 실패 시 대비용)
  const PROTO_VERSION = '프로토타입 v2.19 (2026-10-08)';
  document.querySelectorAll('[data-proto-version]').forEach(el => { el.textContent = PROTO_VERSION; });
})();

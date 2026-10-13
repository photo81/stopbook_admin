// 마일리지 지급 유형 (혜택 > 혜택관리 > 마일리지 유형 관리)
//   자동으로 마일리지를 지급하는 규칙: 유형 이름 · 대상 · 조건(언제 지급) · 마일리지 금액(정액 P / 정률 %, 최대 지급) · 기간(상시/기간 지정) · 적용 여부 · 설명
//   지급은 시스템이 조건이 맞을 때 자동으로 처리하고, 지급 기록은 혜택내역 > 마일리지 내역에 '자동'으로 남음
// TODO: 실서비스에서는 GET/POST/PUT/DELETE /api/admin/benefits/mileage-types (지급 처리는 서버 배치·이벤트)
(function () {
  'use strict';
  const KEY = 'stopbook.mileageTypes.v1';
  const pad = n => String(n).padStart(2, '0');
  const nowText = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const today = () => nowText().slice(0, 10);

  const TARGETS = ['전체 회원', '신규 가입 회원', '일반 회원', '단체 회원', '생일 회원'];
  // 조건: 지급 시점. purchase = 결제금액 기준(정률·최소 결제금액을 쓸 수 있음)
  const CONDITIONS = [
    { key: '회원가입 완료', purchase: false }, { key: '구매 확정', purchase: true }, { key: '첫 구매 확정', purchase: true },
    { key: '텍스트 리뷰 작성', purchase: false }, { key: '포토 리뷰 작성', purchase: false }, { key: '생일 당월 1일', purchase: false },
    { key: '앱 첫 로그인', purchase: false }, { key: '친구 추천 가입', purchase: false }
  ];
  const isPurchase = c => !!(CONDITIONS.find(x => x.key === c) || {}).purchase;

  const T = (id, name, target, condition, method, amount, extra) => Object.assign({ id, name, target, condition, method, amount, maxAmount: 0, minOrder: 0, startAt: '', endAt: '', use: true, desc: '', updatedAt: '', updatedBy: '' }, extra || {});
  const DEFAULTS = [
    T('mt1', '회원가입 적립', '신규 가입 회원', '회원가입 완료', 'fixed', 2000, { desc: '가입 즉시 지급' }),
    T('mt2', '구매 확정 적립', '전체 회원', '구매 확정', 'rate', 1, { maxAmount: 5000, desc: '결제금액의 1% (최대 5,000P), 배송 완료 7일 뒤 자동 구매 확정 시 지급' }),
    T('mt3', '단체 회원 추가 적립', '단체 회원', '구매 확정', 'rate', 2, { maxAmount: 20000, minOrder: 100000, desc: '단체 회원 10만 원 이상 주문 시 2% 추가 적립' }),
    T('mt4', '첫 구매 적립', '전체 회원', '첫 구매 확정', 'fixed', 3000, { desc: '첫 주문 구매 확정 시 1회 지급' }),
    T('mt5', '텍스트 리뷰 적립', '전체 회원', '텍스트 리뷰 작성', 'fixed', 100, { desc: '20자 이상 리뷰, 상품당 1회' }),
    T('mt6', '포토 리뷰 적립', '전체 회원', '포토 리뷰 작성', 'fixed', 500, { desc: '사진 1장 이상 리뷰, 상품당 1회' }),
    T('mt7', '생일 축하 적립', '생일 회원', '생일 당월 1일', 'fixed', 1000, { desc: '생일이 있는 달 1일 오전 자동 지급' }),
    T('mt8', '가을 포토북 이벤트', '전체 회원', '구매 확정', 'rate', 3, { maxAmount: 10000, minOrder: 30000, startAt: '2026-10-01', endAt: '2026-10-31', desc: '10월 한 달 3만 원 이상 구매 시 3% 추가 적립' }),
    T('mt9', '앱 첫 로그인 적립', '전체 회원', '앱 첫 로그인', 'fixed', 500, { use: false, desc: '앱 출시 후 적용 예정' }),
    T('mt10', '여름 이벤트 적립', '전체 회원', '구매 확정', 'fixed', 1000, { startAt: '2026-07-01', endAt: '2026-08-31', desc: '여름 시즌 이벤트 (종료)' })
  ];
  let types;
  try { types = JSON.parse(localStorage.getItem(KEY)); } catch (e) { types = null; }
  if (!Array.isArray(types)) types = JSON.parse(JSON.stringify(DEFAULTS));
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(types)); return true; } catch (e) { return false; } };

  // 상태: 미적용 / 예정(시작 전) / 종료(끝난 뒤) / 적용 중
  const statusOf = t => (!t.use ? '미적용' : t.startAt && t.startAt > today() ? '예정' : t.endAt && t.endAt < today() ? '종료' : '적용 중');
  const amountText = t => (t.method === 'rate' ? `${t.amount}%${t.maxAmount ? ` (최대 ${t.maxAmount.toLocaleString()}P)` : ''}` : `${t.amount.toLocaleString()}P`);
  const conditionText = t => `${t.condition}${t.minOrder ? ` · ${t.minOrder.toLocaleString()}원 이상` : ''}`;
  const periodText = t => (t.startAt || t.endAt ? `${t.startAt || '처음'} ~ ${t.endAt || '계속'}` : '상시');

  const list = () => types.map(t => Object.assign({}, t));
  const find = id => list().find(t => t.id === id) || null;
  const num = v => Number(String(v ?? '').replace(/,/g, '').trim());
  // 등록·수정 (x.id 있으면 수정). 반환: 오류 문구 또는 ''
  function saveType(x, by) {
    const name = String(x.name || '').trim().replace(/\s+/g, ' ');
    if (!name) return '유형 이름을 입력해 주세요.';
    if (types.some(t => t.name === name && t.id !== x.id)) return '같은 이름의 유형이 있습니다.';
    if (!TARGETS.includes(x.target)) return '대상을 선택해 주세요.';
    if (!CONDITIONS.some(c => c.key === x.condition)) return '조건을 선택해 주세요.';
    const method = x.method === 'rate' && isPurchase(x.condition) ? 'rate' : 'fixed';
    const amount = num(x.amount), maxAmount = x.maxAmount === '' ? 0 : num(x.maxAmount), minOrder = x.minOrder === '' ? 0 : num(x.minOrder);
    if (!Number.isFinite(amount) || amount <= 0) return '마일리지 금액을 0보다 큰 숫자로 입력해 주세요.';
    if (method === 'fixed' && !Number.isInteger(amount)) return '정액 마일리지는 정수(P)로 입력해 주세요.';
    if (method === 'rate' && amount > 100) return '정률은 100% 이하로 입력해 주세요.';
    if (!Number.isFinite(maxAmount) || maxAmount < 0 || !Number.isFinite(minOrder) || minOrder < 0) return '최대 지급·최소 결제금액은 0 이상의 숫자로 입력해 주세요.';
    if (x.startAt && x.endAt && x.startAt > x.endAt) return '기간 종료일이 시작일보다 늦어야 합니다.';
    const fields = { name, target: x.target, condition: x.condition, method, amount, maxAmount: method === 'rate' ? maxAmount : 0, minOrder: isPurchase(x.condition) ? minOrder : 0,
      startAt: x.startAt || '', endAt: x.endAt || '', use: x.use !== false, desc: String(x.desc || '').trim(), updatedAt: nowText(), updatedBy: by || '' };
    const cur = x.id && types.find(t => t.id === x.id);
    if (cur) Object.assign(cur, fields); else types.push(Object.assign({ id: `mt${Date.now().toString(36)}` }, fields));
    save();
    return '';
  }
  const setUse = (id, use, by) => { const t = types.find(x => x.id === id); if (t) { Object.assign(t, { use: !!use, updatedAt: nowText(), updatedBy: by || '' }); save(); } };
  const deleteType = id => { types = types.filter(t => t.id !== id); save(); };

  window.MileageTypes = { TARGETS, CONDITIONS, isPurchase, statusOf, amountText, conditionText, periodText, list, find, saveType, setUse, deleteType };
})();

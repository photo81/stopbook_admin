// 관리자 공지 데이터 (게시판관리 > 관리자 공지 / 대시보드 상단 관리자 공지)
// member-type-store.js(AdminUtil) 다음에 로드
//   관리자끼리 공유하는 공지. 구분(중요/공지) · 카테고리 · 제목 · 내용 · 작성자 · 작성일시
//   카테고리 기본값: 상품 · 공정 · 마케팅 · 운영 · 고객관리 · 기타. 공지 입력 시 새 카테고리를 직접 넣으면 목록에 추가됨
//   프로토타입: 기본 공지(샘플)를 처음 한 번 저장소에 넣고, 이후 등록·수정·삭제는 localStorage에 반영
// TODO: 실서비스에서는 GET/POST/PUT/DELETE /api/admin/notices, GET/POST /api/admin/notice-categories
(function () {
  'use strict';
  const KEY = 'stopbook.adminNotices.v2';
  const CAT_KEY = 'stopbook.adminNoticeCategories.v1';
  const TYPES = ['중요', '공지'];
  const DEFAULT_CATEGORIES = ['상품', '공정', '마케팅', '운영', '고객관리', '기타'];
  const pad = n => String(n).padStart(2, '0');
  const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const nowText = () => { const d = new Date(); return `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const today = () => fmtDate(new Date());
  // 게시 기한: 대시보드에 보여주는 기간. 기본값 = 오늘부터 1개월 (입력 시 수정 가능)
  const addMonths = (dateStr, n) => { const d = new Date(dateStr); d.setMonth(d.getMonth() + n); return fmtDate(d); };
  const defaultPeriod = () => ({ showFrom: today(), showTo: addMonths(today(), 1) });

  const SAMPLES = [
    { id: 's1', type: '중요', category: '공정', title: '10/9(한글날) 택배 집하 휴무', body: '10/8 오후 출고분까지 당일 집하되고, 10/9 출고분은 10/10에 집하됩니다.\n배송 문의가 오면 1일 지연을 안내해 주세요. 퀵서비스는 정상 운영합니다.', by: '운영팀', at: '2026-10-07 09:10', showFrom: '2026-10-07', showTo: '2026-10-12' },
    { id: 's2', type: '중요', category: '상품', title: '랑데부 190g 용지 단종', body: '포토북 내지 옵션 중 랑데부 190g가 10/15부터 단종됩니다.\n기존 주문은 재고분으로 제작하고, 이후 주문은 몽블랑 190g로 자동 대체됩니다. 상품 사양 변경 안내를 참고해 주세요.', by: '상품팀', at: '2026-10-06 14:00', showFrom: '2026-10-06', showTo: '2026-11-06' },
    { id: 's3', type: '공지', category: '고객관리', title: '후결제 주문 입금 확인 방법 변경', body: '후결제 주문은 후결제 주문 리스트 > 입금관리에서 입금일시·결제수단·입금액을 등록합니다.\n분할 입금은 회차별로 등록하고, 전액이 들어오면 결제완료로 바뀝니다.', by: '운영팀', at: '2026-10-02 14:20', showFrom: '2026-10-02', showTo: '2026-11-02' },
    { id: 's4', type: '공지', category: '마케팅', title: '가을 포토북 10% 할인 이벤트 (10/13~10/31)', body: '10/13부터 전 포토북 10% 할인 이벤트가 시작됩니다. 광고성 메시지는 수신 동의 회원에게만 발송해 주세요.\n이벤트 문의는 마케팅팀으로 전달 바랍니다.', by: '마케팅팀', at: '2026-10-01 11:30', showFrom: '2026-10-01', showTo: '2026-10-31' },
    { id: 's5', type: '공지', category: '운영', title: '단체회원 승인 시 적용 기간 확인', body: '적용 기간 종료일이 지나면 자동으로 일반 회원으로 전환됩니다.\n연장 요청은 회원 상세에서 기간을 수정해 주세요.', by: '회원팀', at: '2026-09-25 11:00', showFrom: '2026-09-25', showTo: '2026-10-25' }
  ];
  // 게시 상태: 게시 중 / 게시 예정 / 게시 종료 (기한 없는 예전 데이터는 게시 중으로 봄)
  const periodState = n => { const t = today(); if (!n.showFrom && !n.showTo) return '게시 중'; if (n.showFrom && t < n.showFrom) return '게시 예정'; if (n.showTo && t > n.showTo) return '게시 종료'; return '게시 중'; };
  const isActive = n => periodState(n) === '게시 중';

  const read = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key)); return v === null || v === undefined ? fallback : v; } catch (e) { return fallback; } };
  const write = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch (e) { return false; } };

  // 공지 목록: 저장소가 비어 있으면 샘플을 넣어 시작 (그 뒤로는 저장소가 기준). 정렬: 중요 → 최신순
  function list() {
    let items = read(KEY, null);
    if (!Array.isArray(items)) { items = SAMPLES.map(n => Object.assign({}, n)); write(KEY, items); }
    return items.slice().sort((a, b) => ((b.type === '중요') - (a.type === '중요')) || b.at.localeCompare(a.at));
  }
  const find = id => list().find(n => n.id === id) || null;
  // 등록(id 없음)·수정(id 있음). notice = { type, category, title, body, by }. 반환: 저장 성공 여부
  function save(notice) {
    const items = read(KEY, null) || SAMPLES.map(n => Object.assign({}, n));
    if (notice.id) {
      const i = items.findIndex(n => n.id === notice.id);
      if (i < 0) return false;
      items[i] = Object.assign(items[i], notice, { updatedAt: nowText() });
    } else {
      items.push(Object.assign({ id: 'n' + Date.now().toString(36), at: nowText() }, notice));
    }
    addCategory(notice.category);
    return write(KEY, items);
  }
  function remove(id) {
    const items = (read(KEY, null) || []).filter(n => n.id !== id);
    return write(KEY, items);
  }
  // 카테고리: 기본 + 관리자가 추가한 것 (공지 입력 시 직접 입력하면 추가됨)
  const categories = () => [...new Set([...DEFAULT_CATEGORIES, ...read(CAT_KEY, [])])];
  function addCategory(name) {
    const v = String(name || '').trim();
    if (!v || DEFAULT_CATEGORIES.includes(v)) return true;
    const extra = read(CAT_KEY, []);
    if (extra.includes(v)) return true;
    extra.push(v);
    return write(CAT_KEY, extra);
  }
  const firstLine = body => String(body || '').split('\n').map(s => s.trim()).filter(Boolean)[0] || '';
  // 대시보드에 보이는 공지: 게시 기한 안에 있는 것만
  const visible = () => list().filter(isActive);

  window.NoticeStore = { TYPES, DEFAULT_CATEGORIES, list, visible, find, save, remove, categories, addCategory, firstLine, defaultPeriod, periodState, isActive };
})();

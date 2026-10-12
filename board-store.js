// 게시판 설정 (게시판관리 > 게시판 통합 관리)
//   쇼핑몰이 쓰는 게시판 전체를 관리. 게시판은 코드로 식별하고 유형을 가짐
//     유형: 기본형(관리자가 쓰고 고객이 읽음: 공지·가이드·보도자료) / 상품리뷰(구매 상품에 후기, 상품 연동) / 1:1 문의형(비공개 문의 → 관리자 답변)
//     말머리: 게시판별 글 분류 (예: 공지사항 · 이벤트), 연동: 상품 / 연동 없음, 읽기·쓰기 권한, 쇼핑몰 노출 여부
//   기본 게시판(공지사항·이용후기·1:1 문의·FAQ)은 관리 화면이 따로 있어 삭제할 수 없음
//   게시물 수·신규 게시물 수: 1:1 문의는 실제 문의 데이터(inquiry-data.js: 전체 / 대기), 나머지는 샘플 값
//   게시판을 등록하면 사이드 메뉴 게시글관리에 바로 생기고(member-type-store.js injectBoardMenu), 게시글은 board-posts.html?board=코드에서 관리
//   모든 화면에서 member-type-store.js보다 먼저 로드 (사이드 메뉴를 그리기 전에 게시판 목록이 있어야 함)
// TODO: 실서비스에서는 GET/POST/PUT/DELETE /api/admin/boards, /api/admin/boards/{code}/posts
(function () {
  'use strict';
  const KEY = 'stopbook.boards.v1';
  const pad = n => String(n).padStart(2, '0');
  const nowText = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  const TYPES = [
    { key: '기본형', desc: '관리자가 글을 올리고 고객이 읽는 게시판 (공지사항·가이드·보도자료)' },
    { key: '상품리뷰', desc: '고객이 구매한 상품에 후기를 남기는 게시판 (상품과 연동)' },
    { key: '1:1 문의형', desc: '고객이 비공개로 문의하고 관리자가 답변하는 게시판 (문의 유형은 1:1 문의 설정에서 관리)' }
  ];
  const LINKS = ['연동 없음', '상품'];
  const PERMS = ['전체', '회원', '관리자'];
  // 유형별 기본 권한·연동
  const TYPE_DEFAULT = { '기본형': { read: '전체', write: '관리자', link: '연동 없음' }, '상품리뷰': { read: '전체', write: '회원', link: '상품' }, '1:1 문의형': { read: '회원', write: '회원', link: '연동 없음' } };

  const B = (no, code, type, name, heads, posts, fresh, extra) => Object.assign({ no, code, type, name, heads, posts, fresh, use: true, system: false, href: '' }, TYPE_DEFAULT[type], extra || {});
  const DEFAULTS = [
    B(1, 'notice', '기본형', '공지사항', ['공지사항', '이벤트'], 75, 0, { system: true, href: 'board-notice.html' }),
    B(2, 'qna', '1:1 문의형', '1:1 문의', [], 0, 0, { system: true, href: 'board-inquiry.html', live: 'inquiry' }),
    B(3, 'faq', '기본형', 'FAQ', ['주문/결제', '배송', '편집·제작', '회원'], 42, 0, { system: true, href: 'board-faq.html' }),
    B(4, 'product_review', '상품리뷰', '이용후기', [], 128, 3, { system: true, href: 'board-review.html' }),
    B(5, 'design_service', '1:1 문의형', '디자인 서비스', [], 248, 2),
    B(6, 'guide_order', '기본형', '가이드 - 주문 제작', ['그룹'], 10, 0),
    B(7, 'guide_printing', '기본형', '가이드 - 인쇄 가이드', ['그룹'], 39, 0),
    B(8, 'guide_making', '기본형', '가이드 - 제작 가이드', ['그룹'], 191, 1),
    B(9, 'guide_claim', '기본형', '가이드 - 불량 및 환불', ['그룹'], 8, 0),
    B(10, 'feedback', '1:1 문의형', '건의사항', [], 151, 0),
    B(11, 'press', '기본형', '보도자료', [], 1, 0, { use: false })
  ];

  let boards;
  try { boards = JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { boards = null; }
  if (!Array.isArray(boards)) boards = JSON.parse(JSON.stringify(DEFAULTS));
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(boards)); return true; } catch (e) { return false; } };

  // ===== 게시글 (게시글관리 > 각 게시판, board-posts.html) =====
  //   샘플 게시글(게시판의 샘플 게시물 수만큼, 게시판 코드로 고정) + 관리자가 쓴 게시글(localStorage)
  //   신규 = 최근 게시글 중 샘플 신규 게시물 수만큼 (1:1 문의형은 답변 대기)
  const POST_KEY = 'stopbook.boardPosts.v1';
  let saved;
  try { saved = JSON.parse(localStorage.getItem(POST_KEY)) || {}; } catch (e) { saved = {}; }
  const savePosts = () => { try { localStorage.setItem(POST_KEY, JSON.stringify(saved)); return true; } catch (e) { return false; } };
  const TITLES = {
    notice: ['추석 연휴 배송·고객센터 운영 안내', '10월 포토북 20% 할인 이벤트', '시스템 정기 점검 안내 (02:00~06:00)', '개인정보처리방침 개정 안내', '신상품 우드월캘린더 출시 기념 이벤트', '무통장입금 계좌 변경 안내', '회원 등급 혜택 개편 안내', '친구 추천 적립금 이벤트', '택배사 변경 안내', '연말 주문 마감 일정 안내'],
    design_service: ['졸업앨범 표지 디자인 의뢰합니다', '포토북 레이아웃 디자인 문의', '단체 캘린더 디자인 요청드립니다', '회사 로고 넣은 액자 디자인 가능할까요', '유치원 앨범 디자인 견적 문의', '청첩장 스타일 포토북 디자인', '돌잔치 포토북 디자인 의뢰'],
    guide_order: ['주문 전 확인해 주세요', '편집기 사용 방법', '사진 해상도 기준 안내', '주문 후 수정 가능 기간', '대량 주문 방법'],
    guide_printing: ['인쇄 색상(CMYK) 안내', '종이 종류별 특징', '코팅 옵션 비교', '재단선과 안전 영역', '흑백 인쇄 시 주의사항'],
    guide_making: ['포토북 제작 과정', '제본 방식 비교 (무선·PUR·레이플랫)', '캘린더 제작 기간', '액자 제작 과정', '하드커버 제작 기준'],
    guide_claim: ['불량 접수 기준', '재제작 처리 절차', '환불 기준과 기간', '배송 중 파손 시 처리', '단순 변심 반품 안내'],
    feedback: ['편집기에 템플릿이 더 있으면 좋겠어요', '모바일 편집 속도 개선 요청', '배송 조회 알림이 늦어요', '쿠폰 사용 조건을 쉽게 보여 주세요', '사진 자동 배치 기능 건의', '주문 내역 엑셀 다운로드 요청'],
    press: ['스탑북, 포토북 앱 리뉴얼 출시']
  };
  // 공지사항 샘플: 제목에 '이벤트'가 들어가면 말머리 이벤트, 최근 2건은 상단 고정
  const AUTHORS_ADMIN = ['김지영', '김태복', '창경훈', '최의담', '이고은'];
  const AUTHORS_CUSTOMER = ['김하늘', '이서준', '박도윤', '최유진', '정민준', '윤서아', '강지호', '한예린', '오시우', '임채원'];
  const BASE = new Date(2026, 9, 8, 18, 0);   // 샘플 기준일 (order-data.js TODAY와 같은 날)
  const pad2 = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sampleCache = {};
  function samplePosts(b) {
    if (b.live || !b.posts) return [];
    if (sampleCache[b.code]) return sampleCache[b.code];
    let x = [...b.code].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 233280, 17);
    const r = () => (x = (x * 9301 + 49297) % 233280) / 233280;
    const pool = TITLES[b.code] || ['안내드립니다', '이용 방법', '자주 묻는 내용 정리', '업데이트 소식'];
    const admin = b.write === '관리자';
    const notice = b.code === 'notice';
    let t = BASE.getTime();
    const list = Array.from({ length: b.posts }, (_, i) => {
      t -= (admin ? 72 : 9) * 3600000 * (0.3 + r());   // 관리자 게시판은 드문드문, 고객 게시판은 자주
      const n = Math.floor(i / pool.length), title = pool[i % pool.length] + (n ? ` (${n + 1})` : '');
      const head = notice ? (/이벤트/.test(title) && b.heads.includes('이벤트') ? '이벤트' : b.heads[0] || '') : (b.heads.length ? b.heads[i % b.heads.length] : '');
      return { id: `s${i + 1}`, no: b.posts - i, head, title,
        content: `<p>안녕하세요, 스탑북입니다.</p><p>${escHtml(title)} 내용을 안내드립니다.</p><p>자세한 내용은 고객센터(02-0000-0000)로 문의해 주세요. 감사합니다.</p>`,
        author: admin ? AUTHORS_ADMIN[i % AUTHORS_ADMIN.length] : AUTHORS_CUSTOMER[Math.floor(r() * AUTHORS_CUSTOMER.length)],
        at: fmt(new Date(t)), views: Math.floor(r() * (admin ? 900 : 120)), use: true, fresh: i < b.fresh, sample: true,
        pinned: notice && i < 2, startAt: '', endAt: '', files: [] };
    });
    return (sampleCache[b.code] = list);
  }
  // 게시판의 게시글 (최근 순): 관리자가 쓴 글 + 샘플 (관리자가 고친 샘플은 고친 내용, 지운 샘플은 뺌)
  //   saved[code] = 관리자가 쓴 글 + 샘플 수정본(sampleOf), saved[code + '#deleted'] = 지운 샘플 id
  const postsOf = code => {
    const b = boards.find(y => y.code === code);
    if (!b) return [];
    const mine = saved[code] || [], deleted = saved[`${code}#deleted`] || [];
    const own = mine.filter(p => !p.sampleOf).map(p => Object.assign({}, p, { files: (p.files || []).slice() }));
    const base = samplePosts(b).length;
    own.forEach((p, i) => { p.no = base + own.length - i; });
    const samples = samplePosts(b).filter(p => !deleted.includes(p.id)).map(p => {
      const ov = mine.find(o => o.sampleOf === p.id);
      return Object.assign({}, p, ov ? Object.assign({}, ov, { id: p.id, sample: true, edited: true }) : {}, { files: ((ov || p).files || []).slice() });
    });
    return own.concat(samples);
  };
  const textOf = html => String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim();
  // 관리자 글쓰기·수정. x.id 있으면 수정 (샘플이면 수정본으로 저장). x.extra = 게시판별 추가 항목 (공지사항: pinned·startAt·endAt·files). 반환: 오류 문구 또는 ''
  function savePost(code, x, by) {
    if (!boards.some(y => y.code === code)) return '게시판을 찾을 수 없습니다.';
    const title = clean(x.title);
    if (!title) return '제목을 입력해 주세요.';
    if (!textOf(x.content)) return '내용을 입력해 주세요.';
    const list = saved[code] || (saved[code] = []);
    const fields = Object.assign({ head: x.head || '', title, content: String(x.content).trim(), use: x.use !== false }, x.extra || {}, { updatedAt: nowText(), updatedBy: by || '' });
    const cur = x.id && list.find(p => p.id === x.id || p.sampleOf === x.id);
    if (cur) Object.assign(cur, fields);
    else if (x.id && /^s\d+$/.test(x.id)) list.push(Object.assign({ id: `e${x.id}`, sampleOf: x.id }, fields));
    else list.unshift(Object.assign({ id: `p${Date.now().toString(36)}`, author: by || '관리자', at: nowText(), views: 0, fresh: false }, fields));
    savePosts();
    return '';
  }
  function deletePost(code, id) {
    saved[code] = (saved[code] || []).filter(p => p.id !== id && p.sampleOf !== id);
    if (/^s\d+$/.test(id)) { const k = `${code}#deleted`; saved[k] = [...new Set((saved[k] || []).concat(id))]; }
    savePosts();
  }
  // 게시물 수 (1:1 문의는 실제 문의 데이터: 전체 / 신규 = 담당자 미지정 대기). 그 외 = 샘플 + 관리자가 쓴 글
  const countsOf = b => (b.live === 'inquiry' && window.InquiryData
    ? { posts: InquiryData.inquiries.length, fresh: InquiryData.newCount() }
    : { posts: b.posts + (saved[b.code] || []).filter(p => !p.sampleOf).length - (saved[b.code + '#deleted'] || []).length, fresh: b.fresh });
  const list = () => boards.map(b => Object.assign({}, b, { heads: b.heads.slice() }, countsOf(b)));
  const find = no => list().find(b => b.no === Number(no)) || null;
  const clean = s => String(s || '').trim().replace(/\s+/g, ' ');

  // 등록·수정. x.no 있으면 수정 (코드는 바꿀 수 없음). 반환: 오류 문구 또는 ''
  function saveBoard(x, by) {
    const name = clean(x.name), code = String(x.code || '').trim();
    if (!name) return '게시판명을 입력해 주세요.';
    if (!TYPES.some(t => t.key === x.type)) return '유형을 선택해 주세요.';
    const heads = [...new Set((x.heads || []).map(clean).filter(Boolean))];
    if (heads.some(h => h.length > 10)) return '말머리는 10자 이내로 입력해 주세요.';
    const link = x.type === '상품리뷰' ? '상품' : (LINKS.includes(x.link) ? x.link : '연동 없음');
    const fields = { name, type: x.type, heads, link, read: PERMS.includes(x.read) ? x.read : '전체', write: PERMS.includes(x.write) ? x.write : '관리자', use: x.use !== false, updatedAt: nowText(), updatedBy: by || '' };
    if (x.no) {
      const b = boards.find(y => y.no === Number(x.no));
      if (!b) return '게시판을 찾을 수 없습니다.';
      if (b.system && b.type !== x.type) return '기본 게시판은 유형을 바꿀 수 없습니다.';
      Object.assign(b, fields);
    } else {
      if (!/^[a-z][a-z0-9_]{1,29}$/.test(code)) return '코드는 영문 소문자로 시작하고 영문 소문자·숫자·밑줄(_)로 2~30자 입력해 주세요.';
      if (boards.some(b => b.code === code)) return '이미 쓰고 있는 코드입니다.';
      const no = boards.reduce((m, b) => Math.max(m, b.no), 0) + 1;
      boards.push(Object.assign({ no, code, posts: 0, fresh: 0, system: false, href: '', createdAt: nowText() }, fields));
    }
    save();
    return '';
  }
  function deleteBoard(no) {
    const b = boards.find(y => y.no === Number(no));
    if (!b) return '게시판을 찾을 수 없습니다.';
    if (b.system) return '기본 게시판은 삭제할 수 없습니다. 쇼핑몰 노출을 끄면 숨길 수 있습니다.';
    boards = boards.filter(y => y !== b);
    delete saved[b.code]; delete saved[b.code + '#deleted']; savePosts();
    save();
    return '';
  }
  const byCode = code => list().find(b => b.code === code) || null;

  window.BoardStore = { TYPES, LINKS, PERMS, TYPE_DEFAULT, list, find, byCode, saveBoard, deleteBoard, postsOf, savePost, deletePost };
})();

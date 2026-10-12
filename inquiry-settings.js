// 1:1 문의하기 설정 (게시판관리 > 1:1 문의 설정)
//   유형/태그: 쇼핑몰 1:1 문의하기에서 고객이 고르는 문의 유형(순서·사용 여부)과, 유형마다 관리자가 답변할 때 붙이는 태그
//   답변 데이터: AI 답변 생성 때 참고하는 상담 기준 (유형별·공통, 키워드로 문의와 연결)
//   답변 프롬프트: 1:1 문의 > AI 답변 생성에 쓰는 AI 모델과 형식 프롬프트
//   저장: localStorage 한 곳 (없으면 기본값). 1:1 문의(board-inquiry.html)·inquiry-data.js가 같은 값을 읽음
//   유형 이름을 바꾸면 예전 이름 → 새 이름을 기록해 두고, 예전 이름으로 접수된 문의도 새 이름으로 보여 줌
//   (유형·태그를 지워도 이미 분류된 문의의 값은 그대로 남음)
// TODO: 실서비스에서는 GET/PUT /api/admin/inquiry-settings (유형·태그·프롬프트), 프롬프트는 서버에서 AI 호출에 사용
(function () {
  'use strict';
  const KEY = 'stopbook.inquirySettings.v1';
  const pad = n => String(n).padStart(2, '0');
  const nowText = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  // AI 모델 (답변 초안 생성용). TODO: 실서비스에서 계약·연동한 모델 목록으로
  const MODELS = [
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', desc: '권장 · 품질과 속도의 균형' },
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', desc: '가장 정교한 답변 · 응답이 느리고 비용이 큼' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', desc: '가장 빠름 · 짧고 정형화된 답변' }
  ];
  // 형식 프롬프트에 쓸 수 있는 값 (AI 호출 때 문의 정보로 바뀜)
  const VARIABLES = ['{고객명}', '{문의유형}', '{문의제목}', '{주문번호}', '{주문상태}', '{담당자}'];
  const DEFAULT_PROMPT = [
    '당신은 포토북·캘린더·액자 제작 쇼핑몰 "스탑북" 고객센터 상담원입니다.',
    '고객의 1:1 문의에 대한 답변 초안을 아래 형식으로 작성하세요.',
    '',
    '[형식]',
    '- 첫 줄: "안녕하세요, {고객명} 고객님. 스탑북 고객센터입니다."',
    '- 문의하신 내용({문의제목})을 확인했다고 한 문장으로 말한 뒤, 처리 결과나 안내를 2~4문장으로 씁니다.',
    '- 주문과 연결된 문의는 주문번호({주문번호})와 현재 진행 상태({주문상태})를 함께 안내합니다.',
    '- 확인되지 않은 일정·금액·보상은 약속하지 않고, 확인 후 다시 안내드린다고 씁니다.',
    '- 마지막 줄: "추가로 궁금하신 점은 1:1 문의 또는 고객센터(02-0000-0000)로 연락 주세요. 감사합니다."',
    '',
    '[말투]',
    '- 존댓말, 짧고 쉬운 문장. 이모지와 과한 감탄사는 쓰지 않습니다.'
  ].join('\n');
  // 기본 유형·태그 (member-data.js 문의 샘플 유형과 같음)
  const DEFAULT_TYPES = [
    ['주문/결제', ['결제', '영수증', '주문취소', '긴급']],
    ['배송', ['배송조회', '배송지변경', '긴급']],
    ['상품', ['편집', '옵션문의']],
    ['교환/반품', ['인쇄불량', '파손', '재제작', '긴급']],
    ['회원정보', ['회원정보', '등급']],
    ['기타', ['단체견적', '제휴', '기타']]
  ].map(([name, tags], i) => ({ id: `t${i + 1}`, name, use: true, tags }));
  // 기본 답변 데이터: AI가 답변 초안을 쓸 때 참고하는 상담 기준 (유형별 + 공통). 키워드가 문의 제목·내용에 들어 있으면 참고 대상
  const COMMON = '공통';
  const DEFAULT_KNOWLEDGE = [
    ['주문/결제', '결제 수단 변경', '결제 수단, 변경, 무통장, 카드 결제로', '입금 전 주문은 결제 수단만 바꿀 수 없어, 주문을 취소한 뒤 원하시는 결제 수단으로 다시 주문해 주셔야 합니다. 제작 전이라 취소 수수료는 없으며, 편집한 작업물은 보관함에 그대로 남아 있습니다.'],
    ['주문/결제', '영수증·증빙 서류 발급', '영수증, 거래내역서, 경비, 증빙, 세금계산서', '카드 영수증은 마이페이지 > 주문 내역 > 주문 상세에서 바로 출력하실 수 있습니다. 거래내역서·세금계산서가 필요하시면 주문 상세의 서류 발급 신청을 이용해 주세요.'],
    ['주문/결제', '중복 결제(이중 승인)', '두 번, 이중, 중복, 승인 문자', '결제 대행사에 확인한 결과 중복 승인된 1건은 자동 취소되며, 카드사에 따라 취소가 반영되기까지 3~5영업일이 걸릴 수 있습니다.'],
    ['배송', '제작·배송 일정', '언제, 도착, 제작 중, 받을 수, 출고', '포토북은 주문 후 제작에 3~4영업일, 출고 후 배송에 1~2일이 걸립니다. 출고되면 알림톡으로 송장번호를 보내드립니다. 받으실 날짜가 정해져 있다면 남겨 주세요. 가능한 범위에서 우선 제작을 요청해 드리겠습니다.'],
    ['배송', '배송지 변경', '배송지, 주소, 이사, 새 주소', '출고 전이라면 배송지를 바로 바꿔 드릴 수 있습니다. 변경할 주소를 남겨 주시면 반영한 뒤 다시 안내드리겠습니다. 이미 출고된 경우에는 택배사를 통해 주소 변경을 요청해 드립니다.'],
    ['배송', '배송 완료인데 받지 못함', '분실, 받지 못, 배송 완료, 없습니다', '택배사에 배송 경로 확인을 요청했습니다. 확인 결과 분실로 판명되면 같은 상품을 다시 제작해 무상으로 보내드립니다.'],
    ['상품', '포토북 페이지 추가', '페이지, 추가, 최대', '포토북은 편집기에서 최대 100페이지까지 늘릴 수 있고, 2페이지마다 추가 금액이 붙습니다. 제작이 시작되기 전이라면 주문 후에도 편집 내용을 고칠 수 있습니다.'],
    ['상품', '캘린더 시작 월 변경', '캘린더, 시작 월, 시작으로, 3월', '제작이 시작되기 전이라면 편집기에서 시작 월을 바꾼 뒤 다시 저장해 주시면 그대로 제작됩니다. 제작이 시작된 뒤에는 변경이 어려워 다시 주문해 주셔야 합니다.'],
    ['상품', '액자 인쇄 영역', '액자, 사이즈, 잘리, 인쇄 영역', '액자는 테두리 안쪽 약 3mm가 가려집니다. 편집기의 점선 안쪽이 실제로 보이는 영역이니, 중요한 부분은 점선 안에 넣어 주세요.'],
    ['교환/반품', '인쇄·제본 불량 재제작', '불량, 줄무늬, 재제작, 파손, 찢어', '인쇄·제본 불량은 받으신 날부터 7일 안에 사진과 함께 접수해 주시면 무상으로 다시 제작해 드립니다. 받으신 상품은 회수하지 않습니다.'],
    ['교환/반품', '색감 차이', '색감, 어둡, 화면, 모니터', '모니터와 인쇄물은 색을 표현하는 방식이 달라 색감 차이가 생길 수 있습니다. 보내주신 사진으로 확인해 정상 범위를 벗어난 경우 무상으로 다시 제작해 드리며, 다음 주문부터는 편집기의 "밝기 보정"을 켜 두시길 권해 드립니다.'],
    ['회원정보', '회원 등급 산정 기준', '등급, 산정, 실적, 내려', '회원 등급은 최근 6개월 결제 금액으로 매월 1일에 산정되며, 취소한 주문은 실적에서 빠집니다.'],
    ['회원정보', '휴대폰 번호 변경', '휴대폰, 번호, 본인 인증, 인증', '마이페이지 > 회원정보 수정에서 본인 인증 후 번호를 바꾸실 수 있습니다. 인증이 되지 않으면 고객센터(02-0000-0000)로 연락 주세요. 확인 후 바로 변경해 드리겠습니다.'],
    ['기타', '단체·대량 제작 견적', '단체, 대량, 견적, 졸업앨범, 부를', '50부 이상 단체 주문은 수량별 할인과 디자인 지원을 받으실 수 있습니다. 단체 회원 신청 후 견적을 요청해 주시면 담당자가 1영업일 안에 연락드립니다.'],
    [COMMON, '고객센터 운영 시간', '전화, 연락, 상담, 운영 시간', '고객센터는 평일 09:00~18:00(점심 12:00~13:00)에 운영하며, 1:1 문의는 운영 시간 안에 순서대로 답변드립니다.']
  ].map(([type, title, keywords, answer], i) => ({ id: `k${i + 1}`, type, title, keywords: keywords.split(',').map(s => s.trim()).filter(Boolean), answer, use: true, updatedAt: '', updatedBy: '' }));
  const defaults = () => ({ types: JSON.parse(JSON.stringify(DEFAULT_TYPES)), renames: {}, knowledge: JSON.parse(JSON.stringify(DEFAULT_KNOWLEDGE)), prompt: { model: MODELS[0].id, format: DEFAULT_PROMPT, updatedAt: '', updatedBy: '' }, updatedAt: '', updatedBy: '' });

  let data;
  try { data = Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { data = defaults(); }
  const save = (by, part) => {
    data.updatedAt = nowText(); data.updatedBy = by || '';
    if (part === 'prompt') Object.assign(data.prompt, { updatedAt: data.updatedAt, updatedBy: data.updatedBy });
    try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
  };

  // ===== 유형 =====
  const types = () => data.types.map(t => Object.assign({}, t, { tags: t.tags.slice() }));
  const typeNames = () => data.types.map(t => t.name);
  const activeTypeNames = () => data.types.filter(t => t.use).map(t => t.name);
  // 이름이 바뀐 유형은 마지막 이름으로 (예: 회원정보 → 회원·로그인)
  const canonicalType = name => { let n = name, guard = 0; while (data.renames[n] && guard++ < 20) n = data.renames[n]; return n; };
  const typeOf = name => data.types.find(t => t.name === canonicalType(name)) || null;
  const tagsOf = name => { const t = typeOf(name); return t ? t.tags.slice() : []; };
  const byId = id => data.types.find(t => t.id === id);
  const clean = s => String(s || '').trim().replace(/\s+/g, ' ');

  // 반환: 오류 문구 또는 '' (성공)
  function addType(name, by) {
    name = clean(name);
    if (!name) return '유형 이름을 입력해 주세요.';
    if (data.types.some(t => t.name === name)) return '같은 이름의 유형이 있습니다.';
    const id = `t${Date.now().toString(36)}`;
    data.types.push({ id, name, use: true, tags: [] });
    delete data.renames[name];   // 예전에 다른 이름으로 바꾼 이름을 다시 쓰는 경우
    save(by);
    return '';
  }
  function renameType(id, name, by) {
    const t = byId(id); name = clean(name);
    if (!t) return '유형을 찾을 수 없습니다.';
    if (!name) return '유형 이름을 입력해 주세요.';
    if (name === t.name) return '';
    if (data.types.some(x => x.name === name)) return '같은 이름의 유형이 있습니다.';
    delete data.renames[name];
    data.renames[t.name] = name;
    t.name = name;
    save(by);
    return '';
  }
  const setUse = (id, use, by) => { const t = byId(id); if (t) { t.use = !!use; save(by); } };
  function moveType(id, dir, by) {
    const i = data.types.findIndex(t => t.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= data.types.length) return;
    [data.types[i], data.types[j]] = [data.types[j], data.types[i]];
    save(by);
  }
  const deleteType = (id, by) => { data.types = data.types.filter(t => t.id !== id); save(by); };

  // ===== 태그 (유형 안에서 이름이 겹치지 않게) =====
  function addTag(id, name, by) {
    const t = byId(id); name = clean(name).replace(/^#/, '');
    if (!t) return '유형을 찾을 수 없습니다.';
    if (!name) return '태그 이름을 입력해 주세요.';
    if (name.length > 12) return '태그는 12자 이내로 입력해 주세요.';
    if (t.tags.includes(name)) return '이 유형에 같은 태그가 있습니다.';
    t.tags.push(name);
    save(by);
    return '';
  }
  const deleteTag = (id, name, by) => { const t = byId(id); if (t) { t.tags = t.tags.filter(x => x !== name); save(by); } };
  function moveTag(id, name, dir, by) {
    const t = byId(id); if (!t) return;
    const i = t.tags.indexOf(name), j = i + dir;
    if (i < 0 || j < 0 || j >= t.tags.length) return;
    [t.tags[i], t.tags[j]] = [t.tags[j], t.tags[i]];
    save(by);
  }

  // ===== 답변 데이터 (AI 답변 생성 때 참고하는 상담 기준) =====
  //   { id, type(문의 유형 또는 '공통'), title, keywords[], answer, use, updatedAt, updatedBy }
  const knowledge = () => data.knowledge.map(k => Object.assign({}, k, { type: k.type === COMMON ? COMMON : canonicalType(k.type), keywords: k.keywords.slice() }));
  function checkKnowledge(x) {
    if (!clean(x.title)) return '제목(상황)을 입력해 주세요.';
    if (!String(x.answer || '').trim()) return '답변 내용을 입력해 주세요.';
    if (!x.type) return '문의 유형을 선택해 주세요.';
    return '';
  }
  const normKeywords = s => [...new Set((Array.isArray(s) ? s : String(s || '').split(',')).map(clean).filter(Boolean))];
  function saveKnowledge(x, by) {   // x.id 있으면 수정, 없으면 등록. 반환: 오류 문구 또는 ''
    const err = checkKnowledge(x);
    if (err) return err;
    const rec = { type: x.type, title: clean(x.title), keywords: normKeywords(x.keywords), answer: String(x.answer).trim(), use: x.use !== false, updatedAt: nowText(), updatedBy: by || '' };
    const cur = x.id && data.knowledge.find(k => k.id === x.id);
    if (cur) Object.assign(cur, rec); else data.knowledge.unshift(Object.assign({ id: `k${Date.now().toString(36)}` }, rec));
    save(by);
    return '';
  }
  const deleteKnowledge = (id, by) => { data.knowledge = data.knowledge.filter(k => k.id !== id); save(by); };
  // 문의에 맞는 답변 데이터: 같은 유형(+공통) 중 키워드·제목 단어가 문의 제목·내용에 많이 들어 있는 순. 하나도 안 맞으면 제외
  function matchKnowledge(type, text, limit = 2) {
    const t = canonicalType(type), body = String(text || '');
    return knowledge().filter(k => k.use && (k.type === t || k.type === COMMON)).map(k => {
      const hits = k.keywords.filter(w => body.includes(w));
      const titleHits = k.title.split(/[\s·()]+/).filter(w => w.length >= 2 && body.includes(w));
      return { k, hits, score: hits.length * 2 + titleHits.length + (k.type === t ? 0.5 : 0) };
    }).filter(x => x.hits.length || x.score >= 2).sort((a, b) => b.score - a.score).slice(0, limit);
  }

  // ===== 답변 프롬프트 =====
  const prompt = () => Object.assign({}, data.prompt);
  function savePrompt(model, format, by) {
    if (!MODELS.some(m => m.id === model)) return 'AI 모델을 선택해 주세요.';
    if (!String(format || '').trim()) return '형식 프롬프트를 입력해 주세요.';
    data.prompt.model = model; data.prompt.format = String(format).trim();
    save(by, 'prompt');
    return '';
  }
  const modelLabel = id => (MODELS.find(m => m.id === id) || { label: id }).label;
  // 형식 프롬프트의 '첫 줄: "…"', '마지막 줄: "…"' 문구 (프로토타입 AI 초안이 인사말·맺음말로 사용)
  const promptLine = (format, which) => { const m = String(format || '').match(new RegExp(`${which}\\s*[:：]\\s*["“]([^"”]+)["”]`)); return m ? m[1] : ''; };
  const fillVars = (text, vars) => String(text || '').replace(/\{([^{}]+)\}/g, (all, k) => (vars[k] !== undefined && vars[k] !== '' ? vars[k] : all));

  window.InquirySettings = {
    KEY, MODELS, VARIABLES, DEFAULT_PROMPT, COMMON,
    knowledge, saveKnowledge, deleteKnowledge, matchKnowledge,
    types, typeNames, activeTypeNames, canonicalType, typeOf, tagsOf,
    addType, renameType, setUse, moveType, deleteType, addTag, deleteTag, moveTag,
    prompt, savePrompt, modelLabel, promptLine, fillVars,
    meta: () => ({ updatedAt: data.updatedAt, updatedBy: data.updatedBy })
  };
})();

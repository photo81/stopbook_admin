// 1:1 문의하기 설정 (게시판관리 > 1:1 문의하기 관리)
//   유형/태그: 쇼핑몰 1:1 문의하기에서 고객이 고르는 문의 유형(순서·사용 여부)과, 유형마다 관리자가 답변할 때 붙이는 태그
//   답변 프롬프트: 1:1 문의 관리 > AI 답변 생성에 쓰는 AI 모델과 형식 프롬프트
//   저장: localStorage 한 곳 (없으면 기본값). 1:1 문의 관리(board-inquiry.html)·inquiry-data.js가 같은 값을 읽음
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
  const defaults = () => ({ types: JSON.parse(JSON.stringify(DEFAULT_TYPES)), renames: {}, prompt: { model: MODELS[0].id, format: DEFAULT_PROMPT, updatedAt: '', updatedBy: '' }, updatedAt: '', updatedBy: '' });

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
    KEY, MODELS, VARIABLES, DEFAULT_PROMPT,
    types, typeNames, activeTypeNames, canonicalType, typeOf, tagsOf,
    addType, renameType, setUse, moveType, deleteType, addTag, deleteTag, moveTag,
    prompt, savePrompt, modelLabel, promptLine, fillVars,
    meta: () => ({ updatedAt: data.updatedAt, updatedBy: data.updatedBy })
  };
})();

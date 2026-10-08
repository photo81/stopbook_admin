/**
 * 스탑북 관리자 프로토타입 - 피드백 취합용 구글 Apps Script
 *
 * 설치 방법
 *  1. 피드백을 모을 구글 시트를 새로 만든다.
 *  2. 시트 메뉴 [확장 프로그램] > [Apps Script] 를 열고, 이 파일 내용을 그대로 붙여 넣고 저장한다.
 *  3. [배포] > [새 배포] > 유형 '웹 앱' 선택
 *       - 실행 계정: 나
 *       - 액세스 권한: 모든 사용자
 *     → 배포 후 나오는 웹 앱 URL(https://script.google.com/macros/s/.../exec)을 복사한다.
 *  4. 관리자 화면의 feedback.js 맨 위 FEEDBACK_ENDPOINT 에 그 URL을 넣고 배포(깃허브 업로드)한다.
 *
 * 시트 '피드백' 탭에 한 줄씩 쌓인다 (탭이 없으면 첫 전송 때 만들고 머리글을 넣음).
 */
const SHEET_NAME = '피드백';
const HEADERS = [
  ['receivedAt', '접수 시각(서버)'], ['submittedAt', '작성 시각'], ['type', '구분'], ['content', '내용'],
  ['page', '화면'], ['url', '주소'], ['version', '프로토타입 버전'], ['admin', '작성자'], ['checker', '확인자명'],
  ['device', '기기'], ['os', '운영체제'], ['browser', '브라우저'], ['screen', '화면 해상도'], ['viewport', '창 크기'],
  ['pixelRatio', '픽셀 비율'], ['touch', '터치'], ['language', '언어'], ['timezone', '시간대'], ['userAgent', 'User-Agent']
];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    data.receivedAt = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(HEADERS.map(h => h[1]));
      sheet.setFrozenRows(1);
    }
    sheet.appendRow(HEADERS.map(h => (data[h[0]] === undefined ? '' : String(data[h[0]]))));
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

// 브라우저로 웹 앱 URL을 열었을 때 연결 확인용
function doGet() {
  return ContentService.createTextOutput('stopbook feedback endpoint OK');
}

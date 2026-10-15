import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
let cachedToken = null;
let tokenExpiresAt = 0;

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  const clientId = process.env.AMADEUS_CLIENT_ID;
  const clientSecret = process.env.AMADEUS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    const error = new Error('Amadeus 테스트 키가 설정되지 않았어요. .env에 AMADEUS_CLIENT_ID와 AMADEUS_CLIENT_SECRET을 입력해 주세요.');
    error.status = 503;
    throw error;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });
  const response = await fetch('https://test.api.amadeus.com/v1/security/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error_description || payload.errors?.[0]?.detail || 'Amadeus 인증에 실패했습니다. 테스트 키를 확인해 주세요.');
    error.status = response.status === 401 ? 401 : 502;
    throw error;
  }
  cachedToken = payload.access_token;
  tokenExpiresAt = Date.now() + Math.max(0, Number(payload.expires_in || 1800) - 60) * 1000;
  return cachedToken;
}

async function searchFlights(url, res) {
  const params = Object.fromEntries(url.searchParams);
  const origin = (params.originLocationCode || '').toUpperCase();
  const destination = (params.destinationLocationCode || '').toUpperCase();
  const adults = Number(params.adults);
  const children = Number(params.children || 0);
  const infants = Number(params.infants || 0);
  if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination)) {
    return sendJson(res, 400, { error: '출발·도착 공항 코드는 영문 3자리 IATA 코드여야 합니다.' });
  }
  if (!isDate(params.departureDate) || !isDate(params.returnDate) || params.returnDate <= params.departureDate) {
    return sendJson(res, 400, { error: '출발일과 귀국일을 확인해 주세요.' });
  }
  if (!Number.isInteger(adults) || adults < 1 || adults > 9) {
    return sendJson(res, 400, { error: '성인은 1명 이상 선택해 주세요.' });
  }
  if (!Number.isInteger(children) || children < 0 || !Number.isInteger(infants) || infants < 0 || infants > adults || adults + children + infants > 9) {
    return sendJson(res, 400, { error: '성인·어린이·유아 인원은 총 9명 이하로 입력하고, 유아 수는 성인 수보다 많을 수 없습니다.' });
  }

  try {
    const token = await getAccessToken();
    const apiUrl = new URL('https://test.api.amadeus.com/v2/shopping/flight-offers');
    for (const key of ['originLocationCode', 'destinationLocationCode', 'departureDate', 'returnDate', 'adults']) {
      apiUrl.searchParams.set(key, params[key]);
    }
    if (children) apiUrl.searchParams.set('children', String(children));
    if (infants) apiUrl.searchParams.set('infants', String(infants));
    apiUrl.searchParams.set('max', '8');
    const response = await fetch(apiUrl, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.amadeus+json' },
      signal: AbortSignal.timeout(25000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const details = payload.errors?.[0]?.detail || payload.errors?.[0]?.title;
      const error = new Error(details || (response.status === 429
        ? 'Amadeus 테스트 월간 무료 호출 한도를 초과했어요.'
        : 'Amadeus 테스트 항공권 검색에 실패했습니다. 입력한 날짜와 공항 코드를 확인해 주세요.'));
      error.status = response.status === 429 ? 429 : 502;
      throw error;
    }
    return sendJson(res, 200, { data: payload.data || [], dictionaries: payload.dictionaries || {} });
  } catch (error) {
    return sendJson(res, error.status || 502, { error: error.name === 'TimeoutError' ? 'Amadeus 응답 시간이 초과됐어요. 잠시 후 다시 검색해 주세요.' : error.message || 'Amadeus에 연결하지 못했습니다.' });
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/api/flights') return searchFlights(url, res);
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    try {
      const html = await readFile(path.join(root, 'index.html'));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(html);
    } catch {
      return sendJson(res, 500, { error: '화면 파일을 읽을 수 없습니다.' });
    }
  }
  return sendJson(res, 404, { error: '요청한 주소를 찾을 수 없습니다.' });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`곤상플랜 로컬 서버: http://localhost:${port}`);
  console.log('Amadeus 테스트 키가 준비되면 .env에 넣고 검색 화면에서 가격을 조회하세요.');
});

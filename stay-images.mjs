// 숙소 대표 이미지 보강: AI 가 준 숙소 페이지 URL 에서 og:image 를 읽어 온다.
// AI 가 적은 이미지 주소는 지어낸 경우가 많아, 실제 페이지에서 읽은 값을 우선하고 AI 값은 보조로만 쓴다.
// 서버가 임의 URL 을 가져오므로 사설망·로컬 주소는 차단한다 (SSRF 방지).
import { lookup } from 'node:dns/promises';
import net from 'node:net';

const FETCH_TIMEOUT_MS = 4000;
const TOTAL_BUDGET_MS = 6000;
const MAX_BYTES = 300 * 1024;
const MAX_REDIRECTS = 3;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map();   // url -> { image, at }

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIp(mapped[1]);
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || /^fe[89ab]/.test(v6);
}

async function assertPublicHttps(raw) {
  const u = new URL(raw);
  if (u.protocol !== 'https:' || (u.port && u.port !== '443') || u.username || u.password) throw new Error('blocked');
  const host = u.hostname;
  if (net.isIP(host) || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('blocked');
  const addrs = await lookup(host, { all: true });
  if (!addrs.length || addrs.some(a => isPrivateIp(a.address))) throw new Error('blocked');
  return u;
}

async function fetchHead(url, signal) {
  let current = url;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const u = await assertPublicHttps(current);
    const res = await fetch(u, {
      redirect: 'manual', signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; GonsangPlan/1.0)', accept: 'text/html', 'accept-language': 'ko,en;q=0.8' }
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location'), u).href;
      continue;
    }
    if (!res.ok || !/html/i.test(res.headers.get('content-type') || '')) return { html: '', base: u.href };
    // 앞부분만 읽는다 (meta 태그는 <head> 에 있다)
    const reader = res.body.getReader();
    const chunks = []; let size = 0;
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); size += value.length;
    }
    reader.cancel().catch(() => {});
    return { html: Buffer.concat(chunks).toString('utf8'), base: u.href };
  }
  return { html: '', base: current };
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  return m ? (m[2] ?? m[3]) : null;
}

function extractImage(html, base) {
  const wanted = ['og:image:secure_url', 'og:image', 'twitter:image'];
  const found = {};
  for (const tag of html.match(/<meta\s[^>]*>/gi) || []) {
    const key = (attr(tag, 'property') || attr(tag, 'name') || '').toLowerCase();
    const content = attr(tag, 'content');
    if (wanted.includes(key) && content && !found[key]) found[key] = content.replace(/&amp;/g, '&');
  }
  for (const k of wanted) {
    if (!found[k]) continue;
    try {
      const u = new URL(found[k], base);
      if (u.protocol === 'https:') return u.href;
    } catch { /* 다음 후보 */ }
  }
  return null;
}

async function imageFromPage(pageUrl, signal) {
  const hit = cache.get(pageUrl);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.image;
  let image = null;
  try {
    const { html, base } = await fetchHead(pageUrl, AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]));
    image = extractImage(html, base);
  } catch { /* 이미지는 부가 정보라 실패해도 검색은 계속한다 */ }
  if (cache.size > 500) cache.clear();
  cache.set(pageUrl, { image, at: Date.now() });
  return image;
}

// stays[i].imageUrl 을 채운다. 전체 대기 시간은 TOTAL_BUDGET_MS 를 넘기지 않는다.
export async function attachImages(stays) {
  const budget = AbortSignal.timeout(TOTAL_BUDGET_MS);
  await Promise.allSettled(stays.map(async s => {
    if (!s.url) return;
    const fromPage = await imageFromPage(s.url, budget);
    if (fromPage) s.imageUrl = fromPage;
  }));
  return stays;
}

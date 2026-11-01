import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { extractFlyerImage } from '../bom-lugar/index.js';

export const cookiesPath = '.local/instagram-cookies.json';
export function isPostUrl(expected, actual) {
  const post = path => path.match(/\/(p|reel)\/([\w-]+)\/?$/);
  const left = post(expected), right = post(actual);
  return !!left && !!right && left[1] === right[1] && left[2] === right[2];
}
export function normalizeCookies(input) {
  if (!Array.isArray(input)) throw Error('Cookies do Instagram devem ser uma lista.');
  const cookies = input.filter(c => c && (c.domain === '.instagram.com' || c.domain === 'instagram.com' || c.domain === 'www.instagram.com') && typeof c.name === 'string' && /^[!#$%&'*+.^_`|~\w-]+$/.test(c.name) && typeof c.value === 'string' && !/[\x00-\x1f\x7f;]/.test(c.value) && (c.path == null || (typeof c.path === 'string' && c.path.startsWith('/') && !/[\x00-\x1f\x7f;]/.test(c.path)))).map(c => ({
    name:c.name, value:c.value, domain:c.domain, path:c.path || '/',
    ...(Number.isFinite(c.expirationDate ?? c.expires) ? {expires:c.expirationDate ?? c.expires} : {}),
    ...(c.sameSite ? {sameSite:({no_restriction:'None',lax:'Lax',strict:'Strict',None:'None',Lax:'Lax',Strict:'Strict'})[c.sameSite] || 'Lax'} : {}),
    secure:!!c.secure, httpOnly:!!c.httpOnly
  }));
  if (!cookies.some(c => c.name === 'sessionid' && c.value)) throw Error('Cookie de sessão do Instagram não encontrado.');
  return cookies;
}

export async function readPostImages(post) {
  const images = new Set();
  for (let i = 0; i < 20; i++) {
    for (const image of await post.currentImages()) images.add(image);
    if (!await post.next()) break;
    if (i === 19) throw Error('Carrossel do Instagram excede o limite de imagens.');
  }
  if (!images.size) throw Error('Nenhuma imagem encontrada na publicação do Instagram.');
  return [...images];
}

const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const postPathParts = (href, username) => {
  const parts = (href || '').split('/').filter(Boolean);
  if (parts.length === 3 && parts[0].toLowerCase() === username.toLowerCase()) parts.shift();
  return parts.length === 2 && /^(p|reel)$/.test(parts[0]) && /^[\w-]+$/.test(parts[1]) ? parts : null;
};
function imagesOnScreen(minHeight) {
  const largest = img => (img.srcset || '').split(',').map(entry => entry.trim().split(/\s+/)).filter(entry => entry[0]).sort((a, b) => parseInt(b[1] || 0) - parseInt(a[1] || 0))[0]?.[0] || img.currentSrc || img.src;
  return [...document.querySelectorAll('img')].filter(img => { const r = img.getBoundingClientRect(); return img.naturalWidth >= 200 && r.width >= 200 && r.height >= minHeight; }).map(largest);
}
async function readPost(page, postUrl) {
  await page.goto(postUrl, {waitUntil:'domcontentloaded', timeout:30000});
  await page.waitForFunction(() => [...(document.querySelector('[role="dialog"]') || document).querySelectorAll('img')].some(img => img.naturalWidth >= 200 && img.getBoundingClientRect().width >= 200), null, {timeout:20000});
  await page.waitForTimeout(800);
  const images = await readPostImages({
    currentImages: () => page.evaluate(() => {
      const post = document.querySelector('[role="dialog"]') || document;
      const button = post.querySelector('button[aria-label="Avançar"],button[aria-label="Next"],button[aria-label="Voltar"],button[aria-label="Previous"]');
      const container = button?.parentElement;
      const area = container?.getBoundingClientRect();
      const imgs = [...(container || post).querySelectorAll('img')].filter(img => {
        const r = img.getBoundingClientRect();
        return img.naturalWidth >= 200 && r.width >= 200 && r.height >= 200 && (!area || (r.left < area.right && r.right > area.left));
      });
      return imgs.slice(0, 1).map(img => img.currentSrc || img.src);
    }),
    next: async () => {
      const dialog = page.locator('[role="dialog"]').first();
      const button = (await dialog.count() ? dialog : page).locator('button[aria-label="Avançar"],button[aria-label="Next"]').first();
      if (!await button.isVisible()) return false;
      await button.click();
      await page.waitForTimeout(500);
      return true;
    }
  });
  const caption = await page.evaluate(() => ((document.querySelector('[role="dialog"] h1, article h1')?.innerText) || (document.querySelector('meta[property="og:description"]')?.content || '').replace(/^[^"]*\d+ comments? - [^"]*: "/, '').replace(/"$/, '')).trim().slice(0, 1500));
  return {url:postUrl, caption, images};
}
async function readStories(page, username) {
  const prefix = `/stories/${username}/`;
  await page.goto(`https://www.instagram.com${prefix}`, {waitUntil:'domcontentloaded', timeout:30000});
  const open = page.getByRole('button', {name:/ver (o )?story|view story/i}).first();
  try { await open.waitFor({timeout:8000}); await open.click(); } catch {}
  const images = new Set();
  let last = '';
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(700);
    const path = new URL(page.url()).pathname;
    if (!path.startsWith(prefix) || path === last) break;
    last = path;
    for (const src of await page.evaluate(imagesOnScreen, 300)) images.add(src);
    await page.keyboard.press('ArrowRight');
  }
  return [...images];
}

export async function collectInstagramMedia(username, {posts = 1, stories = false, cookiesPath:path = cookiesPath} = {}) {
  if (!/^[\w.]{1,30}$/.test(username)) throw Error('Perfil do Instagram inválido.');
  let cookies;
  let raw;
  try { raw = await readFile(path, 'utf8'); }
  catch (e) { if (e.code === 'ENOENT') throw Error('Configure os cookies do Instagram em .local/instagram-cookies.json.'); throw Error('Não foi possível ler os cookies do Instagram.'); }
  try { cookies = normalizeCookies(JSON.parse(raw)); } catch { throw Error('Cookies do Instagram inválidos ou sem sessão.'); }
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/google-chrome', headless:true});
  try {
    const context = await browser.newContext({locale:'pt-BR', viewport:{width:1366,height:768}, userAgent:`Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browser.version()} Safari/537.36`});
    await context.addCookies(cookies);
    const page = await context.newPage();
    await page.goto(`https://www.instagram.com/${username}/`, {waitUntil:'domcontentloaded', timeout:30000});
    if (/\/accounts\/(login|challenge)/.test(page.url())) throw Error('Sessão do Instagram expirada ou requer verificação.');
    try { await page.locator('a[href*="/p/"], a[href*="/reel/"]').first().waitFor({timeout:20000}); }
    catch { throw Error('Não foi possível acessar as publicações; confira a sessão do Instagram.'); }
    const hrefs = await page.locator('a[href*="/p/"], a[href*="/reel/"]').evaluateAll(items => items.filter(a => !a.querySelector('svg[aria-label*="fixad" i], svg[aria-label*="pinned" i]')).map(a => a.getAttribute('href')));
    const urls = [...new Set(hrefs.map(href => postPathParts(href, username)).filter(Boolean).map(parts => `https://www.instagram.com/${parts.join('/')}/`))].slice(0, posts);
    if (!urls.length) throw Error('Publicação recente do Instagram não encontrada.');
    const result = {posts:[], stories:[]};
    let failure;
    for (const url of urls) {
      try { result.posts.push(await readPost(page, url)); }
      catch (error) { failure = error; console.error(JSON.stringify({type:'error',at:new Date().toISOString(),scope:'instagram',detail:`Falha ao ler ${url}`})); }
    }
    if (!result.posts.length) throw failure;
    if (stories) result.stories = await readStories(page, username);
    return result;
  } catch (error) {
    if (error.name === 'TimeoutError') throw Error('Instagram demorou para abrir a publicação. Tente atualizar novamente.');
    if (error.message?.includes('\n')) throw Error('Não foi possível acessar a publicação do Instagram.');
    throw error;
  } finally { await browser.close(); }
}

async function downloadImage(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !/(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(parsed.hostname)) throw Error('Endereço de imagem do Instagram inválido.');
  const response = await fetch(url, {signal:AbortSignal.timeout(30000)});
  const mime = response.headers.get('content-type')?.split(';')[0] || '';
  if (!response.ok || !/^image\/(jpeg|png|webp)$/.test(mime)) throw Error('Não foi possível baixar imagem do Instagram.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 10_000_000) throw Error('Imagem do Instagram excede o tamanho permitido.');
  return {bytes, mime};
}

export async function fetchInstagramOffers(username, options = {}) {
  const media = await (options.collect || collectInstagramMedia)(username, options);
  const date = today(), offers = [], seen = new Set();
  const sources = [...media.posts, ...(media.stories.length ? [{url:`https://www.instagram.com/stories/${username}/`, caption:'', images:media.stories}] : [])];
  for (const source of sources) for (const url of source.images) {
    if (seen.has(url)) continue;
    seen.add(url);
    const {bytes, mime} = await downloadImage(url);
    offers.push(...await extractFlyerImage(bytes, mime, source.url, date, {requirePromotion:true, caption:source.caption}));
  }
  return offers;
}

export async function fetchConfiguredInstagramOffers(username, options) {
  try { await readFile(cookiesPath); }
  catch (e) { if (e.code === 'ENOENT') return null; throw Error('Não foi possível ler os cookies do Instagram.'); }
  return fetchInstagramOffers(username, options);
}

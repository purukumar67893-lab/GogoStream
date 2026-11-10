import express from 'express';
import { createServer as createViteServer } from 'vite';
import * as cheerio from 'cheerio';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'https://gogoanime.or.at';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCached<T>(key: string, data: T, ttlMs = 5 * 60 * 1000): void {
  if (cache.size > 500) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: BASE_URL + '/',
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${url}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

export interface AnimeCard {
  slug: string;
  title: string;
  image: string;
  type: string;
  statusOrEp: string;
  subOrDub: string;
  url: string;
  isEpisodeLink?: boolean;
}

function extractSlugFromUrl(href: string): { slug: string; isEpisode: boolean } {
  try {
    const u = new URL(href, BASE_URL);
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] === 'anime' && parts[1]) {
      return { slug: parts[1], isEpisode: false };
    }
    if (parts.length > 0) {
      return { slug: parts[parts.length - 1], isEpisode: true };
    }
  } catch {
    // ignore
  }
  return { slug: '', isEpisode: false };
}

function proxyImageUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  const clean = rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl;
  return `/api/image-proxy?url=${encodeURIComponent(clean)}`;
}

function parseAnimeCards($: cheerio.CheerioAPI, rootSelector?: string): AnimeCard[] {
  const cards: AnimeCard[] = [];
  const seen = new Set<string>();
  const container = rootSelector ? $(rootSelector) : $.root();

  container.find('article.bs .bsx, .listupd .bsx').each((_, el) => {
    const $el = $(el);
    const $a = $el.find('a').first();
    const href = $a.attr('href') || '';
    if (!href) return;

    const { slug, isEpisode } = extractSlugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const rawTitle =
      $el.find('.tt h2').first().text().trim() ||
      $a.attr('title')?.trim() ||
      $el.find('.tt').clone().children().remove().end().text().trim();

    const img =
      $el.find('img').attr('data-src') ||
      $el.find('img').attr('data-lazy-src') ||
      $el.find('img').attr('src') ||
      '';

    const type = $el.find('.typez').first().text().trim() || 'TV';
    const statusOrEp = $el.find('.epx').first().text().trim() || 'HD';
    const subOrDub = $el.find('.sb').first().text().trim() || 'Sub';

    cards.push({
      slug,
      title: rawTitle,
      image: proxyImageUrl(img),
      type,
      statusOrEp,
      subOrDub,
      url: href,
      isEpisodeLink: isEpisode,
    });
  });

  return cards;
}

function parseHasNext($: cheerio.CheerioAPI): boolean {
  const nextLink =
    $('.pagination .next, .hpage a.r, a.next.page-numbers, .nav-links .next').attr('href') || '';
  return Boolean(nextLink);
}

// In-memory real-time chat store + SSE subscribers
interface ChatMessage {
  id: string;
  room: string;
  username: string;
  text: string;
  color: string;
  createdAt: string;
}

const chatRooms = new Map<string, ChatMessage[]>();
const sseClients = new Map<string, Set<express.Response>>();

// Seed initial welcome message in global room
chatRooms.set('global', [
  {
    id: 'sys-1',
    room: 'global',
    username: 'Moderator',
    text: 'Welcome to GogoStream Live Chat. Discuss episodes, request recommendations, and share server tips.',
    color: '#F43F5E',
    createdAt: new Date().toISOString(),
  },
]);

function broadcastChatMessage(room: string, msg: ChatMessage) {
  const clients = sseClients.get(room);
  if (!clients) return;
  const payload = `data: ${JSON.stringify(msg)}\n\n`;
  for (const res of clients) {
    res.write(payload);
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // 1. Image proxy to prevent hotlink / CORS failures on gogoanime images
  app.get('/api/image-proxy', async (req, res) => {
    const url = req.query.url as string;
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      return res.status(400).send('Invalid URL');
    }
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Referer: BASE_URL + '/',
        },
      });
      if (!response.ok) {
        return res.status(response.status).send('Image fetch failed');
      }
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const arrayBuffer = await response.arrayBuffer();
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(Buffer.from(arrayBuffer));
    } catch {
      res.status(502).send('Failed to proxy image');
    }
  });

  // 2. Home endpoint: Featured, Latest Releases, Popular, Genres
  app.get('/api/anime/home', async (_req, res) => {
    try {
      const cached = getCached<unknown>('home');
      if (cached) return res.json(cached);

      const html = await fetchHtml(`${BASE_URL}/`);
      const $ = cheerio.load(html);

      const allCards = parseAnimeCards($);

      // Extract popular / sidebar or slider items if present
      const popular: AnimeCard[] = [];
      const seenPop = new Set<string>();
      $('.serieslist.pop ul li, #sidebar .serieslist ul li').each((_, el) => {
        const $el = $(el);
        const $a = $el.find('.leftseries h4 a, .imgseries a').first();
        const href = $a.attr('href') || '';
        const { slug } = extractSlugFromUrl(href);
        if (!slug || seenPop.has(slug)) return;
        seenPop.add(slug);
        const title =
          $el.find('.leftseries h4 a').text().trim() || $a.attr('title')?.trim() || slug;
        const img =
          $el.find('img').attr('data-src') || $el.find('img').attr('src') || '';
        const genresText = $el.find('.leftseries span').first().text().replace('Genres:', '').trim();
        popular.push({
          slug,
          title,
          image: proxyImageUrl(img),
          type: 'TV',
          statusOrEp: genresText ? genresText.split(',')[0].trim() : 'Popular',
          subOrDub: 'HD',
          url: href,
        });
      });

      // Extract genre list from navigation or sidebar
      const genres: { name: string; slug: string }[] = [];
      const seenGenres = new Set<string>();
      $('a[href*="/genres/"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const match = href.match(/\/genres\/([^/]+)\/?/);
        const name = $(el).text().trim();
        if (match && match[1] && name && !seenGenres.has(match[1]) && name.length < 28) {
          seenGenres.add(match[1]);
          genres.push({ name, slug: match[1] });
        }
      });

      // Also fetch page 1 of /anime/ for clean series cards if home has episode links
      let catalogSample = allCards.filter((c) => !c.isEpisodeLink);
      if (catalogSample.length < 12) {
        try {
          const catHtml = await fetchHtml(`${BASE_URL}/anime/`);
          const $cat = cheerio.load(catHtml);
          catalogSample = parseAnimeCards($cat);
        } catch {
          // keep whatever we have
        }
      }

      const payload = {
        featured: (popular.length > 0 ? popular : catalogSample).slice(0, 6),
        latest: allCards.slice(0, 24),
        popular: (popular.length > 0 ? popular : catalogSample).slice(0, 12),
        catalogPreview: catalogSample.slice(0, 18),
        genres: genres.slice(0, 28),
      };

      setCached('home', payload, 5 * 60 * 1000);
      res.json(payload);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to load home feed from gogoanime.or.at',
      });
    }
  });

  // 3. Unlimited Catalog endpoint (supports page, genre, status, type, order)
  app.get('/api/anime/catalog', async (req, res) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const genre = ((req.query.genre as string) || '').trim();
      const status = ((req.query.status as string) || '').trim();
      const type = ((req.query.type as string) || '').trim();
      const order = ((req.query.order as string) || '').trim();

      let targetUrl = `${BASE_URL}/anime/?page=${page}`;
      if (genre) {
        targetUrl =
          page > 1
            ? `${BASE_URL}/genres/${encodeURIComponent(genre)}/page/${page}/`
            : `${BASE_URL}/genres/${encodeURIComponent(genre)}/`;
      } else {
        const params = new URLSearchParams();
        if (page > 1) params.set('page', String(page));
        if (status) params.set('status', status);
        if (type) params.set('type', type);
        if (order) params.set('order', order);
        const qs = params.toString();
        targetUrl = qs ? `${BASE_URL}/anime/?${qs}` : `${BASE_URL}/anime/`;
      }

      const cacheKey = `catalog:${targetUrl}`;
      const cached = getCached<unknown>(cacheKey);
      if (cached) return res.json(cached);

      const html = await fetchHtml(targetUrl);
      const $ = cheerio.load(html);
      const items = parseAnimeCards($);
      const hasNext = parseHasNext($) || items.length >= 20;

      const payload = { items, page, hasNext };
      setCached(cacheKey, payload, 5 * 60 * 1000);
      res.json(payload);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to load anime catalog',
      });
    }
  });

  // 4. A-Z Unlimited Directory endpoint
  app.get('/api/anime/az', async (req, res) => {
    try {
      const letter = ((req.query.letter as string) || 'A').trim();
      const page = Math.max(1, Number(req.query.page) || 1);
      const targetUrl =
        page > 1
          ? `${BASE_URL}/az-lists/page/${page}/?show=${encodeURIComponent(letter)}`
          : `${BASE_URL}/az-lists/?show=${encodeURIComponent(letter)}`;

      const cacheKey = `az:${targetUrl}`;
      const cached = getCached<unknown>(cacheKey);
      if (cached) return res.json(cached);

      const html = await fetchHtml(targetUrl);
      const $ = cheerio.load(html);
      const items = parseAnimeCards($);
      const hasNext = parseHasNext($);

      const payload = { items, page, letter, hasNext };
      setCached(cacheKey, payload, 10 * 60 * 1000);
      res.json(payload);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to load A-Z directory',
      });
    }
  });

  // 5. Search endpoint
  app.get('/api/anime/search', async (req, res) => {
    try {
      const q = ((req.query.q as string) || '').trim();
      const page = Math.max(1, Number(req.query.page) || 1);
      if (!q) {
        return res.json({ items: [], page: 1, hasNext: false });
      }

      const targetUrl =
        page > 1
          ? `${BASE_URL}/page/${page}/?s=${encodeURIComponent(q)}`
          : `${BASE_URL}/?s=${encodeURIComponent(q)}`;

      const cacheKey = `search:${targetUrl}`;
      const cached = getCached<unknown>(cacheKey);
      if (cached) return res.json(cached);

      const html = await fetchHtml(targetUrl);
      const $ = cheerio.load(html);
      const items = parseAnimeCards($);
      const hasNext = parseHasNext($);

      const payload = { items, page, query: q, hasNext };
      setCached(cacheKey, payload, 5 * 60 * 1000);
      res.json(payload);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Search failed',
      });
    }
  });

  // 6. Anime Detail + Full Episode List
  app.get('/api/anime/detail/:slug', async (req, res) => {
    try {
      const { slug } = req.params;
      const cacheKey = `detail:${slug}`;
      const cached = getCached<unknown>(cacheKey);
      if (cached) return res.json(cached);

      const html = await fetchHtml(`${BASE_URL}/anime/${encodeURIComponent(slug)}/`);
      const $ = cheerio.load(html);

      const title =
        $('h1.entry-title').first().text().trim() ||
        $('.infox h1').first().text().trim() ||
        slug.replace(/-/g, ' ');

      const altTitle = $('.alter').first().text().trim();
      const img =
        $('.thumb img').first().attr('data-src') ||
        $('.thumb img').first().attr('src') ||
        $('meta[property="og:image"]').attr('content') ||
        '';

      const synopsis =
        $('.entry-content[itemprop="description"]').text().trim() ||
        $('.synp .entry-content').text().trim() ||
        $('.infox .desc').text().trim() ||
        $('meta[name="description"]').attr('content') ||
        'No synopsis available.';

      const info: Record<string, string> = {};
      $('.infox .spe span, .bigcontent .infox .spe span').each((_, el) => {
        const text = $(el).text().trim();
        const colonIdx = text.indexOf(':');
        if (colonIdx > 0) {
          const key = text.slice(0, colonIdx).trim().toLowerCase();
          const val = text.slice(colonIdx + 1).trim();
          if (key && val) info[key] = val;
        }
      });

      const genres: { name: string; slug: string }[] = [];
      $('.genxed a').each((_, el) => {
        const name = $(el).text().trim();
        const href = $(el).attr('href') || '';
        const match = href.match(/\/genres\/([^/]+)\/?/);
        if (name) {
          genres.push({ name, slug: match ? match[1] : name.toLowerCase() });
        }
      });

      const rating =
        $('.rating strong').text().replace(/Rating\s*/i, '').trim() ||
        $('[itemprop="ratingValue"]').text().trim() ||
        'N/A';

      // Parse episodes from .eplister ul li or .episodes-ul .item or generic episode links
      interface EpisodeItem {
        number: string;
        title: string;
        slug: string;
        date: string;
      }

      const episodes: EpisodeItem[] = [];
      const seenEp = new Set<string>();

      $('.eplister ul li, .episodes-ul a, .episodes-ul .item').each((_, el) => {
        const $el = $(el);
        const $a = $el.is('a') ? $el : $el.find('a').first();
        const href = $a.attr('href') || '';
        if (!href) return;
        const { slug: epSlug } = extractSlugFromUrl(href);
        if (!epSlug || seenEp.has(epSlug)) return;
        seenEp.add(epSlug);

        const num =
          $el.find('.epl-num').text().trim() ||
          $el.attr('data-index') ||
          epSlug.match(/episode-(\d+(?:\.\d+)?)/i)?.[1] ||
          String(episodes.length + 1);
        const epTitle =
          $el.find('.epl-title').text().trim() ||
          $a.attr('title')?.trim() ||
          `Episode ${num}`;
        const date = $el.find('.epl-date').text().trim() || '';

        episodes.push({
          number: num,
          title: epTitle,
          slug: epSlug,
          date,
        });
      });

      // Fallback if episode list uses another container
      if (episodes.length === 0) {
        $(`a[href*="${slug}-episode-"], a[href*="-episode-"]`).each((_, el) => {
          const href = $(el).attr('href') || '';
          const { slug: epSlug } = extractSlugFromUrl(href);
          if (!epSlug || seenEp.has(epSlug)) return;
          seenEp.add(epSlug);
          const num = epSlug.match(/episode-(\d+(?:\.\d+)?)/i)?.[1] || String(episodes.length + 1);
          episodes.push({
            number: num,
            title: $(el).text().trim() || `Episode ${num}`,
            slug: epSlug,
            date: '',
          });
        });
      }

      // Sort episodes numerically ascending
      episodes.sort((a, b) => {
        const na = parseFloat(a.number) || 0;
        const nb = parseFloat(b.number) || 0;
        return na - nb;
      });

      const related = parseAnimeCards($, '.bixbox .listupd');

      const payload = {
        slug,
        title,
        altTitle,
        image: proxyImageUrl(img),
        synopsis,
        status: info['status'] || 'Ongoing',
        studio: info['studio'] || 'Unknown',
        released: info['released'] || info['aired'] || '',
        type: info['type'] || 'TV',
        season: info['season'] || '',
        duration: info['duration'] || '24 min',
        rating,
        genres,
        episodes,
        related: related.slice(0, 6),
      };

      setCached(cacheKey, payload, 5 * 60 * 1000);
      res.json(payload);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to load anime details',
      });
    }
  });

  // 7. Watch Episode + Extract ALL Video Servers
  app.get('/api/anime/watch/:episodeSlug', async (req, res) => {
    try {
      const { episodeSlug } = req.params;
      const cacheKey = `watch:${episodeSlug}`;
      const cached = getCached<unknown>(cacheKey);
      if (cached) return res.json(cached);

      const html = await fetchHtml(`${BASE_URL}/${encodeURIComponent(episodeSlug)}/`);
      const $ = cheerio.load(html);

      const title =
        $('h1.entry-title').first().text().trim() ||
        episodeSlug.replace(/-/g, ' ');

      interface VideoServer {
        name: string;
        url: string;
        index: number;
        category: string;
      }

      const servers: VideoServer[] = [];
      const seenUrls = new Set<string>();

      const addServer = (name: string, rawUrl: string, category = 'Sub') => {
        let cleanUrl = rawUrl.trim();
        if (cleanUrl.startsWith('//')) {
          cleanUrl = `https:${cleanUrl}`;
        }
        if (!cleanUrl || (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://'))) {
          return;
        }
        if (seenUrls.has(cleanUrl)) return;
        seenUrls.add(cleanUrl);
        servers.push({
          name: name || `Server ${servers.length + 1}`,
          url: cleanUrl,
          index: servers.length + 1,
          category,
        });
      };

      // Parse base64-encoded mirror <select class="mirror"> options
      $('select.mirror option').each((_, el) => {
        const val = $(el).attr('value')?.trim();
        const label = $(el).text().trim();
        if (!val || label.toLowerCase().includes('select')) return;

        try {
          const decoded = Buffer.from(val, 'base64').toString('utf8');
          const $frag = cheerio.load(decoded);
          const src = $frag('iframe').attr('src') || $frag('source').attr('src') || '';
          if (src) {
            const cat = src.includes('category=dub') ? 'Dub' : 'Sub';
            addServer(label, src, cat);
          }
        } catch {
          if (val.startsWith('http')) {
            addServer(label, val);
          }
        }
      });

      // Parse default #pembed iframe
      const defaultIframeSrc = $('#pembed iframe, .player-embed iframe').first().attr('src') || '';
      if (defaultIframeSrc) {
        const cat = defaultIframeSrc.includes('category=dub') ? 'Dub' : 'Sub';
        addServer('Primary HD', defaultIframeSrc, cat);
      }

      // Parse any server buttons with data-video or data-embed
      $('[data-video], [data-embed], .server-item').each((_, el) => {
        const src = $(el).attr('data-video') || $(el).attr('data-embed') || '';
        const label = $(el).text().trim() || `Mirror ${servers.length + 1}`;
        if (src) addServer(label, src);
      });

      // Prioritize Omega (Vidmoly) and Moon (Filemoon/Byse) first, then Ad-Free HD mirrors
      const scoreServer = (name: string, u: string): number => {
        const lowerUrl = u.toLowerCase();
        const lowerName = name.toLowerCase();
        if (lowerName.includes('omega') || lowerUrl.includes('vidmoly')) return 1;
        if (lowerName.includes('moon') || lowerUrl.includes('filemoon') || lowerUrl.includes('bysesayeveum')) return 2;
        if (lowerUrl.includes('streamwish') || lowerUrl.includes('mp4upload')) return 3;
        if (lowerUrl.includes('gogoanime.me.uk')) return 4;
        return 5;
      };
      servers.sort((a, b) => scoreServer(a.name, a.url) - scoreServer(b.name, b.url));

      // Wrap gogoanime.me.uk servers with our ad-stripping clean-player route while keeping original URLs available
      const finalServers = servers.map((s) => {
        if (s.url.includes('gogoanime.me.uk/newplayer.php')) {
          return {
            ...s,
            name: `${s.name} (Ad-Free)`,
            url: `/api/anime/clean-player?url=${encodeURIComponent(s.url)}`,
          };
        }
        return s;
      });

      // Prev / Next episode navigation
      let prevEpisode = '';
      let nextEpisode = '';
      let animeSlug = '';

      $('.naveps a, .nvs a').each((_, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().trim().toLowerCase();
        const rel = ($(el).attr('rel') || '').toLowerCase();
        const { slug, isEpisode } = extractSlugFromUrl(href);

        if (href.includes('/anime/')) {
          animeSlug = slug;
        } else if (isEpisode && slug) {
          if (rel === 'prev' || text.includes('prev')) {
            prevEpisode = slug;
          } else if (rel === 'next' || text.includes('next')) {
            nextEpisode = slug;
          }
        }
      });

      if (!animeSlug) {
        const breadLink = $('.ts-breadcrumb a[href*="/anime/"], .det a[href*="/anime/"]').first().attr('href') || '';
        if (breadLink) {
          animeSlug = extractSlugFromUrl(breadLink).slug;
        } else {
          animeSlug = episodeSlug.replace(/-episode-\d+.*$/i, '');
        }
      }

      const payload = {
        episodeSlug,
        title,
        animeSlug,
        prevEpisode,
        nextEpisode,
        servers: finalServers,
      };

      setCached(cacheKey, payload, 10 * 60 * 1000);
      res.json(payload);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to load episode servers',
      });
    }
  });

  // 8. Clean Ad-Free Player Wrapper (strips popunder/ad scripts from newplayer.php)
  app.get('/api/anime/clean-player', async (req, res) => {
    const url = req.query.url as string;
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      return res.status(400).send('Invalid player URL');
    }
    try {
      const html = await fetchHtml(url);
      const $ = cheerio.load(html);
      // Remove all ad/popunder scripts
      $('script').each((_, el) => {
        const src = $(el).attr('src') || '';
        const body = $(el).html() || '';
        if (
          src.includes('llvpn') ||
          src.includes('pop') ||
          src.includes('ad') ||
          body.includes('llvpn') ||
          body.includes('dataset.zone')
        ) {
          $(el).remove();
        }
      });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send($.html());
    } catch {
      res.redirect(url);
    }
  });

  // 9. Server Health / Latency Check (uses GET + abort so Cloudflare/embed hosts respond accurately)
  app.get('/api/anime/server-check', async (req, res) => {
    const rawUrl = (req.query.url as string) || '';
    const url = rawUrl.startsWith('/api/anime/clean-player?url=')
      ? decodeURIComponent(rawUrl.replace('/api/anime/clean-player?url=', ''))
      : rawUrl;
    if (!url || !url.startsWith('http')) {
      return res.status(400).json({ ok: false, latencyMs: 0 });
    }
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const r = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT, Referer: BASE_URL + '/' },
      });
      const latencyMs = Date.now() - start;
      controller.abort();
      res.json({ ok: r.status >= 200 && r.status < 400, status: r.status, latencyMs });
    } catch {
      res.json({ ok: false, status: 0, latencyMs: Date.now() - start });
    } finally {
      clearTimeout(timeout);
    }
  });

  // 9. Live Community Chat Endpoints (REST + SSE)
  app.get('/api/chat/messages', (req, res) => {
    const room = ((req.query.room as string) || 'global').trim();
    const messages = chatRooms.get(room) || [];
    res.json({ room, messages: messages.slice(-60) });
  });

  app.post('/api/chat/messages', (req, res) => {
    const { room = 'global', username = 'Guest', text = '', color = '#38BDF8' } = req.body || {};
    const cleanText = String(text).trim().slice(0, 500);
    const cleanUser = String(username).trim().slice(0, 24) || 'Guest';
    const cleanRoom = String(room).trim() || 'global';

    if (!cleanText) {
      return res.status(400).json({ error: 'Message text is required' });
    }

    const msg: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      room: cleanRoom,
      username: cleanUser,
      text: cleanText,
      color: String(color),
      createdAt: new Date().toISOString(),
    };

    const existing = chatRooms.get(cleanRoom) || [];
    existing.push(msg);
    if (existing.length > 100) existing.shift();
    chatRooms.set(cleanRoom, existing);

    broadcastChatMessage(cleanRoom, msg);
    res.status(201).json(msg);
  });

  app.get('/api/chat/stream', (req, res) => {
    const room = ((req.query.room as string) || 'global').trim();
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    if (!sseClients.has(room)) {
      sseClients.set(room, new Set());
    }
    sseClients.get(room)!.add(res);

    const keepAlive = setInterval(() => {
      res.write(': ping\n\n');
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.get(room)?.delete(res);
    });
  });

  // Mount Vite in dev or serve static dist in production
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GogoStream server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();

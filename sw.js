/*
 * Service worker прайса Восток (работает только на сайте, не при открытии файлом).
 *
 * Страница (index.html) — «сначала сеть с таймаутом»: если сеть ответила за 3 секунды,
 * показываем свежую версию и обновляем кэш; если сети нет или она не успела — сохранённую копию.
 * Так после изменения цен клиент с интернетом сразу видит новые цены, а без интернета прайс всё равно открывается.
 * Manifest и иконки — «сначала кэш».
 *
 * CACHE_VERSION проставляет сборка tools/build.js (хеш входных данных: данные, настройки, движок, картинки) — вручную не менять.
 * Новая версия → браузер ставит новый service worker, старый кэш удаляется.
 */
'use strict';

const CACHE_VERSION = 'cab5283934';
const CACHE_PREFIX = 'vostok-';
const CACHE = CACHE_PREFIX + CACHE_VERSION;
const PAGE = './';
const PAGE_FILE = './index.html';
const ASSETS = [
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];
const NET_TIMEOUT = 3000;

const scopeUrl = new URL(PAGE, self.location).href;
const pageFileUrl = new URL(PAGE_FILE, self.location).href;
const assetUrls = ASSETS.map(function (a) { return new URL(a, self.location).href; });

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // no-cache: не брать устаревшие копии из HTTP-кэша браузера
      const files = [PAGE, PAGE_FILE].concat(ASSETS);
      return cache.addAll(files.map(function (f) { return new Request(f, { cache: 'no-cache' }); }));
    }).then(precachePhotos).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key.indexOf(CACHE_PREFIX) === 0 && key !== CACHE) return caches.delete(key);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // wa.me, 2ГИС, Instagram — без service worker

  const path = url.origin + url.pathname;
  if (req.mode === 'navigate' || path === scopeUrl || path === pageFileUrl) {
    event.respondWith(pageResponse(event, req));
  } else if (assetUrls.indexOf(path) !== -1) {
    event.respondWith(assetResponse(req));
  } else if (path.indexOf(photosUrl) === 0) {
    event.respondWith(photoResponse(req));
  }
});

// Ответ после перенаправления нельзя отдавать на переход по странице (Safari) — копируем без него
function clean(res) {
  if (!res.redirected) return Promise.resolve(res);
  return res.blob().then(function (body) {
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  });
}

function fromCache(req) {
  return caches.match(req, { ignoreSearch: true }).then(function (res) {
    return res || caches.match(PAGE);
  });
}

function pageResponse(event, req) {
  const net = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
    .then(function (res) {
      if (!res.ok) return null;
      return clean(res).then(function (fresh) {
        const copy = fresh.clone();
        // Обновить кэш, даже если сеть ответила позже таймаута
        event.waitUntil(caches.open(CACHE).then(function (cache) {
          return Promise.all([cache.put(PAGE, copy.clone()), cache.put(PAGE_FILE, copy)]);
        }));
        return fresh;
      });
    })
    .catch(function () { return null; });
  event.waitUntil(net);

  const timeout = new Promise(function (resolve) { setTimeout(resolve, NET_TIMEOUT, null); });
  return Promise.race([net, timeout])
    .then(function (res) { return res || fromCache(req); })
    // В кэше пусто (самое первое открытие) — ждём сеть сколько потребуется
    .then(function (res) { return res || net; })
    .then(function (res) { return res || fetch(req); });
}

function assetResponse(req) {
  return caches.match(req, { ignoreSearch: true }).then(function (res) {
    if (res) return res;
    return fetch(req).then(function (fresh) {
      if (fresh.ok) {
        const copy = fresh.clone();
        caches.open(CACHE).then(function (cache) { return cache.put(req, copy); });
      }
      return fresh;
    });
  });
}

// ─────────── Фото меню кафе (photos/…) ───────────
// Вставляет сборка (tools/build.js, место PHOTO_SW в sw.js) только у кафе. Список PHOTO_PRECACHE — фото разделов (плитки и шапки
// категорий): загружаются при установке, по одному — сломанный файл не мешает остальным. Фото блюд не загружаются заранее:
// «сначала кэш, потом сеть», удачный ответ сохраняется в тот же кэш (CACHE). Без сети и без копии — пустой ответ:
// картинка не загрузится, на сайте останется рисунок (без сетевой ошибки в консоли).
const PHOTO_PRECACHE = [
  './photos/01-zavtraki-t.webp',
  './photos/01-zavtraki.webp',
  './photos/02-pervye-blyuda-t.webp',
  './photos/02-pervye-blyuda.webp',
  './photos/03-vtorye-blyuda-t.webp',
  './photos/03-vtorye-blyuda.webp',
  './photos/04-goryachie-blyuda-t.webp',
  './photos/04-goryachie-blyuda.webp',
  './photos/05-lagmany-t.webp',
  './photos/05-lagmany.webp',
  './photos/06-sety-t.webp',
  './photos/06-sety.webp',
  './photos/07-salaty-t.webp',
  './photos/07-salaty.webp',
  './photos/08-garniry-t.webp',
  './photos/08-garniry.webp',
  './photos/09-doner-shaurma-t.webp',
  './photos/09-doner-shaurma.webp',
  './photos/10-pizza-t.webp',
  './photos/10-pizza.webp',
  './photos/11-chay-kofe-t.webp',
  './photos/11-chay-kofe.webp',
  './photos/12-napitki-t.webp',
  './photos/12-napitki.webp'
];
const photosUrl = new URL('./photos/', self.location).href;

function precachePhotos() {
  return caches.open(CACHE).then(function (cache) {
    return Promise.all(PHOTO_PRECACHE.map(function (f) {
      return cache.add(new Request(f, { cache: 'no-cache' })).catch(function () { /* загрузится при просмотре */ });
    }));
  });
}

function photoResponse(req) {
  return caches.match(req, { ignoreSearch: true }).then(function (res) {
    if (res) return res;
    return fetch(req).then(function (fresh) {
      if (fresh.ok) {
        const copy = fresh.clone();
        return caches.open(CACHE).then(function (cache) { return cache.put(req, copy); }).then(function () { return fresh; }, function () { return fresh; });
      }
      return fresh;
    }).catch(function () {
      return new Response('', { status: 200, headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'no-store' } });
    });
  });
}

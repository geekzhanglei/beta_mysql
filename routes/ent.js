const router = require('koa-router')();
const { requestTmdb, requestTmdbImage, DEFAULT_REGION, DEFAULT_TIMEZONE } = require('../services/tmdbClient');
const {
    getApiCacheEntry,
    setApiCache,
    upsertMediaList,
    upsertCalendarList,
    getSeasonCache,
    upsertSeasonPayload,
    upsertEpisodePayload,
    getEpisodeCacheByAirDate
} = require('../services/tmdbStore');
const { normalizeList, normalizeDetail, normalizeEpisode, normalizeSeason } = require('../services/tmdbFormatter');

const TTL = {
    TODAY: 6 * 60 * 60,
    LIST: 12 * 60 * 60,
    DETAIL: 24 * 60 * 60,
    TRENDING: 6 * 60 * 60,
    SEASON: 12 * 60 * 60,
    EPISODE_CALENDAR: 3 * 60 * 60
};
const STALE_REFRESH_TIMEOUT = Number(process.env.TMDB_STALE_REFRESH_TIMEOUT || 1000);
const EPISODE_CALENDAR_CACHE_VERSION = 'v4';
const MOVIE_LIST_CACHE_VERSION = 'v1';
const MOVIE_PAGE_LIMIT = Math.min(Math.max(Number(process.env.TMDB_MOVIE_PAGE_LIMIT || 5), 1), 10);
const TV_CALENDAR_PAGE_LIMIT = Math.min(Math.max(Number(process.env.TMDB_TV_CALENDAR_PAGE_LIMIT || 5), 1), 10);
const EXCLUDED_TV_GENRE_IDS = [10763, 10764, 10767];
const refreshTasks = new Map();

router.prefix('/blogapi/ent');

const IMAGE_SIZE_RE = /^[a-zA-Z0-9_]+$/;
const IMAGE_FILE_RE = /^[a-zA-Z0-9._-]+$/;

function getPage(ctx) {
    const page = Number(ctx.request.query.page || 1);
    return page > 0 ? page : 1;
}

function getRegion(ctx) {
    return String(ctx.request.query.region || DEFAULT_REGION).toUpperCase();
}

function getTimezone(ctx) {
    return String(ctx.request.query.timezone || DEFAULT_TIMEZONE);
}

function dateToValue(date) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
    ].join('-');
}

function shiftDate(value, offset) {
    const parts = String(value || '').split('-').map(Number);
    const date = new Date(parts[0], parts[1] - 1, parts[2] + offset);

    return dateToValue(date);
}

function getTodayValue(timezone) {
    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone || DEFAULT_TIMEZONE,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(new Date()).reduce((result, part) => {
            result[part.type] = part.value;
            return result;
        }, {});

        return parts.year + '-' + parts.month + '-' + parts.day;
    } catch (err) {
        return dateToValue(new Date());
    }
}

function getDateParam(ctx) {
    const value = String(ctx.request.query.date || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
    }

    return getTodayValue(getTimezone(ctx));
}

function getTimezoneOffsetMinutes(timezone, dateValue) {
    try {
        const date = new Date(dateValue + 'T12:00:00Z');
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone || DEFAULT_TIMEZONE,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).formatToParts(date).reduce((result, part) => {
            result[part.type] = part.value;
            return result;
        }, {});
        const zonedTime = Date.UTC(
            Number(parts.year),
            Number(parts.month) - 1,
            Number(parts.day),
            Number(parts.hour),
            Number(parts.minute),
            Number(parts.second)
        );

        return Math.round((zonedTime - date.getTime()) / 60000);
    } catch (err) {
        return 0;
    }
}

function getAirDateCandidates(date, timezone) {
    const candidates = [date];
    const offset = getTimezoneOffsetMinutes(timezone, date);

    if (offset > 0) {
        candidates.push(shiftDate(date, -1));
    } else if (offset < 0) {
        candidates.push(shiftDate(date, 1));
    }

    return Array.from(new Set(candidates));
}

function getEpisodeCalendarTtl(date, timezone) {
    const today = getTodayValue(timezone);

    if (date === today) {
        return 60 * 60;
    }
    if (date < today) {
        return 24 * 60 * 60;
    }
    return 12 * 60 * 60;
}

function makeCacheKey(name, params) {
    const keys = Object.keys(params).sort();
    const query = keys.map(key => key + '=' + params[key]).join('&');
    return name + ':' + query;
}

function withTimeout(promise, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            const error = new Error('cache refresh timeout');
            error.isTimeout = true;
            reject(error);
        }, timeoutMs);

        promise.then(
            value => {
                clearTimeout(timer);
                resolve(value);
            },
            err => {
                clearTimeout(timer);
                reject(err);
            }
        );
    });
}

function runRefreshTask(cacheKey, refreshFn) {
    if (refreshTasks.has(cacheKey)) {
        return refreshTasks.get(cacheKey);
    }

    const task = refreshFn()
        .catch(err => {
            console.error('[ent] cache refresh failed', cacheKey, err.message);
            throw err;
        })
        .finally(() => {
            refreshTasks.delete(cacheKey);
        });

    refreshTasks.set(cacheKey, task);
    return task;
}

async function getCachedTmdbPayload(cacheKey, apiPath, params, ttlSeconds, options) {
    const cached = await getApiCacheEntry(cacheKey);
    const refreshPayload = async () => {
        const payload = await requestTmdb(apiPath, params);

        await setApiCache(cacheKey, payload, ttlSeconds);
        if (options && typeof options.onRefreshPayload === 'function') {
            await options.onRefreshPayload(payload);
        }

        return {
            source: 'tmdb',
            payload
        };
    };

    if (cached && cached.isFresh && !(options && options.forceRefresh)) {
        return {
            source: 'cache',
            payload: cached.payload
        };
    }

    if (cached && !(options && options.forceRefresh)) {
        const refreshTask = runRefreshTask(cacheKey, refreshPayload);

        try {
            return await withTimeout(refreshTask, STALE_REFRESH_TIMEOUT);
        } catch (err) {
            return {
                source: 'stale-cache',
                payload: cached.payload,
                refreshPending: true
            };
        }
    }

    return refreshPayload();
}

async function getCachedResponsePayload(cacheKey, createPayload, ttlSeconds) {
    const cached = await getApiCacheEntry(cacheKey);
    const refreshPayload = async () => {
        const payload = await createPayload();

        await setApiCache(cacheKey, payload, ttlSeconds);
        return {
            source: 'tmdb',
            payload
        };
    };

    if (cached && cached.isFresh) {
        return {
            source: 'cache',
            payload: cached.payload
        };
    }

    if (cached) {
        const refreshTask = runRefreshTask(cacheKey, refreshPayload);

        try {
            return await withTimeout(refreshTask, STALE_REFRESH_TIMEOUT);
        } catch (err) {
            return {
                source: 'stale-cache',
                payload: cached.payload,
                refreshPending: true
            };
        }
    }

    return refreshPayload();
}

function ok(ctx, data, source) {
    ctx.body = {
        code: 0,
        data: Object.assign({ source }, data)
    };
}

function fail(ctx, err) {
    console.error('[ent]', err.message);
    ctx.status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    ctx.body = {
        code: 1,
        msg: err.publicMessage || '影视数据接口暂时不可用'
    };
}

function isScriptedTvItem(item) {
    const genreIds = Array.isArray(item && item.genreIds) ? item.genreIds : [];

    return !genreIds.some(id => EXCLUDED_TV_GENRE_IDS.indexOf(Number(id)) !== -1);
}

function filterPublicList(data, mediaType) {
    if (mediaType !== 'tv' || !Array.isArray(data.list)) {
        return data;
    }

    data.list = data.list.filter(isScriptedTvItem);
    data.totalResults = data.list.length;
    return data;
}

function sortListByRating(data) {
    if (!Array.isArray(data.list)) {
        return data;
    }

    data.list = data.list.slice().sort((a, b) => {
        const ratingDiff = Number(b.voteAverage || 0) - Number(a.voteAverage || 0);

        if (ratingDiff) {
            return ratingDiff;
        }
        return Number(b.popularity || 0) - Number(a.popularity || 0);
    });
    return data;
}

function sortMovieListByDate(data) {
    if (!Array.isArray(data.list)) {
        return data;
    }

    data.list = data.list.slice().sort((a, b) => {
        const aTime = Date.parse(a.releaseDate || '') || Number.MAX_SAFE_INTEGER;
        const bTime = Date.parse(b.releaseDate || '') || Number.MAX_SAFE_INTEGER;

        if (aTime !== bTime) {
            return aTime - bTime;
        }
        return Number(b.voteAverage || 0) - Number(a.voteAverage || 0);
    });
    return data;
}

function mergePagedPayloads(payloads) {
    const seen = new Set();
    const results = [];

    payloads.forEach(payload => {
        (Array.isArray(payload && payload.results) ? payload.results : []).forEach(item => {
            if (!item || seen.has(item.id)) {
                return;
            }
            seen.add(item.id);
            results.push(item);
        });
    });

    return {
        page: 1,
        total_pages: Math.max.apply(null, payloads.map(payload => Number(payload.total_pages || 0)).concat([1])),
        total_results: results.length,
        results
    };
}

async function listHandler(ctx, options) {
    try {
        const cachedResult = await getCachedTmdbPayload(options.cacheKey, options.apiPath, options.params, options.ttl, {
            onRefreshPayload: async payload => {
                const items = Array.isArray(payload.results) ? payload.results : [];

                await upsertMediaList(items, options.mediaType);
                if (options.calendar) {
                    await upsertCalendarList(items, options.calendar);
                }
            }
        });
        const payload = cachedResult.payload;
        const data = filterPublicList(normalizeList(payload, options.mediaType), options.mediaType);

        ok(ctx, data, cachedResult.source);
    } catch (err) {
        fail(ctx, err);
    }
}

async function getPagedTmdbPayload(options) {
    const payloads = [];

    for (let page = 1; page <= options.pageLimit; page++) {
        const pageParams = Object.assign({}, options.params, { page });
        const cachedResult = await getCachedTmdbPayload(
            makeCacheKey(options.cacheName, pageParams),
            options.apiPath,
            pageParams,
            options.ttl,
            {
                forceRefresh: true,
                onRefreshPayload: async payload => {
                    const items = Array.isArray(payload.results) ? payload.results : [];

                    await upsertMediaList(items, options.mediaType);
                    if (options.calendar) {
                        await upsertCalendarList(items, options.calendar);
                    }
                }
            }
        );

        payloads.push(cachedResult.payload);

        if (page >= Number(cachedResult.payload.total_pages || 0)) {
            break;
        }
    }

    return mergePagedPayloads(payloads);
}

async function getMovieListResponse(options) {
    const responseCacheKey = makeCacheKey(options.cacheName + '_aggregate', Object.assign({}, options.params, {
        pageLimit: MOVIE_PAGE_LIMIT,
        version: MOVIE_LIST_CACHE_VERSION
    }));

    return getCachedResponsePayload(responseCacheKey, async () => {
        const payload = await getPagedTmdbPayload({
            apiPath: options.apiPath,
            cacheName: options.cacheName,
            params: options.params,
            ttl: options.ttl,
            mediaType: 'movie',
            pageLimit: MOVIE_PAGE_LIMIT,
            calendar: options.calendar
        });
        let normalized = normalizeList(payload, 'movie');

        if (options.sortMode === 'date') {
            normalized = sortMovieListByDate(normalized);
        } else {
            normalized = sortListByRating(normalized);
        }

        normalized.scannedPages = MOVIE_PAGE_LIMIT;
        return normalized;
    }, options.ttl);
}

async function getTvCalendarPayload(params, date, ttlSeconds) {
    return getPagedTmdbPayload({
        apiPath: '/discover/tv',
        cacheName: 'tv_calendar',
        params,
        ttl: ttlSeconds,
        mediaType: 'tv',
        pageLimit: TV_CALENDAR_PAGE_LIMIT,
        calendar: {
            mediaType: 'tv',
            eventType: 'calendar',
            eventDate: date,
            timezone: params.timezone
        }
    });
}

function sameDate(value, date) {
    return value && String(value).slice(0, 10) === date;
}

function hasAirDate(value, candidates) {
    return value && candidates.indexOf(String(value).slice(0, 10)) !== -1;
}

function markCalendarEpisode(episode, calendarDate) {
    if (!episode) {
        return null;
    }

    episode.calendarDate = calendarDate;
    episode.isTimezoneShifted = !!episode.airDate && episode.airDate !== calendarDate;
    return episode;
}

function markCalendarItem(item, calendarDate, timezone) {
    item.calendarDate = calendarDate;
    item.timezone = timezone;
    item.episodes = (item.episodes || []).map(episode => markCalendarEpisode(episode, calendarDate)).filter(Boolean);
    item.episode = item.episode ? markCalendarEpisode(item.episode, calendarDate) : null;
    return item;
}

function getEpisodeResolveLimit(ctx) {
    const configured = Number(process.env.TMDB_EPISODE_RESOLVE_LIMIT || 40);
    const requested = Number(ctx.request.query.episodeLimit || configured);
    const limit = requested > 0 ? requested : configured;

    return Math.min(limit, 60);
}

async function upsertDetailEpisodes(tvId, payload) {
    const episodes = [payload && payload.last_episode_to_air, payload && payload.next_episode_to_air].filter(Boolean);

    for (let i = 0; i < episodes.length; i++) {
        try {
            await upsertEpisodePayload(tvId, episodes[i], TTL.SEASON);
        } catch (err) {
            console.error('[ent] episode cache write skipped', tvId, err.message);
        }
    }
}

async function getTvDetailPayload(id) {
    const params = {
        append_to_response: 'content_ratings,external_ids'
    };
    const persistPayload = async payload => {
        await upsertMediaList([payload], 'tv');
        await upsertDetailEpisodes(id, payload);
    };
    const cachedResult = await getCachedTmdbPayload(makeCacheKey('tv_detail', { id }), '/tv/' + id, params, TTL.DETAIL, {
        onRefreshPayload: persistPayload
    });

    if (cachedResult.source !== 'tmdb') {
        await persistPayload(cachedResult.payload);
    }

    return cachedResult;
}

async function getTvSeasonPayload(id, seasonNumber) {
    let seasonCache = null;

    try {
        seasonCache = await getSeasonCache(id, seasonNumber);
    } catch (err) {
        console.error('[ent] season cache read skipped', id, seasonNumber, err.message);
    }

    if (seasonCache) {
        return {
            source: 'cache',
            payload: seasonCache
        };
    }

    const persistPayload = async payload => {
        try {
            await upsertSeasonPayload(id, payload, TTL.SEASON);
        } catch (err) {
            console.error('[ent] season cache write skipped', id, seasonNumber, err.message);
        }
    };
    const cachedResult = await getCachedTmdbPayload(
        makeCacheKey('tv_season', { id, seasonNumber }),
        '/tv/' + id + '/season/' + seasonNumber,
        {},
        TTL.SEASON,
        {
            onRefreshPayload: persistPayload
        }
    );

    if (cachedResult.source !== 'tmdb') {
        await persistPayload(cachedResult.payload);
    }

    return cachedResult;
}

function chooseSeasonNumberForDate(detailPayload, date, airDateCandidates) {
    const nextEpisode = detailPayload.next_episode_to_air;
    const lastEpisode = detailPayload.last_episode_to_air;

    if (hasAirDate(nextEpisode && nextEpisode.air_date, airDateCandidates)) {
        return Number(nextEpisode.season_number || 0);
    }
    if (hasAirDate(lastEpisode && lastEpisode.air_date, airDateCandidates)) {
        return Number(lastEpisode.season_number || 0);
    }

    const seasons = Array.isArray(detailPayload.seasons) ? detailPayload.seasons : [];
    const regularSeasons = seasons
        .filter(item => Number(item.season_number) > 0)
        .sort((a, b) => Number(b.season_number || 0) - Number(a.season_number || 0));
    const airedSeasons = regularSeasons.filter(item => item.air_date && item.air_date <= date);

    if (airedSeasons.length) {
        return Number(airedSeasons[0].season_number || 0);
    }
    if (regularSeasons.length) {
        return Number(regularSeasons[0].season_number || 0);
    }

    return 0;
}

async function findEpisodesForDate(tvId, date, timezone, detailPayload) {
    const airDateCandidates = getAirDateCandidates(date, timezone);
    let episodeCache = [];

    try {
        for (let i = 0; i < airDateCandidates.length; i++) {
            episodeCache = episodeCache.concat(await getEpisodeCacheByAirDate(tvId, airDateCandidates[i]));
        }
    } catch (err) {
        console.error('[ent] episode cache read skipped', tvId, date, err.message);
    }

    if (episodeCache.length) {
        return episodeCache.map(item => markCalendarEpisode(normalizeEpisode(item, tvId), date)).filter(Boolean);
    }

    const detailEpisodes = [detailPayload.next_episode_to_air, detailPayload.last_episode_to_air]
        .filter(item => hasAirDate(item && item.air_date, airDateCandidates));

    if (detailEpisodes.length) {
        for (let i = 0; i < detailEpisodes.length; i++) {
            try {
                await upsertEpisodePayload(tvId, detailEpisodes[i], TTL.SEASON);
            } catch (err) {
                console.error('[ent] episode cache write skipped', tvId, err.message);
            }
        }
        return detailEpisodes.map(item => markCalendarEpisode(normalizeEpisode(item, tvId), date)).filter(Boolean);
    }

    const seasonNumber = chooseSeasonNumberForDate(detailPayload, date, airDateCandidates);

    if (!seasonNumber) {
        return [];
    }

    const seasonResult = await getTvSeasonPayload(tvId, seasonNumber);
    const episodes = Array.isArray(seasonResult.payload.episodes) ? seasonResult.payload.episodes : [];

    return episodes
        .filter(item => hasAirDate(item.air_date, airDateCandidates))
        .map(item => markCalendarEpisode(normalizeEpisode(Object.assign({}, item, { season_number: item.season_number || seasonNumber }), tvId), date))
        .filter(Boolean);
}

async function enrichEpisodeCalendarList(list, date, timezone, episodeResolveLimit) {
    const resolved = [];

    for (let i = 0; i < list.length; i++) {
        const item = Object.assign({}, list[i]);

        item.episodes = [];
        item.episode = null;
        item.hasEpisode = false;
        item.episodeText = '';
        item.calendarDate = date;
        item.timezone = timezone;

        if (i < episodeResolveLimit) {
            try {
                const detailResult = await getTvDetailPayload(item.id);
                const episodes = await findEpisodesForDate(item.id, date, timezone, detailResult.payload);

                item.episodes = episodes;
                item.episode = episodes[0] || null;
                item.hasEpisode = !!episodes.length;
                item.episodeText = item.episode ? item.episode.label : '';
            } catch (err) {
                console.error('[ent] episode resolve skipped', item.id, err.message);
            }
        }

        resolved.push(item);
    }

    return resolved;
}

router.get('/health', async ctx => {
    ctx.body = {
        code: 0,
        data: {
            service: 'ent',
            cacheDatabase: process.env.TMDB_DB_DATABASE || 'tmdb_movie_calendar'
        }
    };
});

router.get('/image/:size/:file', async ctx => {
    const size = String(ctx.params.size || '');
    const file = String(ctx.params.file || '');

    if (!IMAGE_SIZE_RE.test(size) || !IMAGE_FILE_RE.test(file)) {
        ctx.status = 400;
        ctx.body = { code: 1, msg: '图片参数不合法' };
        return;
    }

    try {
        const image = await requestTmdbImage(size, file);

        ctx.type = image.contentType;
        ctx.set('Cache-Control', image.cacheControl);
        ctx.body = image.body;
    } catch (err) {
        fail(ctx, err);
    }
});

router.get('/movies/now-playing', async ctx => {
    const params = {
        region: getRegion(ctx)
    };

    try {
        const result = await getMovieListResponse({
            apiPath: '/movie/now_playing',
            cacheName: 'movie_now_playing',
            params,
            ttl: TTL.TODAY,
            sortMode: 'rating',
            calendar: {
                mediaType: 'movie',
                eventType: 'now_playing',
                region: params.region
            }
        });

        ok(ctx, result.payload, result.source);
    } catch (err) {
        fail(ctx, err);
    }
});

router.get('/movies/upcoming', async ctx => {
    const params = {
        region: getRegion(ctx)
    };

    try {
        const result = await getMovieListResponse({
            apiPath: '/movie/upcoming',
            cacheName: 'movie_upcoming',
            params,
            ttl: TTL.LIST,
            sortMode: 'date',
            calendar: {
                mediaType: 'movie',
                eventType: 'upcoming',
                region: params.region
            }
        });

        ok(ctx, result.payload, result.source);
    } catch (err) {
        fail(ctx, err);
    }
});

router.get('/movies/trending', async ctx => {
    const window = ctx.request.query.window === 'week' ? 'week' : 'day';
    const params = {};

    try {
        const result = await getMovieListResponse({
            apiPath: '/trending/movie/' + window,
            cacheName: 'movie_trending_' + window,
            params,
            ttl: TTL.TRENDING,
            sortMode: 'rating'
        });

        ok(ctx, result.payload, result.source);
    } catch (err) {
        fail(ctx, err);
    }
});

router.get('/movie/:id', async ctx => {
    const id = Number(ctx.params.id);

    if (!id) {
        ctx.status = 400;
        ctx.body = { code: 1, msg: '电影 id 不合法' };
        return;
    }

    const params = {};
    const cacheKey = makeCacheKey('movie_detail', { id });

    try {
        const cachedResult = await getCachedTmdbPayload(cacheKey, '/movie/' + id, params, TTL.DETAIL, {
            onRefreshPayload: async payload => {
                await upsertMediaList([payload], 'movie');
            }
        });
        ok(ctx, { detail: normalizeDetail(cachedResult.payload, 'movie') }, cachedResult.source);
    } catch (err) {
        fail(ctx, err);
    }
});

router.get('/tv/airing-today', async ctx => {
    const params = {
        page: getPage(ctx),
        timezone: getTimezone(ctx)
    };

    await listHandler(ctx, {
        apiPath: '/tv/airing_today',
        cacheKey: makeCacheKey('tv_airing_today', params),
        params,
        ttl: TTL.TODAY,
        mediaType: 'tv',
        calendar: {
            mediaType: 'tv',
            eventType: 'airing_today',
            eventDate: getDateParam(ctx),
            timezone: params.timezone
        }
    });
});

router.get('/tv/on-air', async ctx => {
    const params = {
        page: getPage(ctx),
        timezone: getTimezone(ctx)
    };

    await listHandler(ctx, {
        apiPath: '/tv/on_the_air',
        cacheKey: makeCacheKey('tv_on_air', params),
        params,
        ttl: TTL.LIST,
        mediaType: 'tv',
        calendar: {
            mediaType: 'tv',
            eventType: 'on_air',
            timezone: params.timezone
        }
    });
});

router.get('/tv/calendar', async ctx => {
    const date = getDateParam(ctx);
    const params = {
        page: getPage(ctx),
        timezone: getTimezone(ctx),
        'air_date.gte': date,
        'air_date.lte': date,
        sort_by: 'popularity.desc'
    };

    await listHandler(ctx, {
        apiPath: '/discover/tv',
        cacheKey: makeCacheKey('tv_calendar', params),
        params,
        ttl: TTL.TODAY,
        mediaType: 'tv',
        calendar: {
            mediaType: 'tv',
            eventType: 'calendar',
            eventDate: date,
            timezone: params.timezone
        }
    });
});

router.get('/tv/episode-calendar', async ctx => {
    const date = getDateParam(ctx);
    const episodeResolveLimit = getEpisodeResolveLimit(ctx);
    const params = {
        timezone: getTimezone(ctx),
        'air_date.gte': date,
        'air_date.lte': date,
        sort_by: 'popularity.desc'
    };
    const responseCacheKey = makeCacheKey('tv_episode_calendar', Object.assign({}, params, {
        episodeResolveLimit,
        pageLimit: TV_CALENDAR_PAGE_LIMIT,
        version: EPISODE_CALENDAR_CACHE_VERSION
    }));
    const responseTtl = getEpisodeCalendarTtl(date, params.timezone);

    try {
        const responseResult = await getCachedResponsePayload(responseCacheKey, async () => {
            const payload = await getTvCalendarPayload(params, date, TTL.TODAY);
            const normalized = sortListByRating(filterPublicList(normalizeList(payload, 'tv'), 'tv'));
            const list = await enrichEpisodeCalendarList(normalized.list, date, params.timezone, episodeResolveLimit);

            return {
                page: normalized.page,
                totalPages: normalized.totalPages,
                totalResults: normalized.totalResults,
                scannedPages: TV_CALENDAR_PAGE_LIMIT,
                episodeResolveLimit,
                episodeResolvedCount: list.filter(item => item.hasEpisode).length,
                list: list.map(item => markCalendarItem(item, date, params.timezone))
            };
        }, responseTtl);

        ok(ctx, responseResult.payload, responseResult.source);
    } catch (err) {
        fail(ctx, err);
    }
});

router.get('/tv/:id/season/:seasonNumber', async ctx => {
    const id = Number(ctx.params.id);
    const seasonNumber = Number(ctx.params.seasonNumber);

    if (!id || !seasonNumber) {
        ctx.status = 400;
        ctx.body = { code: 1, msg: '剧集季数参数不合法' };
        return;
    }

    try {
        const cachedResult = await getTvSeasonPayload(id, seasonNumber);
        ok(ctx, { season: normalizeSeason(cachedResult.payload, id) }, cachedResult.source);
    } catch (err) {
        fail(ctx, err);
    }
});

router.get('/tv/:id', async ctx => {
    const id = Number(ctx.params.id);

    if (!id) {
        ctx.status = 400;
        ctx.body = { code: 1, msg: '剧集 id 不合法' };
        return;
    }

    try {
        const cachedResult = await getTvDetailPayload(id);
        ok(ctx, { detail: normalizeDetail(cachedResult.payload, 'tv') }, cachedResult.source);
    } catch (err) {
        fail(ctx, err);
    }
});

module.exports = router;

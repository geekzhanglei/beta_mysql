const router = require('koa-router')();
const { requestTmdb, DEFAULT_REGION, DEFAULT_TIMEZONE } = require('../services/tmdbClient');
const { getApiCache, setApiCache, upsertMediaList, upsertCalendarList } = require('../services/tmdbStore');
const { normalizeList, normalizeDetail } = require('../services/tmdbFormatter');

const TTL = {
    TODAY: 6 * 60 * 60,
    LIST: 12 * 60 * 60,
    DETAIL: 24 * 60 * 60,
    TRENDING: 6 * 60 * 60
};

router.prefix('/blogapi/ent');

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

function getDateParam(ctx) {
    const value = String(ctx.request.query.date || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
    }

    return new Date().toISOString().slice(0, 10);
}

function makeCacheKey(name, params) {
    const keys = Object.keys(params).sort();
    const query = keys.map(key => key + '=' + params[key]).join('&');
    return name + ':' + query;
}

async function getCachedTmdbPayload(cacheKey, apiPath, params, ttlSeconds) {
    const cached = await getApiCache(cacheKey);

    if (cached) {
        return {
            source: 'cache',
            payload: cached
        };
    }

    const payload = await requestTmdb(apiPath, params);
    await setApiCache(cacheKey, payload, ttlSeconds);

    return {
        source: 'tmdb',
        payload
    };
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

async function listHandler(ctx, options) {
    try {
        const cachedResult = await getCachedTmdbPayload(options.cacheKey, options.apiPath, options.params, options.ttl);
        const payload = cachedResult.payload;
        const items = Array.isArray(payload.results) ? payload.results : [];

        if (cachedResult.source === 'tmdb') {
            await upsertMediaList(items, options.mediaType);
            if (options.calendar) {
                await upsertCalendarList(items, options.calendar);
            }
        }

        ok(ctx, normalizeList(payload, options.mediaType), cachedResult.source);
    } catch (err) {
        fail(ctx, err);
    }
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

router.get('/movies/now-playing', async ctx => {
    const params = {
        page: getPage(ctx),
        region: getRegion(ctx)
    };

    await listHandler(ctx, {
        apiPath: '/movie/now_playing',
        cacheKey: makeCacheKey('movie_now_playing', params),
        params,
        ttl: TTL.TODAY,
        mediaType: 'movie',
        calendar: {
            mediaType: 'movie',
            eventType: 'now_playing',
            region: params.region
        }
    });
});

router.get('/movies/upcoming', async ctx => {
    const params = {
        page: getPage(ctx),
        region: getRegion(ctx)
    };

    await listHandler(ctx, {
        apiPath: '/movie/upcoming',
        cacheKey: makeCacheKey('movie_upcoming', params),
        params,
        ttl: TTL.LIST,
        mediaType: 'movie',
        calendar: {
            mediaType: 'movie',
            eventType: 'upcoming',
            region: params.region
        }
    });
});

router.get('/movies/trending', async ctx => {
    const window = ctx.request.query.window === 'week' ? 'week' : 'day';
    const params = {
        page: getPage(ctx)
    };

    await listHandler(ctx, {
        apiPath: '/trending/movie/' + window,
        cacheKey: makeCacheKey('movie_trending_' + window, params),
        params,
        ttl: TTL.TRENDING,
        mediaType: 'movie'
    });
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
        const cachedResult = await getCachedTmdbPayload(cacheKey, '/movie/' + id, params, TTL.DETAIL);
        if (cachedResult.source === 'tmdb') {
            await upsertMediaList([cachedResult.payload], 'movie');
        }
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

router.get('/tv/:id', async ctx => {
    const id = Number(ctx.params.id);

    if (!id) {
        ctx.status = 400;
        ctx.body = { code: 1, msg: '剧集 id 不合法' };
        return;
    }

    const params = {
        append_to_response: 'content_ratings,external_ids'
    };
    const cacheKey = makeCacheKey('tv_detail', { id });

    try {
        const cachedResult = await getCachedTmdbPayload(cacheKey, '/tv/' + id, params, TTL.DETAIL);
        if (cachedResult.source === 'tmdb') {
            await upsertMediaList([cachedResult.payload], 'tv');
        }
        ok(ctx, { detail: normalizeDetail(cachedResult.payload, 'tv') }, cachedResult.source);
    } catch (err) {
        fail(ctx, err);
    }
});

module.exports = router;

const { tmdbQuery } = require('../utils/tmdbQuery');

function toMysqlDatetime(date) {
    const pad = num => String(num).padStart(2, '0');
    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate())
    ].join('-') + ' ' + [
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds())
    ].join(':');
}

async function getApiCache(cacheKey) {
    const rows = await tmdbQuery(
        'SELECT payload_json, expires_at FROM tmdb_api_cache WHERE cache_key = ? LIMIT 1',
        [cacheKey]
    );

    if (!rows.length || new Date(rows[0].expires_at).getTime() <= Date.now()) {
        return null;
    }

    return JSON.parse(rows[0].payload_json);
}

async function setApiCache(cacheKey, payload, ttlSeconds) {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await tmdbQuery(
        'INSERT INTO tmdb_api_cache (cache_key, payload_json, expires_at) VALUES (?, ?, ?) ' +
            'ON DUPLICATE KEY UPDATE payload_json = VALUES(payload_json), expires_at = VALUES(expires_at), updated_at = CURRENT_TIMESTAMP',
        [cacheKey, JSON.stringify(payload), toMysqlDatetime(expiresAt)]
    );
}

async function upsertMedia(item, mediaType) {
    if (!item || !item.id) {
        return;
    }

    await tmdbQuery(
        'INSERT INTO tmdb_media ' +
            '(tmdb_id, media_type, title, original_title, overview, poster_path, backdrop_path, release_date, first_air_date, vote_average, popularity, origin_country, original_language, raw_json) ' +
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
            'ON DUPLICATE KEY UPDATE title = VALUES(title), original_title = VALUES(original_title), overview = VALUES(overview), poster_path = VALUES(poster_path), ' +
            'backdrop_path = VALUES(backdrop_path), release_date = VALUES(release_date), first_air_date = VALUES(first_air_date), vote_average = VALUES(vote_average), ' +
            'popularity = VALUES(popularity), origin_country = VALUES(origin_country), original_language = VALUES(original_language), raw_json = VALUES(raw_json), updated_at = CURRENT_TIMESTAMP',
        [
            item.id,
            mediaType,
            mediaType === 'movie' ? item.title : item.name,
            mediaType === 'movie' ? item.original_title : item.original_name,
            item.overview || '',
            item.poster_path || '',
            item.backdrop_path || '',
            item.release_date || null,
            item.first_air_date || null,
            item.vote_average || 0,
            item.popularity || 0,
            item.origin_country ? item.origin_country.join(',') : '',
            item.original_language || '',
            JSON.stringify(item)
        ]
    );
}

async function upsertMediaList(items, mediaType) {
    const list = Array.isArray(items) ? items : [];

    for (let i = 0; i < list.length; i++) {
        await upsertMedia(list[i], mediaType);
    }
}

async function upsertCalendarItem(item, options) {
    if (!item || !item.id || !options.eventDate) {
        return;
    }

    await tmdbQuery(
        'INSERT INTO tmdb_calendar_item ' +
            '(tmdb_id, media_type, event_type, event_date, region, timezone, title, poster_path, payload_json) ' +
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
            'ON DUPLICATE KEY UPDATE title = VALUES(title), poster_path = VALUES(poster_path), payload_json = VALUES(payload_json), updated_at = CURRENT_TIMESTAMP',
        [
            item.id,
            options.mediaType,
            options.eventType,
            options.eventDate,
            options.region || '',
            options.timezone || '',
            options.mediaType === 'movie' ? item.title : item.name,
            item.poster_path || '',
            JSON.stringify(item)
        ]
    );
}

async function upsertCalendarList(items, options) {
    const list = Array.isArray(items) ? items : [];

    for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const eventDate = options.eventDate || item.release_date || item.first_air_date;
        await upsertCalendarItem(item, Object.assign({}, options, { eventDate }));
    }
}

module.exports = {
    getApiCache,
    setApiCache,
    upsertMediaList,
    upsertCalendarList
};

const { tmdbQuery } = require('../utils/tmdbQuery');

let episodeSchemaReady = false;

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

function toMysqlDate(value) {
    if (!value) {
        return null;
    }
    if (typeof value === 'string') {
        return value.slice(0, 10);
    }
    if (value instanceof Date) {
        const pad = num => String(num).padStart(2, '0');
        return [
            value.getFullYear(),
            pad(value.getMonth() + 1),
            pad(value.getDate())
        ].join('-');
    }
    return String(value).slice(0, 10);
}

function parseJson(value) {
    try {
        return value ? JSON.parse(value) : null;
    } catch (err) {
        return null;
    }
}

async function ensureEpisodeTables() {
    if (episodeSchemaReady) {
        return;
    }

    if (process.env.TMDB_ENSURE_EPISODE_TABLES !== '1') {
        episodeSchemaReady = true;
        return;
    }

    await tmdbQuery(
        'CREATE TABLE IF NOT EXISTS tmdb_tv_season (' +
            'id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, ' +
            'tv_id INT UNSIGNED NOT NULL, ' +
            'season_number INT NOT NULL, ' +
            'name VARCHAR(255) NOT NULL DEFAULT \'\', ' +
            'overview TEXT, ' +
            'poster_path VARCHAR(255) NOT NULL DEFAULT \'\', ' +
            'air_date DATE NULL, ' +
            'episode_count INT UNSIGNED NOT NULL DEFAULT 0, ' +
            'payload_json LONGTEXT, ' +
            'expires_at DATETIME NOT NULL, ' +
            'created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, ' +
            'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, ' +
            'PRIMARY KEY (id), ' +
            'UNIQUE KEY uk_tv_season (tv_id, season_number), ' +
            'KEY idx_tv_season_expires (expires_at)' +
            ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );

    await tmdbQuery(
        'CREATE TABLE IF NOT EXISTS tmdb_tv_episode (' +
            'id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, ' +
            'episode_tmdb_id INT UNSIGNED NOT NULL DEFAULT 0, ' +
            'tv_id INT UNSIGNED NOT NULL, ' +
            'season_number INT NOT NULL, ' +
            'episode_number INT NOT NULL, ' +
            'air_date DATE NULL, ' +
            'name VARCHAR(255) NOT NULL DEFAULT \'\', ' +
            'overview TEXT, ' +
            'still_path VARCHAR(255) NOT NULL DEFAULT \'\', ' +
            'vote_average DECIMAL(4, 2) NOT NULL DEFAULT 0, ' +
            'runtime INT UNSIGNED NOT NULL DEFAULT 0, ' +
            'episode_type VARCHAR(32) NOT NULL DEFAULT \'\', ' +
            'payload_json LONGTEXT, ' +
            'expires_at DATETIME NOT NULL, ' +
            'created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, ' +
            'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, ' +
            'PRIMARY KEY (id), ' +
            'UNIQUE KEY uk_tv_episode (tv_id, season_number, episode_number), ' +
            'KEY idx_tv_air_date (tv_id, air_date), ' +
            'KEY idx_air_date (air_date), ' +
            'KEY idx_tv_episode_expires (expires_at)' +
            ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );

    episodeSchemaReady = true;
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

function episodeRowToPayload(row) {
    const payload = parseJson(row.payload_json) || {};

    return Object.assign({}, payload, {
        id: row.episode_tmdb_id || payload.id || 0,
        show_id: row.tv_id,
        tv_id: row.tv_id,
        season_number: row.season_number,
        episode_number: row.episode_number,
        air_date: toMysqlDate(row.air_date),
        name: row.name || payload.name || '',
        overview: row.overview || payload.overview || '',
        still_path: row.still_path || payload.still_path || '',
        vote_average: row.vote_average || payload.vote_average || 0,
        runtime: row.runtime || payload.runtime || 0,
        episode_type: row.episode_type || payload.episode_type || ''
    });
}

async function getSeasonCache(tvId, seasonNumber) {
    await ensureEpisodeTables();

    const rows = await tmdbQuery(
        'SELECT payload_json FROM tmdb_tv_season WHERE tv_id = ? AND season_number = ? AND expires_at > NOW() LIMIT 1',
        [tvId, seasonNumber]
    );

    return rows.length ? parseJson(rows[0].payload_json) : null;
}

async function upsertEpisodePayload(tvId, episode, ttlSeconds) {
    const seasonNumber = Number(episode && (episode.season_number || episode.seasonNumber));
    const episodeNumber = Number(episode && (episode.episode_number || episode.episodeNumber));

    if (!tvId || !seasonNumber || !episodeNumber) {
        return;
    }

    await ensureEpisodeTables();

    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await tmdbQuery(
        'INSERT INTO tmdb_tv_episode ' +
            '(episode_tmdb_id, tv_id, season_number, episode_number, air_date, name, overview, still_path, vote_average, runtime, episode_type, payload_json, expires_at) ' +
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
            'ON DUPLICATE KEY UPDATE episode_tmdb_id = VALUES(episode_tmdb_id), air_date = VALUES(air_date), name = VALUES(name), overview = VALUES(overview), ' +
            'still_path = VALUES(still_path), vote_average = VALUES(vote_average), runtime = VALUES(runtime), episode_type = VALUES(episode_type), ' +
            'payload_json = VALUES(payload_json), expires_at = VALUES(expires_at), updated_at = CURRENT_TIMESTAMP',
        [
            episode.id || episode.episode_tmdb_id || 0,
            tvId,
            seasonNumber,
            episodeNumber,
            episode.air_date || episode.airDate || null,
            episode.name || episode.title || '',
            episode.overview || '',
            episode.still_path || episode.stillPath || '',
            episode.vote_average || episode.voteAverage || 0,
            episode.runtime || 0,
            episode.episode_type || episode.episodeType || '',
            JSON.stringify(episode),
            toMysqlDatetime(expiresAt)
        ]
    );
}

async function upsertSeasonPayload(tvId, season, ttlSeconds) {
    const seasonNumber = Number(season && season.season_number);

    if (!tvId || !seasonNumber) {
        return;
    }

    await ensureEpisodeTables();

    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const episodes = Array.isArray(season.episodes) ? season.episodes : [];

    await tmdbQuery(
        'INSERT INTO tmdb_tv_season ' +
            '(tv_id, season_number, name, overview, poster_path, air_date, episode_count, payload_json, expires_at) ' +
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
            'ON DUPLICATE KEY UPDATE name = VALUES(name), overview = VALUES(overview), poster_path = VALUES(poster_path), air_date = VALUES(air_date), ' +
            'episode_count = VALUES(episode_count), payload_json = VALUES(payload_json), expires_at = VALUES(expires_at), updated_at = CURRENT_TIMESTAMP',
        [
            tvId,
            seasonNumber,
            season.name || '',
            season.overview || '',
            season.poster_path || '',
            season.air_date || null,
            season.episode_count || episodes.length || 0,
            JSON.stringify(season),
            toMysqlDatetime(expiresAt)
        ]
    );

    for (let i = 0; i < episodes.length; i++) {
        const episode = Object.assign({}, episodes[i], {
            season_number: episodes[i].season_number || seasonNumber
        });
        await upsertEpisodePayload(tvId, episode, ttlSeconds);
    }
}

async function getEpisodeCacheByAirDate(tvId, airDate) {
    await ensureEpisodeTables();

    const rows = await tmdbQuery(
        'SELECT * FROM tmdb_tv_episode WHERE tv_id = ? AND air_date = ? AND expires_at > NOW() ORDER BY season_number ASC, episode_number ASC',
        [tvId, airDate]
    );

    return rows.map(episodeRowToPayload);
}

module.exports = {
    getApiCache,
    setApiCache,
    upsertMediaList,
    upsertCalendarList,
    getSeasonCache,
    upsertSeasonPayload,
    upsertEpisodePayload,
    getEpisodeCacheByAirDate
};

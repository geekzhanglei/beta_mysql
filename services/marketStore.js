const { query } = require('../utils/query');

let schemaReady = false;

function pad(value) {
    return String(value).padStart(2, '0');
}

function toMysqlDatetime(date) {
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

async function ensureMarketCacheTable() {
    if (schemaReady) {
        return;
    }

    await query(
        'CREATE TABLE IF NOT EXISTS market_api_cache (' +
            'id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, ' +
            'cache_key VARCHAR(191) NOT NULL, ' +
            'payload_json LONGTEXT NOT NULL, ' +
            'expires_at DATETIME NOT NULL, ' +
            'created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, ' +
            'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, ' +
            'PRIMARY KEY (id), ' +
            'UNIQUE KEY uk_cache_key (cache_key), ' +
            'KEY idx_expires_at (expires_at)' +
            ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );

    schemaReady = true;
}

async function getMarketCacheEntry(cacheKey) {
    await ensureMarketCacheTable();

    const rows = await query(
        'SELECT payload_json, expires_at FROM market_api_cache WHERE cache_key = ? LIMIT 1',
        [cacheKey]
    );

    if (!rows.length) {
        return null;
    }

    const expiresAt = new Date(rows[0].expires_at).getTime();

    return {
        payload: JSON.parse(rows[0].payload_json),
        expiresAt,
        isFresh: expiresAt > Date.now()
    };
}

async function setMarketCache(cacheKey, payload, expiresAt) {
    await ensureMarketCacheTable();

    await query(
        'INSERT INTO market_api_cache (cache_key, payload_json, expires_at) VALUES (?, ?, ?) ' +
            'ON DUPLICATE KEY UPDATE payload_json = VALUES(payload_json), expires_at = VALUES(expires_at), updated_at = CURRENT_TIMESTAMP',
        [cacheKey, JSON.stringify(payload), toMysqlDatetime(expiresAt)]
    );
}

module.exports = {
    getMarketCacheEntry,
    setMarketCache
};

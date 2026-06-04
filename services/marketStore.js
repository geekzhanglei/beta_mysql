const { query } = require('../utils/query');

let schemaReady = false;

function pad(value) {
    return String(value).padStart(2, '0');
}

function toMysqlDatetime(date) {
    const value = date instanceof Date ? date : new Date(date);
    return [
        value.getFullYear(),
        pad(value.getMonth() + 1),
        pad(value.getDate())
    ].join('-') + ' ' + [
        pad(value.getHours()),
        pad(value.getMinutes()),
        pad(value.getSeconds())
    ].join(':');
}

async function ensureMarketTables() {
    if (schemaReady) {
        return;
    }

    await query(
        'CREATE TABLE IF NOT EXISTS market_dataset_cache (' +
            'id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, ' +
            'dataset_key VARCHAR(191) NOT NULL, ' +
            'payload_json LONGTEXT NOT NULL, ' +
            'expires_at DATETIME NOT NULL, ' +
            'created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, ' +
            'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, ' +
            'PRIMARY KEY (id), ' +
            'UNIQUE KEY uk_dataset_key (dataset_key), ' +
            'KEY idx_expires_at (expires_at)' +
            ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );

    await query(
        'CREATE TABLE IF NOT EXISTS market_origin_status (' +
            'id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, ' +
            'origin_key VARCHAR(191) NOT NULL, ' +
            'endpoint VARCHAR(512) NOT NULL, ' +
            'status VARCHAR(32) NOT NULL, ' +
            'status_code INT NULL, ' +
            'latency_ms INT NULL, ' +
            'message VARCHAR(512) NULL, ' +
            'fetched_at DATETIME NOT NULL, ' +
            'created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, ' +
            'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, ' +
            'PRIMARY KEY (id), ' +
            'UNIQUE KEY uk_origin_key (origin_key), ' +
            'KEY idx_status (status), ' +
            'KEY idx_fetched_at (fetched_at)' +
            ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );

    schemaReady = true;
}

async function getDatasetCache(datasetKey) {
    await ensureMarketTables();

    const rows = await query(
        'SELECT payload_json, expires_at FROM market_dataset_cache WHERE dataset_key = ? LIMIT 1',
        [datasetKey]
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

async function setDatasetCache(datasetKey, payload, expiresAt) {
    await ensureMarketTables();

    await query(
        'INSERT INTO market_dataset_cache (dataset_key, payload_json, expires_at) VALUES (?, ?, ?) ' +
            'ON DUPLICATE KEY UPDATE payload_json = VALUES(payload_json), expires_at = VALUES(expires_at), updated_at = CURRENT_TIMESTAMP',
        [datasetKey, JSON.stringify(payload), toMysqlDatetime(expiresAt)]
    );
}

async function setOriginStatus(status) {
    await ensureMarketTables();

    await query(
        'INSERT INTO market_origin_status (origin_key, endpoint, status, status_code, latency_ms, message, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?) ' +
            'ON DUPLICATE KEY UPDATE endpoint = VALUES(endpoint), status = VALUES(status), status_code = VALUES(status_code), ' +
            'latency_ms = VALUES(latency_ms), message = VALUES(message), fetched_at = VALUES(fetched_at), updated_at = CURRENT_TIMESTAMP',
        [
            status.originKey,
            status.endpoint,
            status.status,
            status.statusCode == null ? null : status.statusCode,
            status.latencyMs == null ? null : status.latencyMs,
            status.message || '',
            toMysqlDatetime(status.fetchedAt || new Date())
        ]
    );
}

async function listOriginStatus() {
    await ensureMarketTables();
    return query(
        'SELECT origin_key AS originKey, endpoint, status, status_code AS statusCode, latency_ms AS latencyMs, message, fetched_at AS fetchedAt, updated_at AS updatedAt ' +
            'FROM market_origin_status ORDER BY updated_at DESC'
    );
}

module.exports = {
    ensureMarketTables,
    getDatasetCache,
    setDatasetCache,
    setOriginStatus,
    listOriginStatus
};

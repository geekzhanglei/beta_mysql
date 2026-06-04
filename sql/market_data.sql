CREATE TABLE IF NOT EXISTS `market_dataset_cache` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `dataset_key` VARCHAR(191) NOT NULL,
  `payload_json` LONGTEXT NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dataset_key` (`dataset_key`),
  KEY `idx_expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `market_origin_status` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `origin_key` VARCHAR(191) NOT NULL,
  `endpoint` VARCHAR(512) NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `status_code` INT NULL,
  `latency_ms` INT NULL,
  `message` VARCHAR(512) NULL,
  `fetched_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_origin_key` (`origin_key`),
  KEY `idx_status` (`status`),
  KEY `idx_fetched_at` (`fetched_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

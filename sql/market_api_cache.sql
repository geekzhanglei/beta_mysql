CREATE TABLE IF NOT EXISTS `market_api_cache` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `cache_key` VARCHAR(191) NOT NULL,
  `payload_json` LONGTEXT NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cache_key` (`cache_key`),
  KEY `idx_expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

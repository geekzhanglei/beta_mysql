CREATE DATABASE IF NOT EXISTS `tmdb_movie_calendar`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `tmdb_movie_calendar`;

CREATE TABLE IF NOT EXISTS `tmdb_api_cache` (
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

CREATE TABLE IF NOT EXISTS `tmdb_media` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tmdb_id` INT UNSIGNED NOT NULL,
  `media_type` ENUM('movie', 'tv') NOT NULL,
  `title` VARCHAR(255) NOT NULL DEFAULT '',
  `original_title` VARCHAR(255) NOT NULL DEFAULT '',
  `overview` TEXT,
  `poster_path` VARCHAR(255) NOT NULL DEFAULT '',
  `backdrop_path` VARCHAR(255) NOT NULL DEFAULT '',
  `release_date` DATE NULL,
  `first_air_date` DATE NULL,
  `vote_average` DECIMAL(4, 2) NOT NULL DEFAULT 0,
  `popularity` DECIMAL(10, 3) NOT NULL DEFAULT 0,
  `origin_country` VARCHAR(64) NOT NULL DEFAULT '',
  `original_language` VARCHAR(16) NOT NULL DEFAULT '',
  `raw_json` LONGTEXT,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tmdb_media` (`tmdb_id`, `media_type`),
  KEY `idx_media_type_popularity` (`media_type`, `popularity`),
  KEY `idx_release_date` (`release_date`),
  KEY `idx_first_air_date` (`first_air_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tmdb_calendar_item` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tmdb_id` INT UNSIGNED NOT NULL,
  `media_type` ENUM('movie', 'tv') NOT NULL,
  `event_type` VARCHAR(32) NOT NULL,
  `event_date` DATE NOT NULL,
  `region` VARCHAR(16) NOT NULL DEFAULT '',
  `timezone` VARCHAR(64) NOT NULL DEFAULT '',
  `title` VARCHAR(255) NOT NULL DEFAULT '',
  `poster_path` VARCHAR(255) NOT NULL DEFAULT '',
  `payload_json` LONGTEXT,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_calendar_item` (`tmdb_id`, `media_type`, `event_type`, `event_date`, `region`, `timezone`),
  KEY `idx_event_date` (`event_date`),
  KEY `idx_media_event` (`media_type`, `event_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tmdb_tv_season` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tv_id` INT UNSIGNED NOT NULL,
  `season_number` INT NOT NULL,
  `name` VARCHAR(255) NOT NULL DEFAULT '',
  `overview` TEXT,
  `poster_path` VARCHAR(255) NOT NULL DEFAULT '',
  `air_date` DATE NULL,
  `episode_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `payload_json` LONGTEXT,
  `expires_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tv_season` (`tv_id`, `season_number`),
  KEY `idx_tv_season_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tmdb_tv_episode` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `episode_tmdb_id` INT UNSIGNED NOT NULL DEFAULT 0,
  `tv_id` INT UNSIGNED NOT NULL,
  `season_number` INT NOT NULL,
  `episode_number` INT NOT NULL,
  `air_date` DATE NULL,
  `name` VARCHAR(255) NOT NULL DEFAULT '',
  `overview` TEXT,
  `still_path` VARCHAR(255) NOT NULL DEFAULT '',
  `vote_average` DECIMAL(4, 2) NOT NULL DEFAULT 0,
  `runtime` INT UNSIGNED NOT NULL DEFAULT 0,
  `episode_type` VARCHAR(32) NOT NULL DEFAULT '',
  `payload_json` LONGTEXT,
  `expires_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tv_episode` (`tv_id`, `season_number`, `episode_number`),
  KEY `idx_tv_air_date` (`tv_id`, `air_date`),
  KEY `idx_air_date` (`air_date`),
  KEY `idx_tv_episode_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

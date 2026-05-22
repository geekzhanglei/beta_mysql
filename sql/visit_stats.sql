CREATE TABLE IF NOT EXISTS `blog_page_views` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `visit_day` date NOT NULL,
  `path` varchar(255) NOT NULL,
  `article_id` int unsigned DEFAULT NULL,
  `visitor_id` varchar(80) NOT NULL,
  `session_id` varchar(80) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_blog_page_views_day` (`visit_day`),
  KEY `idx_blog_page_views_day_visitor` (`visit_day`, `visitor_id`),
  KEY `idx_blog_page_views_day_path` (`visit_day`, `path`),
  KEY `idx_blog_page_views_article_day` (`article_id`, `visit_day`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/*
 * TMDB movie calendar uses a separate MySQL database from the blog database.
 */
const tmdbMysqlConfig = {
    user: process.env.TMDB_DB_USER || process.env.DB_USER || 'root',
    password: process.env.TMDB_DB_PASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.TMDB_DB_DATABASE || 'tmdb_movie_calendar',
    host: process.env.TMDB_DB_HOST || process.env.DB_HOST || '211.159.169.12',
    port: process.env.TMDB_DB_PORT || process.env.DB_PORT || '3306'
};

module.exports = tmdbMysqlConfig;

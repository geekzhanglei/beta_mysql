const mysql = require('mysql');
const TMDB_MYSQL_CONFIG = require('../config/tmdb_mysql_config');

const pool = mysql.createPool(TMDB_MYSQL_CONFIG);

const tmdbQuery = (sql, val) => {
    return new Promise((resolve, reject) => {
        pool.getConnection((err, connection) => {
            if (err) {
                reject(err);
                return;
            }

            connection.query(sql, val, (queryErr, fields) => {
                connection.release();
                if (queryErr) {
                    reject(queryErr);
                } else {
                    resolve(fields);
                }
            });
        });
    });
};

module.exports = {
    tmdbQuery
};

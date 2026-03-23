/*
 * @Author: zhanglei
 * @Date: 2019-07-15 16:09:53
 * @LastEditors: zhanglei
 * @LastEditTime: 2026-03-23 17:08:00
 * @Description:
 */
const mysqlConfig = {
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'blog',
    host: process.env.DB_HOST || '211.159.169.12',
    port: process.env.DB_PORT || '3306'
};

module.exports = mysqlConfig;

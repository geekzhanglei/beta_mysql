/*
 * @Author: zhanglei
 * @Date: 2019-07-19 15:58:47
 * @LastEditors: zhanglei
 * @LastEditTime: 2019-09-05 17:13:59
 * @Description: 封装查询语句
 */
const mysql = require('mysql')
const MYSQL_CONFIG = require('../config/mysql_config') // 数据库配置

// mysql
const pool = mysql.createPool(MYSQL_CONFIG)
// query sql语句入口
const query = (sql, val) => {
    return new Promise((resolve, reject) => {
        pool.getConnection(function (err, connection) {
            if (err) {
                reject(err)
            } else {
                connection.query(sql, val, (err, fields) => {
                    if (err) reject(err)
                    else resolve(fields)
                    connection.release()
                })
            }
        })
    })
}

module.exports = {
    query
}

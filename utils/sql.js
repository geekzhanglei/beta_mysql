/*
 * @Author: zhanglei
 * @Date: 2019-07-19 16:04:51
 * @LastEditors: zhanglei
 * @LastEditTime: 2019-09-02 19:43:00
 * @Description:
 */

// 查询数据表
const QUERY_TABLE = (tableName) => `SELECT * FROM ${tableName} LIMIT 0,5`

// 插入数据
const INSERT_TABLE = (tableName, key, val) => `INSERT INTO ${tableName} (${key}) VALUES (\'${val}\')`

// 更新数据
const UPDATE_TABLE = (tableName, primaryKey, primaryVal, key, val) => `UPDATE ${tableName} SET ${key}=\'${val}\' WHERE(${primaryKey}=\'${primaryVal}\');`

// 删除数据
const DELETE_TABLE = (tableName, primaryKey, primaryVal) => `DELETE FROM ${tableName} WHERE(${primaryKey}=${primaryVal});`

module.exports = {
    QUERY_TABLE,
    INSERT_TABLE,
    UPDATE_TABLE,
    DELETE_TABLE
}

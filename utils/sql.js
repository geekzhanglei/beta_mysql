/*
 * @Author: zhanglei
 * @Date: 2019-07-19 16:04:51
 * @LastEditors: zhanglei
 * @LastEditTime: 2019-09-05 17:14:14
 * @Description: 部分通用sql
 */

// 查询数据表,分页，根据orderitem降序
const QUERY_TABLE = (tableName, startpage, pagesize, orderitem) => `SELECT * FROM ${tableName}  ORDER BY ${orderitem} DESC LIMIT ${startpage},${pagesize}`

// 插入数据
const INSERT_TABLE = (tableName, keys, values) => `INSERT INTO ${tableName} (${keys}) VALUES (${values})`

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

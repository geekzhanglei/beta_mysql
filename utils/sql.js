/*
 * @Author: zhanglei
 * @Date: 2019-07-19 16:04:51
 * @LastEditors: zhanglei
 * @LastEditTime: 2019-08-28 19:40:10
 * @Description:
 */
// 创建数据库
// const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS user1(
//     user_id INT(5) NOT NULL AUTO_INCREMENT,
//     user_name VARCHAR(255) NOT NULL,
//     user_phone VARCHAR(255) NOT NULL,
//     PRIMARY KEY (user_id)
// );`.replace(/[\r\n]/g, '')

// 创建表
const CREATE_TABLE = `
    create table ttt (
        id int primary key auto_increment,  #auto_increment只是MySQL特有的
        Name varchar(18),
        sex varchar(2),
        age int,
        address varchar(200),
        email varchar(100)
    );
`

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
    CREATE_TABLE,
    INSERT_TABLE,
    UPDATE_TABLE,
    DELETE_TABLE
}

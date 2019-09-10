/*
 * @Author: zhanglei
 * @Date: 2019-09-09 15:21:14
 * @LastEditors: zhanglei
 * @LastEditTime: 2019-09-10 19:45:07
 * @Description: 用户信息接口
 */
const router = require('koa-router')()
// const moment = require('moment');
const fs = require('fs');
const path = require('path');
// const FormData = require('form-data')

const {
    query
} = require('../utils/query');

router.prefix('/blogapi/admin/');

 /**
 * @description: 获取用户信息
 * @type {get}
 * @return {} result
 */

router.get('/adminInfo', async ctx => {
    let msg = 'success',
        status = 0,
        sql = `SELECT * FROM blog_admin_user`,
        data;

        data = await query(sql)
            .then(res => res)
            .catch(err => err);
        // 如果mysql执行出错
        if (data.errno) {
            status = 0; // 失败
            msg = data.sqlMessage;
        } else {
            data = data[0];
            status = 1;
        }

    ctx.body = {
        result: {
            msg,
            status
        }
    };
 });

 /**
  * @description: 修改用户密码
  * @param {post}
  * @param {password}
  * @param {newpassword}
  * @param {token}
  * @return: {}
  */
 router.post('/modifypw', async ctx => {
    let status = 0,
        msg = 'success',
        res, sql;
    let newpassword = ctx.request.body.newpassword,
        password = ctx.request.body.password,
        token = ctx.request.body.token;
    password = new Buffer(password).toString('base64');
    newpassword = new Buffer(newpassword).toString('base64');
    if (!newpassword || !password || !token) {
        msg = '必填项不可为空';
    } else {
        sql = `UPDATE blog_admin_user SET password=\'${newpassword}\' WHERE password=\'${password}\' AND password=\'${token}\'`;
        res = await query(sql)
            .then(res => res)
            .catch(err => err);
        // 如果mysql执行出错

        if (res.errno) {
            status = 0; // 失败
            msg = res.sqlMessage;
        } else {
            if(res.changedRows) {
                status = 1;
                msg = '修改密码成功';
            } else {
                status = 0;
                msg = '旧密码输入错误'
            }
        }
    }

    ctx.body = {
        result: {
            msg,
            status
        }
    };
});

 /**
  * @description: 修改用户头像与昵称
  * @param {post}
  * @param {nickname}}
  * @param {headimg}
  * @param {token}
  * @return: {}
  */
 router.post('/modifyAdminInfo', async ctx => {
    let status = 0,
        msg = 'success',
        res, sql;
    let nickname = ctx.request.body.nickname,
        headimg = ctx.request.body.headimg,
        token = ctx.request.body.token;
    if (!nickname || !headimg || !token) {
        msg = '必填项不可为空';
    } else {
        var localpath = path.join('/data/blogimg', headimg);
        fs.writeFile(path.join(localpath, headimg), headimg, (err) => {
            if (err) throw err;
        });
        sql = `UPDATE blog_admin_user SET nickname=\'${nickname}\', head_img=\'${localpath}\' WHERE password=\'${token}\'`;
        res = await query(sql)
            .then(res => res)
            .catch(err => err);
        // 如果mysql执行出错
        if (res.errno) {
            status = 0; // 失败
            msg = res.sqlMessage;
        } else {
            if(res.changedRows) {
                status = 1;
                msg = '修改成功';
            } else {
                status = 0;
                msg = '修改失败'
            }
        }
    }

    ctx.body = {
        result: {
            msg,
            status
        }
    };
});

module.exports = router;

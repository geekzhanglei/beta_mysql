/*
 * @Author: zhanglei
 * @Date: 2019-09-11 15:32:51
 * @LastEditors: zhanglei
 * @LastEditTime: 2019-09-11 17:02:23
 * @Description: 后台常用选项页接口
 */
const router = require('koa-router')()
const blogConfig = require('../config/option_config');

router.prefix('/blogapi/admin/');
/**
 * @description: 获取默认选项设置
 * @type get
 * @return:{object} result
 */
router.get('/options', async ctx => {
    let msg = "success", status = 1;
    ctx.body = {
        result: {
            msg,
            status,
            ...blogConfig
        }
    };
});
/**
 * @description: 设置默认文章页配置
 * @param {ispage} 是否分页
 * @param {perpage} 每页条数
 * @param {token}  鉴权
 * @type post
 * @return:{object} result
 */
router.post('/setDefaultArticlePages', async (ctx, next) => {
    let data = ctx.request.body; // 获取post请求数据data
    let msg = 'success',
        status = 0;
    if (!data.ispage || !data.perpage || !data.token) {
        msg = '必填项不可为空';
    } else {
        blogConfig.articleIsPage = data.ispage == 'true';
        blogConfig.articlePerPage = data.perpage;
        status = 1;
        msg = '修改成功';
    }
    ctx.body = {
        result: {
            msg,
            status
        }
    };
});

/**
 * @description: 设置留言板配置
 * @param {ispage} 是否分页
 * @param {perpage} 每页条数
 * @param {defaultCommentName} 默认评论名
 * @param {defaultReplyName} 默认回复名字
 * @param {token}  鉴权
 * @type post
 * @return:{object} result
 */
router.post('/setDefaultCommentInfos', async (ctx, next) => {
    let data = ctx.request.body; // 获取post请求数据data
    let msg = 'success',
        status = 0;
    if (!data.ispage || !data.perpage || !data.token) {
        msg = '必填项不可为空';
    } else {
        blogConfig.msgIsPage = data.ispage == 'true';
        blogConfig.msgPerPage = data.perpage;
        blogConfig.msgName = data.defaultCommentName;
        blogConfig.msgReplyName = data.defaultReplyName;
        status = 1;
        msg = '修改成功';
    }

    ctx.body = {
        result: {
            msg,
            status
        }
    };
});


module.exports = router;

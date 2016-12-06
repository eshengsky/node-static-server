/**
 * Created by Sky on 2016/12/6.
 */
exports.config = {
    // 绑定端口
    port: 12321,

    // 欢迎页面
    welcome: 'Test Welcome Page!',

    // 资源文件顶层目录
    assets: './assetsForTest/',

    // 缓存过期时间（单位秒）
    maxAge: 60 * 60 * 24 * 30,

    // gzip压缩文件的类型
    gzipTypes: /js|css|html?/i
};
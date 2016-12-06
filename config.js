/**
 * Created by Sky on 2016/12/1.
 */

exports.config = {
    /**
     * 绑定主机
     */
    host: '127.0.0.1',

    /**
     * 绑定端口
     */
    port: 8080,

    /**
     * 欢迎页面显示
     */
    welcome: 'Welcome to the node static server!',

    /**
     * 资源文件最外层目录
     */
    assets: './assets/',

    /**
     * 缓存过期时间（单位秒）
     */
    maxAge: 60 * 60 * 24 * 30,

    /**
     * gzip压缩文件的类型
     */
    gzipTypes: /js|css|html?/i
};
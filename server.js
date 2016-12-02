/**
 *
 * Created by Sky on 2016/12/1.
 */

'use strict';
const http = require('http'),
    url = require('url'),
    fs = require('fs'),
    path = require('path'),
    zlib = require("zlib"),
    crypto = require("crypto"),
    mime = require('mime'),
    config = require('./config');

var port = config.port;
http.createServer((req, res) => {
    // 只允许GET请求方式
    if (req.method.toLowerCase() !== 'get') {
        return err403();
    }
    // 获取原始URL
    var originalUrl = req.url;
    // 从URL中获取路径名
    var pathName = url.parse(originalUrl).pathname;
    var pathNames = pathName.split(',');
    // 多文件请求（只支持js和css）
    if (pathNames.length > 1) {
        // 是否每个请求都是js或每个请求都是css
        let isAllJs = pathNames.every(function (item) {
                return path.extname(item) === '.js';
            }),
            isAllCss = pathNames.every(function (item) {
                return path.extname(item) === '.css';
            });
        if (!isAllJs && !isAllCss) {
            return err400();
        }
        let asyncCounter = 0;
        let data = [];
        pathNames.forEach(pathName => {
            getSingleFileStatus(pathName, (code, stats, fileName) => {
                asyncCounter++;
                data.push({
                    code: code,
                    stats: stats,
                    fileName: fileName
                });
                // 是否已拿到所有异步数据
                if (asyncCounter === pathNames.length) {
                    // 包含了403错误
                    if (data.some((item)=> {
                            return item.code === 403
                        })) {
                        return err403();
                    }
                    // 包含了404错误
                    if (data.some((item)=> {
                            return item.code === 404
                        })) {
                        return err404();
                    }
                    // 包含了500错误
                    if (data.some((item)=> {
                            return item.code === 500
                        })) {
                        return err500();
                    }
                    let rs,
                        file;
                    var streamHandler = function fn() {
                        if (data.length === 0) {
                            return res.end();
                        }
                        file = data.shift().fileName;
                        rs = fs.createReadStream(file);
                        rs.on('end', () => {
                            fn();
                        });
                        rs.pipe(res, {
                            end: false
                        })
                    };
                    streamHandler();
                }
            })
        })
    }
    // 单文件请求
    else {
        getSingleFileStatus(pathName, (code, stats, fileName) => {
            switch (code) {
                case 200:
                    success200(stats, fileName);
                    break;
                case 304:
                    success304(stats, fileName);
                    break;
                case 403:
                    err403();
                    break;
                case 404:
                    err404();
                    break;
                case 500:
                    err500();
                    break;
            }
        })
    }

    /**
     * 获取文件的状态
     * @param pathName
     * @param callback
     */
    function getSingleFileStatus(pathName, callback) {
        // 根据路径名得到将要读取的本地文件名
        var fileName = path.join(config.assets, pathName);
        // 获取文件信息
        fs.stat(fileName, (err, stats) => {
            if (err) {
                // 文件不存在
                if (err.code === 'ENOENT') {
                    console.warn('404 文件不存在：', fileName);
                    return callback(404);
                }
                // 其它错误
                else {
                    console.error('500 服务器错误：', fileName);
                    return callback(500);
                }
            } else {
                // 是一个文件
                if (stats.isFile()) {
                    // 设置浏览器缓存过期时间
                    let expires = new Date();
                    expires.setTime(expires.getTime() + config.maxAge * 1000);
                    // 设置上次修改时间
                    let lastModified = stats.mtime.toUTCString();
                    // 生成Etag
                    var etagStr = [stats.ino, stats.mtime.toUTCString(), stats.size].join('-');
                    var etag = crypto.createHash('sha1').update(etagStr).digest('base64');
                    // 如果文件未修改则返回304
                    if (req.headers['if-modified-since'] === lastModified && req.headers['if-none-match'] === etag) {
                        return callback(304, stats, fileName);
                    }
                    return callback(200, stats, fileName);
                }
                // 不是文件，是目录或者别的
                else {
                    console.error('403 非法访问：', fileName);
                    return callback(403);
                }
            }
        });
    }

    // // 根据路径名得到将要读取的本地文件名
    // var fileName = path.join(config.assets, pathName);
    // // 获取文件信息
    // fs.stat(fileName, function (err, stats) {
    //     var ext,
    //         expires,
    //         lastModified,
    //         enableGzipFile,
    //         enableGzipHeader,
    //         rs;
    //     if (err) {
    //         // 文件不存在
    //         if (err.code === 'ENOENT') {
    //             console.warn('404 文件不存在：', fileName);
    //             return err404();
    //         }
    //         // 其它错误
    //         else {
    //             console.error('500 服务器错误：', fileName);
    //             return err500();
    //         }
    //     } else {
    //         // 是一个文件
    //         if (stats.isFile()) {
    //             // 设置浏览器缓存过期时间
    //             expires = new Date();
    //             expires.setTime(expires.getTime() + config.maxAge * 1000);
    //             res.setHeader("Expires", expires.toUTCString());
    //             res.setHeader("Cache-Control", "max-age=" + config.maxAge);
    //             // 设置上次修改时间
    //             lastModified = stats.mtime.toUTCString();
    //             res.setHeader("Last-Modified", lastModified);
    //             // 生成Etag
    //             var etagStr = [stats.ino, stats.mtime.toUTCString(), stats.size].join('-');
    //             var etag = crypto.createHash('sha1').update(etagStr).digest('base64');
    //             res.setHeader('ETag', etag);
    //             // 设置MIME类型
    //             ext = path.extname(fileName);
    //             res.setHeader("Content-Type", mime.lookup(ext));
    //             // 判断是否支持Gzip
    //             enableGzipFile = config.gzipTypes.test(ext);
    //             enableGzipHeader = /gzip/i.test(req.headers['accept-encoding'] || '');
    //             // 创建文件可读流
    //             rs = fs.createReadStream(fileName);
    //             rs.on('error', function (err) {
    //                 console.error(err);
    //                 return err500();
    //             });
    //             // 如果文件未修改则返回304
    //             if (req.headers['if-modified-since'] === lastModified && req.headers['if-none-match'] === etag) {
    //                 res.writeHead(304);
    //                 res.end();
    //             } else {
    //                 // 如果文件支持gzip压缩则压缩后发给客户端
    //                 if (enableGzipFile && enableGzipHeader) {
    //                     res.setHeader('Content-Encoding', 'gzip');
    //                     res.writeHead(200);
    //                     rs.pipe(zlib.createGzip()).pipe(res);
    //                 }
    //                 // 否则读取未压缩文件给客户端
    //                 else {
    //                     res.writeHead(200);
    //                     rs.pipe(res);
    //                 }
    //             }
    //         }
    //         // 不是文件，是目录或者别的
    //         else {
    //             console.error('403 非法访问：', fileName);
    //             return err403();
    //         }
    //     }
    // });

    function setHeaders(stats, fileName) {
        // 设置浏览器缓存过期时间
        var expires = new Date();
        expires.setTime(expires.getTime() + config.maxAge * 1000);
        res.setHeader("Expires", expires.toUTCString());
        res.setHeader("Cache-Control", "max-age=" + config.maxAge);
        // 设置上次修改时间
        var lastModified = stats.mtime.toUTCString();
        res.setHeader("Last-Modified", lastModified);
        // 生成Etag
        var etagStr = [stats.ino, stats.mtime.toUTCString(), stats.size].join('-');
        var etag = crypto.createHash('sha1').update(etagStr).digest('base64');
        res.setHeader('ETag', etag);
        // 设置MIME类型
        var ext = path.extname(fileName);
        res.setHeader("Content-Type", mime.lookup(ext));
    }

    /**
     * 成功，响应200
     * @param stats
     * @param fileName
     */
    function success200(stats, fileName) {
        var rs = fs.createReadStream(fileName);
        var ext = path.extname(fileName);
        setHeaders(stats, fileName);
        //判断是否支持Gzip
        var enableGzipFile = config.gzipTypes.test(ext);
        var enableGzipHeader = /gzip/i.test(req.headers['accept-encoding'] || '');
        // 如果文件支持gzip压缩则压缩后发给客户端
        if (enableGzipFile && enableGzipHeader) {
            res.setHeader('Content-Encoding', 'gzip');
            res.writeHead(200);
            rs.pipe(zlib.createGzip()).pipe(res);
        }
        // 否则读取未压缩文件给客户端
        else {
            res.writeHead(200);
            rs.pipe(res);
        }
    }

    /**
     * 成功，响应304
     */
    function success304(stats, fileName) {
        setHeaders(stats, fileName);
        res.writeHead(304);
        res.end();
    }

    /**
     * 400错误处理
     */
    function err400() {
        res.writeHead(400, {
            'Content-Type': 'text/plain'
        });
        res.end('400 Bad Request');
    }

    /**
     * 403错误处理
     */
    function err403() {
        res.writeHead(403, {
            'Content-Type': 'text/plain'
        });
        res.end('403 Forbidden');
    }

    /**
     * 404错误处理
     */
    function err404() {
        res.writeHead(404, {
            'Content-Type': 'text/plain'
        });
        res.end('404 Not Found');
    }

    /**
     * 500错误处理
     */
    function err500() {
        res.writeHead(500, {
            'Content-Type': 'text/plain'
        });
        res.end('500 Internal Server Error');
    }
}).listen(port);

console.info('Minify server is running at http://127.0.0.1:' + port);
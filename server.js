/**
 * node-static-server
 * 基于Node.js的静态资源服务器
 * Copyright(c) 2016 Sky.Sun <eshengsky@163.com>
 * MIT Licensed
 */

'use strict';
const http = require('http'),
    url = require('url'),
    fs = require('fs'),
    path = require('path'),
    {PassThrough} = require('stream'),
    zlib = require("zlib"),
    crypto = require("crypto"),
    mime = require('mime'),
    {config} = require('./config');

http.createServer((req, res) => {
    // 只允许GET请求方式
    if (req.method !== 'GET') {
        console.warn(`400 错误的请求！Url：${req.url} Method: ${req.method}`);
        return errorHandler(400);
    }
    // 响应是否支持Gzip压缩
    var enableGzipHeader = /\bgzip\b/i.test(req.headers['accept-encoding'] || '');
    // 获取原始URL
    var originalUrl = req.url;
    // 从URL中获取路径名
    var pathName = url.parse(originalUrl).pathname;
    // 如果是首页则显示welcome
    if (pathName === '/') {
        res.end(config.welcome);
        return;
    }
    // 用逗号分割pathname
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
            console.warn(`400 错误的请求！Url：${req.url} Method: ${req.method}`);
            return errorHandler(400);
        }

        let promises = pathNames.map(item => getSingleFileStatus(item));
        Promise.all(promises).then(data => {
            handleMultiFiles(data, isAllJs ? '.js' : '.css');
        }, error => errorHandler(error));
    }
    // 单文件请求
    else {
        getSingleFileStatus(pathName).then(({code, stats, fileName}) => {
            switch (code) {
                case 200:
                    setHeaders(stats, fileName);
                    let rs = fs.createReadStream(fileName);
                    let ext = path.extname(fileName);
                    var enableGzipFile = config.gzipTypes.test(ext);
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
                    break;
                case 304:
                    setHeaders(stats, fileName);
                    res.writeHead(304);
                    res.end();
                    break;
            }
        }, error => errorHandler(error));
    }

    /**
     * 获取文件的状态
     * @param pathName
     */
    function getSingleFileStatus(pathName) {
        return new Promise((resolve, reject) => {
            // 根据路径名得到将要读取的本地文件名
            var fileName = path.join(config.assets, pathName);
            // 获取文件信息
            fs.stat(fileName, (err, stats) => {
                if (err) {
                    // 文件不存在
                    if (err.code === 'ENOENT') {
                        console.warn(`404 文件不存在！文件路径：${fileName}`);
                        return reject(404);
                    }
                    // 其它错误
                    else {
                        console.error(`500 服务器错误！错误信息：${err.message}`);
                        return reject(500);
                    }
                } else {
                    // 是一个文件
                    if (stats.isFile()) {
                        // 上次修改时间
                        let lastModified = stats.mtime.toUTCString();
                        // 生成Etag
                        let etagStr = [stats.ino, stats.mtime.toUTCString(), stats.size].join('-');
                        let etag = crypto.createHash('sha1').update(etagStr).digest('base64');
                        // 如果文件未修改则返回304
                        if (req.headers['if-modified-since'] === lastModified && req.headers['if-none-match'] === etag) {
                            return resolve({
                                code: 304, stats, fileName
                            });
                        }
                        return resolve({
                            code: 200, stats, fileName
                        });
                    }
                    // 不是文件，是目录或者别的
                    else {
                        console.error(`403 禁止访问！${fileName}`);
                        return reject(403);
                    }
                }
            });
        });
    }

    /**
     * 处理多文件请求
     * @param data
     * @param ext
     * @returns {*}
     */
    function handleMultiFiles(data, ext) {
        // 得到一个stats数组
        let multiStats = data.map(item => item.stats);
        // 生成多文件情况下的ino, size
        let sumIno = 0,
            sumSize = 0;
        multiStats.forEach(item => {
            sumIno += item.ino;
            sumSize += item.size;
        });
        // mtime取最后修改的那个文件的
        let maxTime = Math.max(...multiStats.map(item => item.mtime));
        let mtime = new Date(maxTime);
        // ino取平均值
        let ino = sumIno / data.length;
        // size取所有文件相加的
        let size = sumSize;

        // 生成Etag
        let etagStr = [ino, mtime.toUTCString(), size].join('-');
        let etag = crypto.createHash('sha1').update(etagStr).digest('base64');

        // 设置报文头
        setHeaders({mtime, ino, size}, data[0].fileName);

        // 如果文件未修改则返回304
        if (req.headers['if-modified-since'] === mtime.toUTCString() && req.headers['if-none-match'] === etag) {
            res.writeHead(304);
            res.end();
            return;
        }

        // 判断是否支持Gzip
        let enableGzipFile = config.gzipTypes.test(ext);

        // 生成多文件合并后的可读流
        let combinedStreams = combineFileStreams(data.map(t => t.fileName));

        // 如果文件支持gzip压缩则压缩后发给客户端
        if (enableGzipFile && enableGzipHeader) {
            res.setHeader('Content-Encoding', 'gzip');
            res.writeHead(200);
            combinedStreams.pipe(zlib.createGzip()).pipe(res);
        }
        // 否则读取未压缩文件给客户端
        else {
            res.writeHead(200);
            combinedStreams.pipe(res);
        }
    }

    /**
     * 合并多个文件的文件流到PassThrough
     * @param files
     */
    function combineFileStreams(files) {
        var fileIndex = -1,
            rs,
            pt = new PassThrough();
        var next = () => {
            fileIndex++;
            rs = fs.createReadStream(files[fileIndex]);
            rs.pipe(pt, {end: false});
            rs.on('end', () => {
                if (fileIndex < files.length - 1) {
                    next();
                } else {
                    pt.emit('end');
                }
            });
        };
        next();
        return pt;
    }

    /**
     * 设置消息头
     * @param stats
     * @param fileName
     */
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
     * 错误处理
     * @param code
     */
    function errorHandler(code) {
        res.writeHead(code, {
            'Content-Type': 'text/plain'
        });
        switch (code) {
            case 400:
                res.end('400 Bad Request');
                break;
            case 403:
                res.end('403 Forbidden');
                break;
            case 404:
                res.end('404 Not Found');
                break;
            case 500:
                res.end('500 Internal Server Error');
                break;
        }
    }
}).listen(config.port);

console.info(`Static server is running at http://127.0.0.1:${config.port}`);
/**
 * Created by Sky on 2016/12/6.
 */

const assert = require('assert'),
    {exec} = require('child_process'),
    request = require('request'),
    {config} = require('./configForTest'),
    website = `http://${config.host}:${config.port}`;

describe('node-static-server tests', () => {
    it('创建静态资源服务器', done => {
        var child = exec('node ./server.js ./test/configForTest.js');
        child.stdout.on('data', success);
        function success(data) {
            assert.equal(data, `Static server is running at ${website}\n`);
            done();
        }
    });

    it('测试欢迎页面', done => {
        request(website, (err, res, body) => {
            assert.ifError(err);
            assert.equal(body, config.welcome);
            done();
        })
    });

    it('只允许GET请求方式', done => {
        request.post(website, (err, res, body) => {
            assert.ifError(err);
            assert.equal(res.statusCode, 400);
            assert.equal(body, '400 Bad Request');
            done();
        })
    });

    it('测试欢迎页面', done => {
        request(website, (err, res, body) => {
            assert.ifError(err);
            assert.equal(body, config.welcome);
            done();
        })
    });
});
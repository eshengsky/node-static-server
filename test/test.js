/**
 * Created by Sky on 2016/12/6.
 */

const assert = require('assert'),
    {exec} = require('child_process'),
    request = require('request'),
    {config} = require('./configForTest');

describe('node-static-server tests', () => {
    it('创建静态资源服务器', (done) => {
        var child = exec('node ./server.js ./test/configForTest.js');
        child.stdout.on('data', success);
        function success(data) {
            assert.equal(data, `Static server is running at http://127.0.0.1:${config.port}\n`);
            done();
        }
    });
});
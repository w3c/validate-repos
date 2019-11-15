/* eslint-env node, mocha */

'use strict';

const assert = require('assert');
const proxyquire = require('proxyquire');
const sinon = require('sinon');

const GH_API = 'https://api.github.com/graphql';

describe('graphql', () => {
  const mockConfig = {ghToken: 'mock-token'};

  it('happy path', async () => {
    const fakeFetch = sinon.fake.resolves({
      async json() { return {data: 'mock response'} }
    });
    const graphql = proxyquire('../lib/graphql.js', {
      '../config.json': mockConfig,
      'node-fetch': fakeFetch,
    });
    const res = await graphql('mock query');
    assert.equal(res, 'mock response');
    assert(fakeFetch.calledOnce);
    const args = fakeFetch.args[0];
    assert.equal(args[0], GH_API);
    assert.equal(args[1].method, 'POST');
    assert.equal(args[1].headers['Authorization'], 'bearer mock-token');
    assert.equal(args[1].body, '{"query":"mock query"}');
  });

  it('API error', async () => {
    const fakeFetch = sinon.fake.resolves({
      async json() { return {errors: [{message: 'API error'}]} }
    });
    const graphql = proxyquire('../lib/graphql.js', {
      '../config.json': mockConfig,
      'node-fetch': fakeFetch,
    });
    await assert.rejects(graphql('mock query'), {
      name: 'Error',
      message: 'API error'
    });
  });

  it('fetch error', async () => {
    const fakeFetch = sinon.fake.resolves({
      type: 'error',
      status: 500,
      ok: false,
      async json() { return {data: 'valid response'} }
    });
    const graphql = proxyquire('../lib/graphql.js', {
      '../config.json': mockConfig,
      'node-fetch': fakeFetch,
    });
    // fetch error isn't handled and if the response is JSON it's used.
    const res = await graphql('mock query');
    assert.equal(res, 'valid response');
  });

  afterEach(() => sinon.restore());
});

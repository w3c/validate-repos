/* eslint-env node, mocha */

'use strict';

const assert = require('assert');
const proxyquire = require('proxyquire');

// Rather than mocking out the whole @octokit/graphql dependency its internal
// fetch is replaced, see ttps://github.com/octokit/graphql.js/#writing-tests
const graphql = proxyquire('../lib/graphql.js', {
  '../config.json': {ghToken: 'mock-token'},
});

describe('graphql', () => {
  it('happy path', async () => {
    const res = await graphql('mock query', {
      request: {
        fetch: async (url, options) => {
          assert.equal(options.headers.authorization, 'token mock-token');
          assert.equal(options.body, '{"query":"mock query"}');
          return {
            headers: new Map([['content-type', 'application/json']]),
            async json() {
              return {data: 'mock response'};
            }
          }
        }
      }
    });
    assert.equal(res, 'mock response');
  });

  it('error path', async () => {
    await assert.rejects(graphql('mock query', {
      request: {
        fetch: async () => {
          return {
            headers: new Map([['content-type', 'application/json']]),
            async json() {
              return {errors: [{message: 'mock error'}]};
            }
          }
        }
      }
    }), {
      name: 'GraphqlError',
      message: 'mock error'
    });
  });
});

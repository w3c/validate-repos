/* eslint-env node, mocha */

'use strict';

const assert = require('assert');
const proxyquire = require('proxyquire');

// Rather than mocking out the whole @octokit/core dependency its internal
// fetch is replaced, see https://github.com/octokit/octokit.js/#writing-tests
const octokit = proxyquire('../lib/octokit.js', {
  '../config.json': {ghToken: 'mock-token'},
});

describe('octokit', () => {
  describe('graphql', () => {
    it('happy path', async () => {
      const res = await octokit.graphql('mock query', {
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
      await assert.rejects(octokit.graphql('mock query', {
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
        name: 'GraphqlResponseError',
        message: 'Request failed due to following response errors:\n - mock error'
      });
    });
  });
});

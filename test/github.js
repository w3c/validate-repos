/* eslint-env node, mocha */

'use strict';

const assert = require('assert');
const proxyquire = require('proxyquire');
const sinon = require('sinon');

describe('github', () => {
  describe('listRepos', () => {
    async function toArray(iterator) {
      const array = [];
      for await (const item of iterator) {
        array.push(item);
      }
      return array;
    }

    it('one repo, one label', async () => {
      const graphql = sinon.stub();
      graphql.resolves({
        organization: {
          repositories: {
            nodes: [
              {
                owner: {login: 'WICG'},
                name: 'speech-api',
                labels: {
                  nodes: [
                    {
                      name: 'mock-label',
                      color: 'ffffff',
                    }
                  ],
                  pageInfo: {hasNextPage: false}
                }
              }
            ],
            pageInfo: {hasNextPage: false}
          }
        }
      });
      const github = proxyquire('../lib/github.js', {
        './graphql.js': graphql
      });
      const res = await toArray(github.listRepos('WICG'));
      assert(graphql.calledOnce);
      assert.deepStrictEqual(res, [{
        owner: {login: 'WICG'},
        name: 'speech-api',
        labels: [{name: 'mock-label', color: 'ffffff'}]
      }]);
    });

    it('paginated repos', async () => {
      const graphql = sinon.stub();
      graphql.onCall(0).resolves({
        organization: {
          repositories: {
            nodes: [
              {
                owner: {login: 'WICG'},
                name: 'mock-repo-1',
                labels: {
                  nodes: [
                    {
                      name: 'mock-repo-label-1',
                      color: '123456',
                    }
                  ],
                  pageInfo: {hasNextPage: false}
                }
              }
            ],
            pageInfo: {hasNextPage: true}
          }
        }
      });
      graphql.onCall(1).resolves({
        organization: {
          repositories: {
            nodes: [
              {
                owner: {login: 'WICG'},
                name: 'mock-repo-2',
                labels: {
                  nodes: [
                    {
                      name: 'mock-repo-label-2',
                      color: '789abc',
                    }
                  ],
                  pageInfo: {hasNextPage: false}
                }
              }
            ],
            pageInfo: {hasNextPage: false}
          }
        }
      });
      const github = proxyquire('../lib/github.js', {
        './graphql.js': graphql
      });
      const res = await toArray(github.listRepos('WICG'));
      assert(graphql.calledTwice);
      assert.deepStrictEqual(res, [{
        owner: {login: 'WICG'},
        name: 'mock-repo-1',
        labels: [{name: 'mock-repo-label-1', color: '123456'}],
      }, {
        owner: {login: 'WICG'},
        name: 'mock-repo-2',
        labels: [{name: 'mock-repo-label-2', color: '789abc'}],
      }]);
    });

    it('paginated labels', async () => {
      const graphql = sinon.stub();
      graphql.onCall(0).resolves({
        organization: {
          repositories: {
            nodes: [
              {
                owner: {login: 'WICG'},
                name: 'speech-api',
                labels: {
                  nodes: [
                    {
                      name: 'mock-label-1',
                      color: '111111',
                    }
                  ],
                  pageInfo: {hasNextPage: true}
                }
              }
            ],
            pageInfo: {hasNextPage: false}
          }
        }
      });
      graphql.onCall(1).resolves({
        repository: {
          labels: {
            nodes: [
              {
                name: 'mock-label-2',
                color: '222222',
              }
            ],
            pageInfo: {hasNextPage: true}
          },
        }
      });
      graphql.onCall(2).resolves({
        repository: {
          labels: {
            nodes: [
              {
                name: 'mock-label-3',
                color: '333333',
              }
            ],
            pageInfo: {hasNextPage: false}
          },
        }
      });
      const github = proxyquire('../lib/github.js', {
        './graphql.js': graphql
      });
      const res = await toArray(github.listRepos('WICG'));
      assert(graphql.calledThrice);
      assert.deepStrictEqual(res, [{
        owner: {login: 'WICG'},
        name: 'speech-api',
        labels: [
          {name: 'mock-label-1', color: '111111'},
          {name: 'mock-label-2', color: '222222'},
          {name: 'mock-label-3', color: '333333'},
        ]
      }]);
    });
  });

  it('fetchRepoHooks', async () => {
    class Stubkat {
      repos() {
        return {
          hooks: {
            async fetch() {
              return {
                items: ['mock-hook'],
              }
            }
          }
        }
      }
    }
    const github = proxyquire('../lib/github.js', {'octokat': Stubkat});
    const hooks = await github.listRepoHooks('foo', 'bar');
    assert.deepEqual(hooks, ['mock-hook']);
  });

  afterEach(() => sinon.restore());
});

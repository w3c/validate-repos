/* eslint-env node, mocha */

'use strict';

const assert = require('assert');
const proxyquire = require('proxyquire');

// Most things can be tested well enough without varying what the w3cData
// required modules, so set up constant mock data up front.
const w3cData = proxyquire('../lib/w3cData.js', {
  'node-fetch': async (url) => {
    const data = ({
      'https://labs.w3.org/hatchery/repo-manager/api/repos': [
        {
          owner: 'w3c',
          name: 'IndexedDB',
        },
      ],
      'https://w3c.github.io/cg-monitor/report.json': {
        data: [
          {
            id: 54172,
            repositories: ['https://github.com/w3c/speech-api/'],
          }
        ]
      },
      'https://w3c.github.io/spec-dashboard/repo-map.json': {
        'w3c/IndexedDB': [{
          recTrack: true,
          url: 'https://www.w3.org/TR/IndexedDB/',
          group: 114929,
        }],
        'w3c/ServiceWorker': [{
          recTrack: true,
          url: 'https://www.w3.org/TR/service-workers-1/',
          group: 101220,
        }],
      }
    })[url];
    return {
      async json() {
        return data;
      }
    }
  },
  'node-w3capi': {
    groups() {
      return {
        fetch(options, callback) {
          callback(null, [{id: 42, shortname: 'mock-w3cgroup', type: 'working group'}]);
        }
      }
    }
  }
});

describe('w3cData', () => {
  let data;

  before(async () => {
    data = await w3cData();
  });

  it('repo with all data', () => {
    const {ashRepo, specs, groups} = data.get('w3c', 'IndexedDB');
    assert.deepStrictEqual(ashRepo, {owner: 'w3c', name: 'IndexedDB'});
    assert.deepStrictEqual(specs, [{
      recTrack: true,
      url: 'https://www.w3.org/TR/IndexedDB/',
      group: 114929,
    }]);
    assert.deepStrictEqual(groups, [114929]);
  });

  it('repo with no data', () => {
    const {ashRepo, specs, groups} = data.get('foo', 'bar');
    assert.strictEqual(ashRepo, null);
    assert.deepStrictEqual(specs, []);
    assert.deepStrictEqual(groups, []);
  });

  it('groups for WG repo', () => {
    const {groups} = data.get('w3c', 'ServiceWorker');
    assert.deepStrictEqual(groups, [101220]);
  });

  it('groups for CG repo', () => {
    const {groups} = data.get('w3c', 'speech-api');
    assert.deepStrictEqual(groups, [54172]);
  });

  it('groups for WICG repo', () => {
    const {groups} = data.get('WICG', 'bar');
    assert.deepStrictEqual(groups, [80485]);
  });

  it('groups for WebAudio WG repo', () => {
    const {groups} = data.get('WebAudio', 'bar');
    assert.deepStrictEqual(groups, [46884]);
  });

  it('w3cgroups', () => {
    assert.deepStrictEqual(data.w3cgroups, [{id: 42, shortname: 'mock-w3cgroup', fullshortname: 'wg/mock-w3cgroup', type: 'working group'}]);
  });

  it('fetch error', async () => {
    const w3cData = proxyquire('../lib/w3cData.js', {
      'node-fetch': async () => {
        return {
          async json() {
            throw new Error('mock fetch error');
          }
        }
      },
      'node-w3capi': {
        groups() {
          return {
            fetch(options, callback) {
              callback(null, []);
            }
          }
        }
      }
    });
    await assert.rejects(w3cData(), {
      message: 'mock fetch error'
    });
  });

  it('W3C API error', async () => {
    const w3cData = proxyquire('../lib/w3cData.js', {
      'node-fetch': async () => {
        return {
          async json() {
            return null;
          }
        }
      },
      'node-w3capi': {
        groups() {
          return {
            fetch(options, callback) {
              callback(new Error('mock w3c error'));
            }
          }
        }
      }
    });
    await assert.rejects(w3cData(), {
      message: 'mock w3c error'
    });
  });
});

/* eslint-env node, mocha */

'use strict';

const assert = require('assert');

const {validateRepo, validateAshHooks} = require('../lib/validator.js');

// helper to filter out only targeted error types
function filter(errors, types) {
  types = new Set(types);
  return errors.filter(([type]) => types.has(type));
}

describe('validateRepo', () => {
  it('empty repo', async () => {
    const repo = {
      owner: {login: 'foo'},
      name: 'bar',
    };
    const licenses = {};
    const repoData = [];
    const cgData = {data: []};
    const repoMap = {};
    const {
      errors,
      isAshRepo,
      hasRecTrack,
      groups,
    } = validateRepo(repo, licenses, repoData, cgData, repoMap);
    assert.deepStrictEqual(errors, [
      ['noreadme', null],
      ['nocodeofconduct', null],
      ['nolicense', null],
      ['nocontributing', null],
      ['now3cjson', null],
    ]);
    assert.strictEqual(isAshRepo, false);
    assert.strictEqual(hasRecTrack, false);
    assert.deepStrictEqual(groups, []);
  });

  it('minimal compliant note repo', async () => {
    const repo = {
      owner: {login: 'foo'},
      name: 'bar',
      readme: true,
      codeofconduct: true,
      contributing: {text: 'mock CONTRIBUTING.md content'},
      license: {text: 'mock LICENSE.md content'},
      w3cjson: {text: JSON.stringify({
        contacts: [],
        group: ['42'],
        'repo-type': 'note',
      })},
    };
    const licenses = {
      license: 'mock LICENSE.md content',
      contributing: 'mock CONTRIBUTING.md content',
    };
    const repoData = [];
    const cgData = {data: []};
    const repoMap = {};
    const {
      errors,
      isAshRepo,
      hasRecTrack,
      groups,
    } = validateRepo(repo, licenses, repoData, cgData, repoMap);
    assert.deepStrictEqual(errors, []);
    assert.strictEqual(isAshRepo, false);
    assert.strictEqual(hasRecTrack, false);
    assert.deepStrictEqual(groups, [42]);
  });

  it('invalid contributing and license', async () => {
    const repo = {
      owner: {login: 'foo'},
      name: 'bar',
      contributing: {text: 'invalid CONTRIBUTING.md content'},
      license: {text: 'invalid LICENSE.md content'},
    };
    const licenses = {
      license: 'mock LICENSE.md content',
      licenseSw: 'mock LICENSE-SW.md content',
      contributing: 'mock CONTRIBUTING.md content',
      contributingSw: 'mock CONTRIBUTING-SW.md content',
    };
    const repoData = [];
    const cgData = {data: []};
    const repoMap = {};
    const {errors} = validateRepo(repo, licenses, repoData, cgData, repoMap);
    const types = ['invalidcontributing', 'invalidlicense']
    assert.deepStrictEqual(filter(errors, types), [
      ['invalidlicense', {
        license: 'invalid LICENSE.md content',
        error: "doesn't match SW or DOC license",
      }],
      ['invalidcontributing', {
        contributing: 'invalid CONTRIBUTING.md content',
        error: "doesn't match SW or DOC contributing"
      }],
    ]);
  });

  it('minimal compliant rec-track repo', async () => {
    const repo = {
      owner: {login: 'foo'},
      name: 'bar',
      readme: true,
      codeofconduct: true,
      contributing: {text: 'mock CONTRIBUTING.md content'},
      license: {text: 'mock LICENSE.md content'},
      w3cjson: {text: JSON.stringify({
        contacts: [],
        group: ['42'],
        'repo-type': 'rec-track',
      })},
      branchProtectionRules: {
        nodes: [{
          config: {},
        }],
      },
    };
    const licenses = {
      license: 'mock LICENSE.md content',
      contributing: 'mock CONTRIBUTING.md content',
    };
    const repoData = [{
      owner: 'foo',
      name: 'bar',
      groups: [{
        groupType: 'WG',
        w3cid: '42',
      }],
    }];
    const cgData = {data: []};
    const repoMap = {
      'foo/bar': [{recTrack: true}],
    };
    const {
      errors,
      isAshRepo,
      hasRecTrack,
      groups,
    } = validateRepo(repo, licenses, repoData, cgData, repoMap);
    assert.deepStrictEqual(errors, []);
    assert.strictEqual(isAshRepo, true);
    assert.strictEqual(hasRecTrack, true);
    assert.deepStrictEqual(groups, [42]);
  });

  it('missing ashnazg and branch protection', async () => {
    const repo = {
      owner: {login: 'foo'},
      name: 'bar',
      w3cjson: {text: JSON.stringify({
        'repo-type': 'rec-track',
      })},
    };
    const licenses = {};
    const repoData = [];
    const cgData = {data: []};
    const repoMap = {
      'foo/bar': [{recTrack: true}],
    };
    const {errors} = validateRepo(repo, licenses, repoData, cgData, repoMap);
    const types = ['noashnazg', 'unprotectedbranch'];
    assert.deepStrictEqual(filter(errors, types), [
      ['noashnazg', null],
      ['unprotectedbranch', {error: 'No protected branch'}],
    ]);
  });
});

describe('validateAshHooks', () => {
  it('no hooks', async () => {
    const hooks = [];
    const errors = validateAshHooks(hooks);
    assert.deepStrictEqual(errors, [['missingashnazghook', {}]]);
  });

  it('one hook', async () => {
    const hooks = [{
      config: {
        url: 'https://labs.w3.org/repo-manager/api/hook',
        contentType: 'json',
        insecureSsl: '0',
        secret: 'value',
      }
    }];
    const errors = validateAshHooks(hooks);
    assert.deepStrictEqual(errors, []);
  });

  it('duplicate hooks', async () => {
    const hooks = [{
      config: {
        url: 'https://labs.w3.org/hatchery/repo-manager/api/hook',
        contentType: 'json',
        insecureSsl: '0',
        secret: 'value',
      }
    }, {
      config: {
        url: 'https://labs.w3.org/repo-manager/api/hook',
        contentType: 'json',
        insecureSsl: '0',
        secret: 'value',
      }
    }];
    const errors = validateAshHooks(hooks);
    assert.deepStrictEqual(errors, [['duplicateashnazghooks', {}]]);
  });
});

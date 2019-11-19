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
  it('empty repo', () => {
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

  it('invalid contributing and license', () => {
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

  it('pr-preview config is extracted', () => {
    const repo = {
      owner: {login: 'foo'},
      name: 'bar',
      prpreviewjson: {text: '{"aKey":"someValue"}'},
    };
    const licenses = {};
    const repoData = [];
    const cgData = {data: []};
    const repoMap = {};
    validateRepo(repo, licenses, repoData, cgData, repoMap);
    assert.deepStrictEqual(repo.prpreview, {aKey: 'someValue'});
  });

  it('hardcoded repo data', () => {
    const repo = {
      owner: {login: 'w3c'},
      name: 'markup-validator',
    };
    const licenses = {};
    const repoData = [];
    const cgData = {data: []};
    const repoMap = {};
    validateRepo(repo, licenses, repoData, cgData, repoMap);
    assert.deepStrictEqual(repo.w3c, {
      contacts: 'sideshowbarker',
      'repo-type': 'tool',
    });
  });

  it('minimal compliant note repo', () => {
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

  it('minimal compliant WG repo', () => {
    const repo = {
      owner: {login: 'foo'},
      name: 'bar',
      readme: true,
      codeofconduct: true,
      contributing: {text: 'mock CONTRIBUTING.md content'},
      license: {text: 'mock LICENSE.md content'},
      w3cjson: {text: JSON.stringify({
        contacts: [],
        group: ['43'],
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
        w3cid: '43',
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
    assert.deepStrictEqual(groups, [43]);
  });

  it('groups for WG repo sans w3c.json', () => {
    const repo = {
      owner: {login: 'foo'},
      name: 'bar',
    };
    const licenses = {};
    const repoData = [];
    const cgData = {data: []};
    const repoMap = {
      'foo/bar': [{group: 44}],
    };
    const {groups} = validateRepo(repo, licenses, repoData, cgData, repoMap);
    assert.deepStrictEqual(groups, [44]);
  });

  it('groups for CG repo sans w3c.json', () => {
    const repo = {
      owner: {login: 'foo'},
      name: 'bar',
    };
    const licenses = {};
    const repoData = [];
    const cgData = {data: [{
      id: 45,
      repositories: ['https://github.com/foo/bar/'],
    }]};
    const repoMap = {};
    const {groups} = validateRepo(repo, licenses, repoData, cgData, repoMap);
    assert.deepStrictEqual(groups, [45]);
  });

  it('groups for WICG repo sans w3c.json', () => {
    const repo = {
      owner: {login: 'WICG'},
      name: 'bar',
    };
    const licenses = {};
    const repoData = [];
    const cgData = {data: []};
    const repoMap = {};
    const {groups} = validateRepo(repo, licenses, repoData, cgData, repoMap);
    assert.deepStrictEqual(groups, [80485]);
  });

  it('groups for WebAudio WG repo sans w3c.json', () => {
    const repo = {
      owner: {login: 'WebAudio'},
      name: 'bar',
    };
    const licenses = {};
    const repoData = [];
    const cgData = {data: []};
    const repoMap = {};
    const {groups} = validateRepo(repo, licenses, repoData, cgData, repoMap);
    assert.deepStrictEqual(groups, [46884]);
  });

  it('ill-formed w3c.json', () => {
    const repo = {
      owner: {login: 'foo'},
      name: 'bar',
      w3cjson: {text: 'ill-formed JSON'},
    };
    const licenses = {};
    const repoData = [];
    const cgData = {data: []};
    const repoMap = {};
    const {errors} = validateRepo(repo, licenses, repoData, cgData, repoMap);
    assert.deepStrictEqual(filter(errors, ['illformedw3cjson']), [
      ['illformedw3cjson', null],
    ]);
  });

  it('empty w3c.json', () => {
    const repo = {
      owner: {login: 'foo'},
      name: 'bar',
      w3cjson: {text: '{}'},
    };
    const licenses = {};
    const repoData = [];
    const cgData = {data: []};
    const repoMap = {};
    const {errors} = validateRepo(repo, licenses, repoData, cgData, repoMap);
    assert.deepStrictEqual(filter(errors, ['incompletew3cjson']), [
      ['incompletew3cjson', {error: 'repo-type (unknown)'}],
      ['incompletew3cjson', {error: 'contacts'}],
    ]);
  });

  it('w3c.json invalid type and contacts', () => {
    const repo = {
      owner: {login: 'foo'},
      name: 'bar',
      w3cjson: {text: JSON.stringify({
        contacts: [123],
        'repo-type': 'foo',
      })},
    };
    const licenses = {};
    const repoData = [];
    const cgData = {data: []};
    const repoMap = {
      'foo/bar': [{recTrack: true}],
    };
    const {errors} = validateRepo(repo, licenses, repoData, cgData, repoMap);
    assert.deepStrictEqual(filter(errors, ['invalidw3cjson']), [
      ['invalidw3cjson', {error: 'unknown types: ["foo"]'}],
      ['invalidw3cjson', {error: 'invalid contacts: [123]'}],
    ]);
  });

  it('missing ashnazg and branch protection', () => {
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

  it('inconsistent status in repo manager', () => {
    const repo = {
      owner: {login: 'foo'},
      name: 'bar',
      w3cjson: {text: JSON.stringify({'repo-type': 'rec-track'})},
    };
    const licenses = {};
    const repoData = [{
      owner: 'foo',
      name: 'bar',
      groups: [{groupType: 'CG'}],
    }];
    const cgData = {data: []};
    const repoMap = {
      'foo/bar': [{recTrack: true}],
    };
    const {errors} = validateRepo(repo, licenses, repoData, cgData, repoMap);
    assert.deepStrictEqual(filter(errors, ['inconsistentstatus']), [
      ['inconsistentstatus', {error: 'TR document: true, vs repo manager: false'}],
      ['inconsistentstatus', {error: 'repo: true, vs repo manager: false'}],
    ]);
  });

  it('inconsistent status in repo map', () => {
    const repo = {
      owner: {login: 'foo'},
      name: 'bar',
      w3cjson: {text: JSON.stringify({'repo-type': 'rec-track'})},
    };
    const licenses = {};
    const repoData = [{
      owner: 'foo',
      name: 'bar',
      groups: [{groupType: 'WG'}],
    }];
    const cgData = {data: []};
    const repoMap = {
      'foo/bar': [{recTrack: false}],
    };
    const {errors} = validateRepo(repo, licenses, repoData, cgData, repoMap);
    assert.deepStrictEqual(filter(errors, ['inconsistentstatus']), [
      ['inconsistentstatus', {error: 'TR document: false, vs repo: true'}],
      ['inconsistentstatus', {error: 'TR document: false, vs repo manager: true'}],
    ]);
  });
});

describe('validateAshHooks', () => {
  it('no hooks', () => {
    const hooks = [];
    const errors = validateAshHooks(hooks);
    assert.deepStrictEqual(errors, [['missingashnazghook', {}]]);
  });

  it('one hook', () => {
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

  it('duplicate hooks', () => {
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

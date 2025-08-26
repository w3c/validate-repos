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
    const data = {
      ashRepo: null,
      specs: [],
      groups: [],
    };
    const licenses = {};
    const {
      errors,
      hasRecTrack,
      groups,
    } = validateRepo(repo, data, licenses);
    assert.deepStrictEqual(errors, [
      ['noreadme', null],
      ['nocodeofconduct', null],
      ['now3cjson', null],
      ['nodefaultbranch', null],
    ]);
    assert.strictEqual(hasRecTrack, false);
    assert.deepStrictEqual(groups, []);
  });

  it('invalid contributing and license', () => {
    const repo = {
      owner: {login: 'foo'},
      name: 'bar',
      contributing: {text: 'invalid CONTRIBUTING.md content'},
      license: {text: 'invalid LICENSE.md content'},
      w3cjson: {text: JSON.stringify({
        'repo-type': 'rec-track',
      })},
    };
    const data = {
      ashRepo: null,
      specs: [],
      groups: [],
    };
    const licenses = {
      license: 'mock LICENSE.md content',
      licenseSw: 'mock LICENSE-SW.md content',
      licenseCg: 'mock CG-LICENSE.md content',
      contributing: 'mock CONTRIBUTING.md content',
      contributingSw: 'mock CONTRIBUTING-SW.md content',
      contributingCg: 'mock CG-CONTRIBUTING.md content'
    };
    const {errors} = validateRepo(repo, data, licenses);
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

  it('invalid contributing and license', () => {
    const repo = {
      owner: {login: 'foo'},
      name: 'bar',
      contributing: {text: 'mock CONTRIBUTING.md content'},
      license: {text: 'Doc LICENSE.md content'},
      w3cjson: {text: JSON.stringify({
        'repo-type': 'rec-track',
      })},
    };
    const data = {
      ashRepo: null,
      specs: [],
      groups: [],
    };
    const licenses = {
      license: 'Doc LICENSE.md content',
      licenseSw: 'mock LICENSE-SW.md content',
      contributing: 'mock CONTRIBUTING.md content',
    };
    const {errors} = validateRepo(repo, data, licenses);
    const types = ['invalidlicense']
    assert.deepStrictEqual(filter(errors, types), [
      ['invalidlicense', {
        license: 'Doc LICENSE.md content',
        error: "doesn't match chartered SW license",
      }]
    ]);
  });

  it('invalid contributing and license for CGs', () => {
    const repo = {
      owner: {login: 'foo'},
      name: 'bar',
      contributing: {text: 'mock CONTRIBUTING.md content'},
      license: {text: 'Doc LICENSE.md content'},
      w3cjson: {text: JSON.stringify({
        'repo-type': 'cg-report',
      })},
    };
    const data = {
      ashRepo: null,
      specs: [],
      groups: [],
    };
    const licenses = {
      license: 'mock LICENSE.md content',
      licenseSw: 'mock LICENSE-SW.md content',
      licenseCg: 'mock CG-LICENSE.md content',
      contributing: 'mock CONTRIBUTING.md content',
      contributingSw: 'mock CONTRIBUTING-SW.md content',
      contributingCg: 'mock CG-CONTRIBUTING.md content'
    };
    const {errors} = validateRepo(repo, data, licenses);
    const types = ['invalidlicense', 'invalidcontributing']
    assert.deepStrictEqual(filter(errors, types), [
      ['invalidlicense', {
        license: 'Doc LICENSE.md content',
        error: "doesn't match CG license",
      }],
      ['invalidcontributing', {
        contributing: 'mock CONTRIBUTING.md content',
        error: "doesn't match CG contributing",
      }]
    ]);
  });

  it('pr-preview config is extracted', () => {
    const repo = {
      owner: {login: 'foo'},
      name: 'bar',
      prpreviewjson: {text: '{"aKey":"someValue"}'},
    };
    const data = {
      ashRepo: null,
      specs: [],
      groups: [],
    };
    const licenses = {};
    validateRepo(repo, data, licenses);
    assert.deepStrictEqual(repo.prpreview, {aKey: 'someValue'});
  });

  it('hardcoded repo data', () => {
    const repo = {
      owner: {login: 'w3c'},
      name: 'markup-validator',
    };
    const data = {
      ashRepo: null,
      specs: [],
      groups: [],
    };
    const licenses = {};
    validateRepo(repo, data, licenses);
    assert.deepStrictEqual(repo.w3c, {
      contacts: 'sideshowbarker',
      'repo-type': ['tool'],
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
      autoPublish: {text: 'mock yml content'},
      w3cjson: {text: JSON.stringify({
        contacts: [],
        group: ['42'],
        'repo-type': 'note',
      })},
      defaultBranch: {name: 'main'},
    };
    const data = {
      ashRepo: null,
      specs: [],
      groups: [],
    };
    const licenses = {
      license: 'mock LICENSE.md content',
      contributing: 'mock CONTRIBUTING.md content',
    };
    const {
      errors,
      hasRecTrack,
      groups,
    } = validateRepo(repo, data, licenses);
    assert.deepStrictEqual(errors, []);
    assert.strictEqual(hasRecTrack, false);
    assert.deepStrictEqual(groups, [42]);
  });

  it('minimal compliant WG repo with group shortname', () => {
    const repo = {
      owner: {login: 'foo'},
      name: 'bar',
      readme: true,
      codeofconduct: true,
      contributing: {text: 'mock CONTRIBUTING.md content'},
      license: {text: 'mock LICENSE.md content'},
      autoPublish: {text: 'mock yml content'},
      w3cjson: {text: JSON.stringify({
        contacts: [],
        group: ['wg/foo'],
        'repo-type': 'rec-track',
      })},
      defaultBranch: {name: 'main'},
      branchProtectionRules: {
        nodes: [{
          pattern: 'main',
          requiredApprovingReviewCount: 1,
          isAdminEnforced: true,
        }],
      },
    };
    const data = {
      ashRepo: {
        owner: 'foo',
        name: 'bar',
        groups: [{
          groupType: 'WG',
          w3cid: '43',
        }],
      },
      specs: [{recTrack: true}],
      groups: [],
    };
    const licenses = {
      license: 'mock non SW LICENSE.md content',
      licenseSw: 'mock LICENSE.md content',
      contributing: 'mock CONTRIBUTING.md content',
    };
    const w3cGroups = [{
      fullshortname: 'wg/foo',
      id: 43
    }];
    const {
      errors,
      hasRecTrack,
      groups,
    } = validateRepo(repo, data, licenses, w3cGroups);
    assert.deepStrictEqual(errors, []);
    assert.strictEqual(hasRecTrack, true);
    assert.deepStrictEqual(groups, [43]);
  });

  it('ill-formed w3c.json', () => {
    const repo = {
      owner: {login: 'foo'},
      name: 'bar',
      w3cjson: {text: 'ill-formed JSON'},
    };
    const data = {
      ashRepo: null,
      specs: [],
      groups: [],
    };
    const licenses = {};
    const {errors} = validateRepo(repo, data, licenses);
    assert.deepStrictEqual(filter(errors, ['illformedw3cjson']), [
      ['illformedw3cjson', null],
    ]);
  });

  it('use travis CI yml file', () => {
    const repo = {
      owner: {login: 'foo'},
      name: 'bar',
      travis: {text: 'mock yml content'},
    };
    const data = {
      ashRepo: null,
      specs: [],
      groups: [],
    };
    const licenses = {};
    const {errors} = validateRepo(repo, data, licenses);
    assert.deepStrictEqual(filter(errors, ['usetravisci']), [
      ['usetravisci', null],
    ]);
  });

  it('empty w3c.json', () => {
    const repo = {
      owner: {login: 'foo'},
      name: 'bar',
      w3cjson: {text: '{}'},
    };
    const data = {
      ashRepo: null,
      specs: [],
      groups: [],
    };
    const licenses = {};
    const {errors} = validateRepo(repo, data, licenses);
    assert.deepStrictEqual(filter(errors, ['incompletew3cjson']), [
      ['incompletew3cjson', {error: 'repo-type (unknown)'}],
      ['incompletew3cjson', {error: 'contacts'}],
    ]);
  });

  it('w3c.json groups', () => {
    const repo = {
      owner: {login: 'foo'},
      name: 'bar',
      w3cjson: {text: JSON.stringify({
        contacts: [],
        group: ['45'],
      })},
    };
    const data = {
      ashRepo: null,
      specs: [{group: 43}],
      groups: [45],
    };
    const licenses = {};
    const {groups} = validateRepo(repo, data, licenses);
    assert.deepStrictEqual(groups, [45]);
  });

  it('w3c.json with shortname groups', () => {
    const repo = {
      owner: {login: 'foo'},
      name: 'bar',
      w3cjson: {text: JSON.stringify({
        contacts: [],
        group: ['wg/foo'],
      })},
    };
    const w3cGroups = [{
      fullshortname: 'wg/foo',
      id: 43
    }];
    const data = {
      ashRepo: null,
      specs: [{group: 43}],
      groups: [45],
    };
    const licenses = {};
    const {groups} = validateRepo(repo, data, licenses, w3cGroups);
    assert.deepStrictEqual(groups, [43]);
  });

  it('w3c.json with invalid group shortname ', () => {
    const repo = {
      owner: {login: 'foo'},
      name: 'bar',
      w3cjson: {text: JSON.stringify({
        contacts: [],
        group: ['wg/bar'],
      })},
    };
    const w3cGroups = [{
      fullshortname: 'wg/foo',
      id: 43
    }];
    const data = {
      ashRepo: null,
      specs: [{group: 43}],
      groups: [45],
    };
    const licenses = {};
    const {errors, groups} = validateRepo(repo, data, licenses, w3cGroups);
    assert.deepStrictEqual(groups, []);
    assert.deepStrictEqual(filter(errors, ['invalidw3cjson']), [
      ['invalidw3cjson', {error: 'unknown group name: "wg/bar"'}]
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
    const data = {
      ashRepo: null,
      specs: [{recTrack: true}],
      groups: [],
    };
    const licenses = {};
    const {errors} = validateRepo(repo, data, licenses);
    assert.deepStrictEqual(filter(errors, ['invalidw3cjson']), [
      ['invalidw3cjson', {error: 'unknown types: ["foo"]'}],
      ['invalidw3cjson', {error: 'invalid contacts: [123]'}],
    ]);
  });

  for (const repoType of ['rec-track', 'cg-report']) {
    const data = {
      ashRepo: null,
      specs: repoType === 'rec-track' ? [{recTrack: true}] : [],
      groups: [],
    };
    const licenses = {};
    const w3cjson = {
      text: JSON.stringify({
        group: ['999'],
        'repo-type': repoType,
      })
    };

    it(`missing ashnazg for ${repoType}`, () => {
      const repo = {
        owner: {login: 'foo'},
        name: 'bar',
        w3cjson,
      };
      const {errors} = validateRepo(repo, data, licenses);
      assert.deepStrictEqual(filter(errors, ['noashnazg']), [
        ['noashnazg', null],
      ]);
    });

    it(`no default branch for ${repoType}`, () => {
      const repo = {
        owner: {login: 'foo'},
        name: 'bar',
        w3cjson,
      };
      const {errors} = validateRepo(repo, data, licenses);
      assert.deepStrictEqual(filter(errors, ['nodefaultbranch']), [
        ['nodefaultbranch', null],
      ]);
    });

    it(`uses master as default branch`, () => {
      const repo = {
        owner: {login: 'foo'},
        name: 'bar',
        defaultBranch: {name: 'master'}
      };
      const {errors} = validateRepo(repo, data, licenses);
      assert.deepStrictEqual(filter(errors, ['defaultbranchismaster']), [
        ['defaultbranchismaster', null],
      ]);
    });

    it(`missing branch protection for ${repoType}`, () => {
      const repo = {
        owner: {login: 'foo'},
        name: 'bar',
        w3cjson,
        defaultBranch: {name: 'main'},
        branchProtectionRules: {
          nodes: [],
        },
      };
      const {errors} = validateRepo(repo, data, licenses);
      assert.deepStrictEqual(filter(errors, ['unprotectedbranch']), [
        ['unprotectedbranch', {error: 'main branch is not protected'}],
      ]);
    });

    it(`missing required review for ${repoType}`, () => {
      const repo = {
        owner: {login: 'foo'},
        name: 'bar',
        w3cjson,
        defaultBranch: {name: 'main'},
        branchProtectionRules: {
          nodes: [{
            pattern: 'main',
            requiredApprovingReviewCount: null,
            isAdminEnforced: true,
          }],
        },
      };
      const {errors} = validateRepo(repo, data, licenses);
      assert.deepStrictEqual(filter(errors, ['norequiredreview']), [
        ['norequiredreview', {error: 'main branch review is not required'}],
      ]);
    });

    it(`branch protection admin enforced for ${repoType}`, () => {
      const repo = {
        owner: {login: 'foo'},
        name: 'bar',
        w3cjson,
        defaultBranch: {name: 'main'},
        branchProtectionRules: {
          nodes: [{
            pattern: 'main',
            requiredApprovingReviewCount: 1,
            isAdminEnforced: false,
          }],
        },
      };
      const {errors} = validateRepo(repo, data, licenses);
      assert.deepStrictEqual(filter(errors, ['unprotectedbranchforadmin']), [
        ['unprotectedbranchforadmin', {error: 'main branch protection is not admin enforced'}],
      ]);
    });
  }

  it('inconsistent status in repo manager', () => {
    const repo = {
      owner: {login: 'foo'},
      name: 'bar',
      w3cjson: {text: JSON.stringify({'repo-type': 'rec-track'})},
    };
    const data = {
      ashRepo: {
        owner: 'foo',
        name: 'bar',
        groups: [{groupType: 'CG'}],
      },
      specs: [{recTrack: true}],
      groups: [],
    };
    const licenses = {};
    const {errors} = validateRepo(repo, data, licenses);
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
    const data = {
      ashRepo: {
        owner: 'foo',
        name: 'bar',
        groups: [{groupType: 'WG'}],
      },
      specs: [{recTrack: false}],
      groups: [],
    };
    const licenses = {};
    const {errors} = validateRepo(repo, data, licenses);
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
    assert.deepStrictEqual(errors, [['missingashnazghook', null]]);
  });

  it('one hook', () => {
    const hooks = [{
      config: {
        url: 'https://labs.w3.org/repo-manager/api/hook',
        content_type: 'json',
        insecure_ssl: '0',
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
        content_type: 'json',
        insecure_ssl: '0',
        secret: 'value',
      }
    }, {
      config: {
        url: 'https://labs.w3.org/repo-manager/api/hook',
        content_type: 'json',
        insecure_ssl: '0',
        secret: 'value',
      }
    }];
    const errors = validateAshHooks(hooks);
    assert.deepStrictEqual(errors, [['duplicateashnazghooks', null]]);
  });
});

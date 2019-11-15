/* eslint-env node, mocha */

'use strict';

const assert = require('assert');
const proxyquire = require('proxyquire');
const sinon = require('sinon');

describe('w3cLicenses', () => {
  it('happy path', async () => {
    const graphql = sinon.fake.resolves({
      repository: {
        contributing: {
          text: 'mock WG-CONTRIBUTING.md content'
        },
        contributingSw: {
          text: 'mock WG-CONTRIBUTING-SW.md content'
        },
        license: {
          text: 'mock WG-LICENSE.md content'
        },
        licenseSw: {
          text: 'mock WG-LICENSE-SW.md content'
        },
      }
    });
    const licenses = proxyquire('../lib/w3cLicenses.js', {
      './graphql.js': graphql
    });
    const lic = await licenses();
    assert.deepStrictEqual(lic, {
      contributing: 'mock WG-CONTRIBUTING.md content',
      contributingSw: 'mock WG-CONTRIBUTING-SW.md content',
      license: 'mock WG-LICENSE.md content',
      licenseSw: 'mock WG-LICENSE-SW.md content',
    });
    assert(graphql.calledOnce);
  });

  it('no files found', async () => {
    const graphql = sinon.fake.resolves({repository: {}});
    const licenses = proxyquire('../lib/w3cLicenses.js', {
      './graphql.js': graphql
    });
    const lic = await licenses();
    assert.deepStrictEqual(lic, {});
    assert(graphql.calledOnce);
  });

  it('graphql error', async () => {
    const graphql = sinon.fake.rejects(new Error('mock error'));
    const licenses = proxyquire('../lib/w3cLicenses.js', {
      './graphql.js': graphql
    });
    // The retry logic is broken, rejection is not handled.
    await assert.rejects(licenses(), {
      message: 'mock error'
    });
    assert(graphql.calledOnce);
  });

  afterEach(() => sinon.restore());
});

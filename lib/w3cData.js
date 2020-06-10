/* eslint-env node */

// Additional W3C data about a repo that isn't from the GitHub repo/API.

"use strict";

const fetch = require("node-fetch");
const w3c = require("node-w3capi");

const config = require("../config.json");
w3c.apiKey = config.w3capikey;

const orgToOwner = {
  "WICG": 80485,
  "webassembly": 78073,
  "immersive-web": 87846,
  "w3ctag": 34270,
  "w3cping": 52497,
  "privacycg": 120428,
  "gpuweb": 96877
}

async function data() {
  const [ashRepos, cgData, repoMap, w3cgroups] = await Promise.all([
    fetch("https://labs.w3.org/hatchery/repo-manager/api/repos").then(r => r.json()),
    fetch("https://w3c.github.io/cg-monitor/report.json").then(r => r.json()),
    fetch("https://w3c.github.io/spec-dashboard/repo-map.json").then(r => r.json()),
    // https://github.com/w3c/node-w3capi/issues/41
    new Promise((resolve, reject) => {
      w3c.groups().fetch({embed: true}, (err, w3cgroups) => {
        if (err) {
          reject(err);
        } else {
          resolve(w3cgroups);
        }
      });
    })
  ]);

  function get(owner, name) {
    const fullName = `${owner}/${name}`;
    const ashRepo = ashRepos.find(x => {
      return x.owner.toLowerCase() === owner.toLowerCase() &&
          x.name.toLowerCase() === name.toLowerCase();
    }) || null;
    const cg = cgData.data.find(cg => {
      return cg.repositories.includes(`https://github.com/${fullName}`) ||
          cg.repositories.includes(`https://github.com/${fullName}/`);
    });
    const specs = repoMap[fullName] || [];

    const groups = [];
    if (cg) {
      groups.push(cg.id);
    } else if (orgToOwner[owner]) {
      groups.push(orgToOwner[owner]);
    }
    for (const spec of specs) {
      groups.push(spec.group);
    }
    if (owner === 'WebAudio') {
      groups.push(46884);
    }

    return {ashRepo, specs, groups};
  }

  return {get, w3cgroups};
}

module.exports = data;

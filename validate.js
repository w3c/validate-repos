/* eslint-env node */

"use strict";

const github = require("./lib/github.js");
const validator = require("./lib/validator.js");
const w3cData = require("./lib/w3cData.js");
const w3cLicenses = require("./lib/w3cLicenses.js");

const orgs = ["w3c", "WebAudio", "immersive-web", "webassembly", "w3ctag", "WICG", "w3cping"];
const errortypes = [
  "inconsistentgroups",
  "now3cjson",
  "invalidw3cjson",
  "illformedw3cjson",
  "incompletew3cjson",
  "nocontributing",
  "invalidcontributing",
  "nolicense",
  "nocodeofconduct",
  "invalidlicense",
  "noreadme",
  "noashnazg",
  "inconsistentstatus",
  "unprotectedbranch",
  "unprotectedbranchforadmin",
  "norequiredreview",
  "missingashnazghook",
  "duplicateashnazghooks"
];

async function validate() {
  const data = await w3cData();
  const licenses = await w3cLicenses();

  const allrepos = [];
  for (const org of orgs) {
    for await (const repo of github.listRepos(org)) {
      if (!repo.isPrivate) {
        allrepos.push(repo);
      }
    }
  }
  const fullName = r => r.owner.login + '/' + r.name;
  allrepos.sort((r1, r2) => fullName(r1).localeCompare(fullName(r2)));

  const allerrors = {};
  for (const type of errortypes) {
    allerrors[type] = [];
  }
  function pushErrors(repo, errors) {
    for (const [type, details] of errors) {
      if (!(type in allerrors)) {
        throw new Error(`Unexpected error type: ${type}`);
      }
      // Push just the repo name string if there are no details, and otherwise
      // add it as a `repo` property to the details object.
      if (details === null) {
        allerrors[type].push(fullName(repo));
      } else {
        allerrors[type].push({repo: fullName(repo), ...details});
      }
    }
  }
  const allgroups = new Set();
  const groupRepos = {};
  for (const r of allrepos) {
    if (!r || r.isArchived) {
      continue;
    }

    const repoData = data.get(r.owner.login, r.name);

    const {errors, groups, hasRecTrack} = validator.validateRepo(r, repoData, licenses);
    pushErrors(r, errors);
    for (const gid of groups) {
      allgroups.add(gid);
      if (!groupRepos[gid]) {
        groupRepos[gid] = [];
      }
      groupRepos[gid].push({
        name: r.name,
        fullName: fullName(r),
        // Only include `hasRecTrack` in report.json if it's true. This is
        // simply to match the original structure. TODO: include if false.
        hasRecTrack: hasRecTrack ? true : undefined,
      });
    }
    if (repoData.ashRepo) {
      const hooks = await github.listRepoHooks(r.owner.login, r.name);
      const errors = validator.validateAshHooks(hooks);
      pushErrors(r, errors);
    }
  }

  const {w3cgroups} = data;

  const results = {};
  results.errors = allerrors;
  results.timestamp = new Date();
  results.repos = allrepos;
  results.groups = w3cgroups.filter(g => allgroups.has(g.id)).reduce((acc, group) => {
    acc[group.id] = {...group, repos: groupRepos[group.id]};
    return acc;
  }, {});
  console.log(JSON.stringify(results, null, 2));
}

validate().catch((reason) => {
  console.error(reason);
  process.exit(1);
});

/* eslint-env node */

"use strict";

const fetch = require("node-fetch");
const w3c = require("node-w3capi");
const graphql = require("./graphql.js");
// github API v3 needed to check webhooks
const Octokat = require("octokat");

const w3cLicenses = require("./w3cLicenses.js");
const config = require("./config.json");

const ashnazgHookUrls = ["https://labs.w3.org/hatchery/repo-manager/api/hook", "https://labs.w3.org/repo-manager/api/hook"];

w3c.apiKey = config.w3capikey;
const octo = new Octokat({ token: config.ghToken });

const orgs = ["w3c", "WebAudio", "immersive-web", "webassembly", "w3ctag", "WICG", "w3cping"];
const errors = {"inconsistentgroups": [], "now3cjson":[], "invalidw3cjson": [], "illformedw3cjson":[], "incompletew3cjson":[], "nocontributing":[], "invalidcontributing": [], "nolicense": [], "nocodeofconduct": [], "invalidlicense": [], "noreadme": [],  "noashnazg": [], "inconsistentstatus": [], "unprotectedbranch": [], "missingashnazghook": [], "duplicateashnazghooks": []};

// for some repos, having the w3c.json administrative file is felt as awkward
// we hard-code their equivalent here
const hardcodedRepoData = {
  'w3c/markup-validator': {
    'contacts': 'sideshowbarker',
    'repo-type': 'tool'
  },
  'w3c/css-validator': {
    'contacts': 'ylafon',
    'repo-type': 'tool'
  },
  'w3c/respec': {
    'contacts': 'marcoscaceres',
    'repo-type': 'tool'
  },
  'w3c/respec-hljs': {
    'contacts': 'marcoscaceres',
    'repo-type': 'tool'
  },
  'w3c/webidl2.js': {
    'contacts': 'marcoscaceres',
    'repo-type': 'tool'
  },
}

// extract from https://w3c.github.io/w3c.json.html with [...document.querySelectorAll('#repo-type + dd .value')].map(n => n.textContent)
const validRepoTypes = ['rec-track', 'note', 'cg-report', 'process', 'homepage', 'article', 'tool', 'project', 'others', 'workshop', 'tests', 'translation'];

const arrayify = x => Array.isArray(x) ? x : [x];
const repoSort = (r1, r2) => typeof r1 === "string" ? r1.localeCompare(r2) : r1.repo.localeCompare(r2.repo);

const nlToSpace = str => str.replace(/\n/g, " ").replace(/ {2}/g, " ").trim();
const httpToHttps = str => str.replace(/http:\/\/www.w3.org\//g, "https://www.w3.org/");

const mdMatch = (md, ref) => nlToSpace(httpToHttps(md.toLowerCase())).indexOf(nlToSpace(ref.toLowerCase())) !== -1;

const fullName = r => r.owner.login + '/' + r.name;

async function fetchLabelPage(org, repo, acc = [], cursor = null) {
  console.warn("Fetching labels for " + repo);
  let res;
  try {
    res = await graphql(`
 query {
    repository(owner:"${org}",name:"${repo}") {
        labels(first:10 ${cursor ? 'after:"' + cursor + '"' : ''}) {
            edges {
              node {
                name
                color
              }
            }
            pageInfo {
              endCursor
              hasNextPage
            }
         }
    }

}`);
  } catch (err) {
    console.error("query failed " + JSON.stringify(err));
  }
  if (res && res.repository) {
    const data = acc.concat(res.repository.labels.edges);
    if (res.repository.labels.pageInfo.hasNextPage) {
      return fetchLabelPage(org, repo, data, res.repository.labels.pageInfo.endCursor);
    } else {
      return {"repo": {"owner": org, "name": repo}, "labels": data.map(e => e.node)};
    }
  } else {
    console.error("Fetching label for " + repo + " at cursor " + cursor + " failed with " + JSON.stringify(res)+ ", not retrying");
    return {"repo": {"owner": org, "name": repo}, "labels": acc.map(e => e.node) };
    //return fetchLabelPage(org, repo, acc, cursor);
  }
}

async function fetchRepoPage(org, acc = [], cursor = null) {
  let res;
  try {
    res = await graphql(`
 query {
  organization(login:"${org}") {
    repositories(first:10 ${cursor ? 'after:"' + cursor + '"' : ''}) {
      edges {
        node {
          id, name, owner { login } , isArchived, homepageUrl, description, isPrivate, createdAt
          labels(first:10) {
            edges {
              node {
                name
                color
              }
            }
            pageInfo {
              endCursor
              hasNextPage
            }
          }
          defaultBranch: defaultBranchRef {
            name
          }
          branchProtectionRules(first: 5) {
            nodes {
              pattern
              requiredApprovingReviewCount
              requiredStatusCheckContexts
              isAdminEnforced
            }
          }
          w3cjson: object(expression: "HEAD:w3c.json") {
            ... on Blob {
              text
            }
          }
          prpreviewjson: object(expression: "HEAD:.pr-preview.json") {
            ... on Blob {
              text
            }
          }
          contributing: object(expression: "HEAD:CONTRIBUTING.md") {
            ... on Blob {
              text
            }
          }
          license: object(expression: "HEAD:LICENSE.md") {
            ... on Blob {
              text
            }
          }
          codeOfConduct { body }
          readme: object(expression: "HEAD:README.md") {
            ... on Blob {
              text
            }
          }
        }
        cursor
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
  rateLimit {
    limit
    cost
    remaining
    resetAt
  }
 }`);
  } catch (err) {
    console.error(err);
  }
  // Fetch labels if they are paginated
  if (res && res.organization) {
    console.error("GitHub rate limit: " + JSON.stringify(res.rateLimit));
    return Promise.all(
      res.organization.repositories.edges
        .filter(e => e.node.labels.pageInfo.hasNextPage)
        .map(e => fetchLabelPage(e.node.owner.login, e.node.name, e.node.labels.edges, e.node.labels.pageInfo.endCursor))
    ).then((labelsPerRepos) => {
      const data = acc.concat(res.organization.repositories.edges.map(e => e.node));
      labelsPerRepos.forEach(({repo, labels}) => {
        data.find(r => r.owner.login == repo.owner && r.name == repo.name).labels = labels;
      });
      if (res.organization.repositories.pageInfo.hasNextPage) {
        return fetchRepoPage(org, data, res.organization.repositories.pageInfo.endCursor);
      } else {
        return data;
      }
    });
  } else {
    console.error("Fetching repo results at cursor " + cursor + " failed, retrying");
    return fetchRepoPage(org, acc, cursor);
  }
}

async function validate() {
  let allgroups = new Set();

  const licenses = await w3cLicenses();
  const {contributing, contributingSw, license, licenseSw} = licenses;

  async function sequenced(index) {
    if (index === orgs.length) return [];
    let repos = await fetchRepoPage(orgs[index]);
    let next = await sequenced(index+1);
    return repos.concat(next);
  }
  const allrepos = await sequenced(0);

  const [repoData, cgData, repoMap] = await Promise.all([
    fetch("https://labs.w3.org/hatchery/repo-manager/api/repos").then(r => r.json()),
    fetch("https://w3c.github.io/cg-monitor/report.json").then(r => r.json()),
    fetch("https://w3c.github.io/spec-dashboard/repo-map.json").then(r => r.json())
  ]);

  const ashRepos = [];
  const groupRepos = {};
  allrepos.filter(r => r && !r.isArchived && !r.isPrivate).forEach(r => {
    if (!r.readme) {
      errors.noreadme.push(fullName(r));
    }
    if (!r.codeofconduct) {
      errors.nocodeofconduct.push(fullName(r));
    }
    if (!r.license || !r.license.text) {
      errors.nolicense.push(fullName(r));
    } else {
      if (!mdMatch(r.license.text, license) && !mdMatch(r.license.text, licenseSw))
        errors.invalidlicense.push({ repo: fullName(r), error: "doesn't match SW or DOC license", license: r.license.text });
    }
    if (!r.contributing || !r.contributing.text) {
      errors.nocontributing.push(fullName(r));
    } else {
      if (!mdMatch(r.contributing.text, contributing) && !mdMatch(r.contributing.text, contributingSw))
        errors.invalidcontributing.push({ repo: fullName(r), error: "doesn't match SW or DOC contributing", contributing: r.contributing.text });
    }
    let shouldBeRepoManaged = false;
    let hasRecTrack = {ashnazg: null, repotype:null, tr: null}; // TODO detect conflicting information (repo-type vs ash-nazg vs TR doc)

    let groups = [];
    // is the repo associated with a CG in the CG monitor?
    const cgRepo = cgData.data.find(cg => cg.repositories.includes('https://github.com/' + fullName(r) || cg.repositories.includes('https://github.com/' + fullName(r) + '/'))) ||
          // is the repo in WICG space?
          (r.owner.login === 'WICG' ? {id: 80485} : null);
    // is the repo associated with a WG in the spec dashboard?
    const wgRepo = repoMap[fullName(r)];
    const audioWgRepo = r.owner.login === 'WebAudio' ? {id: 46884} : null;
    if (wgRepo)
      hasRecTrack.tr = wgRepo.some(x => x.recTrack);

    const ashRepo = repoData.find(x => x.owner.toLowerCase() === r.owner.login.toLowerCase() && x.name.toLowerCase() === r.name.toLowerCase());
    if (ashRepo) {
      hasRecTrack.ashnazg = ashRepo.groups.some(g => g.groupType === "WG");
      ashRepos.push(fullName(r));
    }
    if (r.prpreviewjson) {
      try {
        r.prpreview = JSON.parse(r.prpreviewjson.text);
      } catch (e) {
        //errors.illformedprpreviewcjson.push(fullName(r));
      }
    }

    let conf = null;
    if (r.w3cjson) {
      try {
        conf = JSON.parse(r.w3cjson.text);
      } catch (e) {
        errors.illformedw3cjson.push(fullName(r));
      }
    } else if (hardcodedRepoData[fullName(r)]) {
      conf = hardcodedRepoData[fullName(r)];
    }
    if (conf) {
      r.w3c = conf;
      // TODO: replace with JSON schema?
      if (!conf["repo-type"]) {
        errors.incompletew3cjson.push({repo: fullName(r), error: "repo-type" + (Object.values(hasRecTrack).every(x => x === null) ? " (unknown)" : (hasRecTrack.tr || hasRecTrack.ashnazg ? " (rec-track)" : " (not rec-track)")) });
      } else {
        hasRecTrack.repotype = arrayify(conf["repo-type"]).includes('rec-track') ;

        const unknownTypes = arrayify(conf['repo-type']).filter(t => !validRepoTypes.includes(t));
        if (unknownTypes.length) {
          errors.invalidw3cjson.push({repo: fullName(r), error: "unknown types: " + JSON.stringify(unknownTypes)});
        }
      }
      if (!conf.group && ["rec-track", "note", "cg-report"].includes(conf["repo-type"])) {
        errors.incompletew3cjson.push({repo: fullName(r), error: "group"});
      } else {
        groups = arrayify(conf.group).map(id => parseInt(id, 10));
        shouldBeRepoManaged = conf["repo-type"] && (conf["repo-type"] === 'rec-track' || conf["repo-type"] === 'cg-report');
      }
      if (!conf.contacts) {
        errors.incompletew3cjson.push({repo: fullName(r), error: "contacts"});
      } else {
        if (arrayify(conf.contacts).some(x => typeof x !== "string")) {
          errors.invalidw3cjson.push({repo: fullName(r), error: "invalid contacts: " + JSON.stringify(conf.contacts)});
        }
      }
    } else {
      if (cgRepo) {
        groups = [cgRepo.id];
      }
      if (wgRepo && wgRepo.length) {
        groups = groups.concat(wgRepo.map(x => x.group));
      }
      if (audioWgRepo) {
        groups.push(audioWgRepo.id);
      }
      errors.now3cjson.push(fullName(r));
    }
    const recTrackStatus = hasRecTrack.tr || hasRecTrack.ashnazg || hasRecTrack.repo;
    shouldBeRepoManaged = shouldBeRepoManaged || recTrackStatus;

    allgroups = new Set([...allgroups, ...groups]);

    if (shouldBeRepoManaged) {
      if (!ashRepo) {
        errors.noashnazg.push(fullName(r));
      } else {
        const ashGroups = ashRepo.groups.map(g => parseInt(g.w3cid, 10));
        if (ashGroups.filter(x => groups.includes(x)).length !== ashGroups.length) {
          errors.inconsistentgroups.push({repo: fullName(r), ashnazgroups: ashGroups, error: JSON.stringify(groups) + ' vs ' + JSON.stringify(ashGroups)});
        }
      }
    }
    if (recTrackStatus) {
      if (!r.branchProtectionRules || r.branchProtectionRules.nodes.length < 1) {
        errors.unprotectedbranch.push({repo: fullName(r), error: "No protected branch"});
      }
    }
    if (hasRecTrack.tr !== null && hasRecTrack.repotype !== null && hasRecTrack.tr !== hasRecTrack.repotype) {
      errors.inconsistentstatus.push({repo: fullName(r), error: "TR document: " + hasRecTrack.tr + ", vs repo: " + hasRecTrack.repotype});
    }
    if (hasRecTrack.tr !== null && hasRecTrack.ashnazg !== null && hasRecTrack.tr !== hasRecTrack.ashnazg) {
      errors.inconsistentstatus.push({repo: fullName(r), error: "TR document: " + hasRecTrack.tr + ", vs repo manager: " + hasRecTrack.ashnazg});
    }
    if (hasRecTrack.repotype !== null && hasRecTrack.ashnazg !== null && hasRecTrack.repotype !== hasRecTrack.ashnazg) {
      errors.inconsistentstatus.push({repo: fullName(r), error: "repo: " + hasRecTrack.repotype + ", vs repo manager: " + hasRecTrack.ashnazg});
    }

    groups.forEach(gid => {
      if (!groupRepos[gid])
        groupRepos[gid] = [];
      groupRepos[gid].push({ name: r.name, fullName: fullName(r), hasRecTrack: recTrackStatus });
    });
  });

  Object.keys(errors).forEach(k => {
    errors[k] = errors[k].sort(repoSort);
  });
  let promise = Promise.resolve();
  // TODO: replace with a proper request queue
  // à la https://github.com/w3c/spec-dashboard/blob/master/fetch-data/group-repos.js#L14
  ashRepos.forEach(reponame =>
    promise = promise
      .then(() =>
        octo.repos(reponame).hooks.fetch().then(hooks => {
          if (!hooks || !hooks.items) return;
          const ashHooks = hooks.items.filter(h => ashnazgHookUrls.includes(h.config.url) && h.config.contentType === "json" && h.config.insecureSsl === "0" && h.config.secret !== "");
          if (ashHooks.length === 0)
            errors.missingashnazghook.push({repo: reponame});
          if (ashHooks.length > 1)
            errors.duplicateashnazghooks.push({repo: reponame});
        }).catch(err => console.error(err))
          .then(new Promise((res, rej) => {
            setTimeout(rej, 1000);
          }))
      )
  );
  await promise;

  const w3cgroups = await new Promise((resolve, reject) => {
    // https://github.com/w3c/node-w3capi/issues/41
    w3c.groups().fetch({embed: true}, (err, w3cgroups) => {
      if (err) {
        reject(err);
      } else {
        resolve(w3cgroups);
      }
    });
  });

  const results = {errors};
  results.timestamp = new Date();
  results.repos = allrepos;
  results.groups = w3cgroups.filter(g => allgroups.has(g.id)).reduce((acc, group) => {
    acc[group.id] = {...group, repos: groupRepos[group.id] };
    return acc;
  }, {});
  console.log(JSON.stringify(results, null, 2));
}

validate().catch((reason) => {
  console.error(reason);
  process.exit(1);
});

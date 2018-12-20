const fetch = require("node-fetch");
const w3c = require("node-w3capi");
const graphql = require("./graphql.js");


const w3cLicenses = require("./w3cLicenses.js");
const config = require("./config.json");

w3c.apiKey = config.w3capikey;

const orgs = ["w3c", "WebAudio", "immersive-web", "webassembly", "w3ctag", "WICG"];
const errors = {"inconsistentgroups": [], "now3cjson":[], "invalidw3cjson": [], "illformedw3cjson":[], "incompletew3cjson":[], "nocontributing":[], "invalidcontributing": [], "nolicense": [], "nocodeofconduct": [], "invalidlicense": [], "noreadme": [],  "noashnazg": [], "inconsistentstatus": []};

// extract from https://w3c.github.io/w3c.json.html with [...document.querySelectorAll('#repo-type + dd .value')].map(n => n.textContent)
const validRepoTypes = ['rec-track', 'note', 'cg-report', 'process', 'homepage', 'article', 'tool', 'project', 'others'];


let allgroups = new Set();
let groupRepos = {};
let crawl;
let contributing, contributingSw, license, licenseSw;


const arrayify = x => Array.isArray(x) ? x : [x];
const repoSort = (r1, r2) => typeof r1 === "string" ? r1.localeCompare(r2) : r1.repo.localeCompare(r2.repo);

const nlToSpace = str => str.replace(/\n/g, " ").replace(/  /g, " ").trim();
const httpToHttps = str => str.replace(/http:\/\/www.w3.org\//g, "https://www.w3.org/");

const mdMatch = (md, ref) => nlToSpace(httpToHttps(md.toLowerCase())).indexOf(nlToSpace(ref.toLowerCase())) !== -1;

const fullName = r => r.owner.login + '/' + r.name;

async function fetchLabelPage(org, repo, acc = [], cursor = null) {
  let res = await graphql(`
 query {
    repository(owner:"${org}",name:"${repo}") {
        labels(first: 100 after:"${cursor}") {
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
    const data = acc.concat(res.repository.labels.edges);
    if (res.repository.labels.pageInfo.hasNextPage) {
      return fetchLabelPage(org, repo, data, res.repository.labels.pageInfo.endCursor);
  } else {
    return data.map(e => e.node);
  }
}

async function fetchRepoPage(org, acc = [], cursor = null) {
  let res = await graphql(`
 query {
  organization(login:"${org}") {
    repositories(first:100 after:"${cursor}") {
      edges {
        node {
          id, name, owner { login } , isArchived, homepageUrl, description
          labels(first: 100) {
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
          w3cjson: object(expression: "HEAD:w3c.json") {
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
 }`);
  // Fetch labels if they are paginated
  return Promise.all(
    res.organization.repositories.edges
      .filter(e => e.node.labels.pageInfo.hasNextPage)
      .map(e => fetchLabelPage(e.node.owner.login, e.node.name, e.node.labels.edges, e.node.labels.pageInfo.endCursor))
  ).then(() => {
    const data = acc.concat(res.organization.repositories.edges.map(e => e.node));
    if (res.organization.repositories.pageInfo.hasNextPage) {
      return fetchRepoPage(org, data, res.organization.repositories.pageInfo.endCursor);
    } else {
      return data;
    }
  });
}

Promise.all(orgs.map(org => fetchRepoPage(org)))
  .then(res => crawl = [].concat(...res))
  .then(w3cLicenses)
  .then(lic => {
    contributing = lic.contributing;
    contributingSw = lic.contributingSw;
    license = lic.license;
    licenseSw = lic.licenseSw;
  }).then(() => Promise.all([
    fetch("https://labs.w3.org/hatchery/repo-manager/api/repos").then(r => r.json()),
    fetch("https://w3c.github.io/cg-monitor/report.json").then(r => r.json()),
    fetch("https://w3c.github.io/spec-dashboard/repo-map.json").then(r => r.json())
  ]))
  .then(([repoData, cgData, repoMap]) => {
    crawl.filter(r => !r.isArchived).forEach(r => {
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
      const cgRepo = cgData.data.find(cg => cg.repositories.includes('https://github.com/' + fullName(r) || cg.repositories.includes('https://github.com/' + fullName(r) + '/')));
      // is the repo associated with a WG in the spec dashboard?
      const wgRepo = repoMap[fullName(r)];

      if (wgRepo)
        hasRecTrack.tr = wgRepo.some(x => x.recTrack);

      const ashRepo = repoData.find(x => x.owner.toLowerCase() === r.owner.login.toLowerCase() && x.name.toLowerCase() === r.name.toLowerCase());
      if (ashRepo)
        hasRecTrack.ashnazg = ashRepo.groups.some(g => g.groupType === "WG");

      if (r.w3cjson) {
        let conf = null;
        try {
          conf = JSON.parse(r.w3cjson.text);
        } catch (e) {
          errors.illformedw3cjson.push(fullName(r));
        }
        if (conf) {
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
        }
      } else {
        if (cgRepo) {
          groups = [cgRepo.id];
        }
        if (wgRepo && wgRepo.length) {
          groups = groups.concat(wgRepo.map(x => x.group));
        }
        errors.now3cjson.push(fullName(r));
      }
      shouldBeRepoManaged = shouldBeRepoManaged || (wgRepo && wgRepo.some(x => x.recTrack));

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
      if (hasRecTrack.tr !== null && hasRecTrack.repotype !== null && hasRecTrack.tr !== hasRecTrack.repotype) {
        errors.inconsistentstatus.push({repo: fullName(r), error: "TR document: " + hasRecTrack.tr + ", vs repo: " + hasRecTrack.repotype});
      }
      if (hasRecTrack.tr !== null && hasRecTrack.ashnazg !== null && hasRecTrack.tr !== hasRecTrack.ashnazg) {
        errors.inconsistentstatus.push({repo: fullName(r), error: "TR document: " + hasRecTrack.tr + ", vs repo manager: " + hasRecTrack.ashnazg});
      }
      if (hasRecTrack.repotype !== null && hasRecTrack.ashnazg !== null && hasRecTrack.repotype !== hasRecTrack.ashnazg) {
        errors.inconsistentstatus.push({repo: fullName(r), error: "repo: " + hasRecTrack.repotype + ", vs repo manager: " + hasRecTrack.ashnazg});
      }
      const recTrackStatus = hasRecTrack.tr || hasRecTrack.ashnazg || hasRecTrack.repo;
      groups.forEach(gid => {
        if (!groupRepos[gid])
          groupRepos[gid] = [];
        groupRepos[gid].push({ ...r, fullName: fullName(r), hasRecTrack: recTrackStatus });
      });
    });
    Object.keys(errors).forEach(k => {
      errors[k] = errors[k].sort(repoSort);
    });
    w3c.groups().fetch({embed: true}, (err, w3cgroups) => {
      const results = {errors};
      results.groups = w3cgroups.filter(g => allgroups.has(g.id)).reduce((acc, group) => {
        acc[group.id] = {...group, repos: groupRepos[group.id] };
        return acc;
      }, {});
      console.log(JSON.stringify(results, null, 2));
    });

  });

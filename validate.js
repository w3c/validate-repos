const fetch = require("node-fetch");
const Octokat = require("octokat");
const config = require("./config.json");

const ghBlobToString = blob => new Buffer(blob.content, 'base64').toString('utf8');
const nlToSpace = str => str.replace(/\n/g, " ").replace(/  /g, " ").trim();
const httpToHttps = str => str.replace(/http:\/\/www.w3.org\//g, "https://www.w3.org/");

const mdMatch = (md, ref) => nlToSpace(httpToHttps(md.toLowerCase())).indexOf(nlToSpace(ref.toLowerCase())) !== -1;

fetch("https://w3c.github.io/spec-dashboard/groups.json")
    .then(r => r.json())
    .then(groupData => {
        const groupIds = Object.keys(groupData);
        Promise.all(groupIds.map(id =>
                                 fetch("https://w3c.github.io/spec-dashboard/pergroup/" + id + "-repo.json")
                                 .then(r=>r.json())
                                 .then(specs => {
                                     return {groupId: id,
                                             specs
                                            }
                                     ;})
                                 .catch(err => console.error("Failed to fetch data for group " + id + ": " + err))))
            .then(results => {
                const repos = new Set();
                const repoOwners = {};
                results.filter(x => x && x.specs)
                    .forEach(groupSpecs => {
                        repoOwners[groupSpecs.groupId] = {};
                        repoOwners[groupSpecs.groupId].name =groupData[groupSpecs.groupId].name;
                        repoOwners[groupSpecs.groupId].repos = new Set();
                        Object.keys(groupSpecs.specs)
                        // we only care about rec-track specs for this report
                            .filter(s => groupSpecs.specs[s].recTrack)
                            .forEach(spec => {
                                 const repoFullname = groupSpecs.specs[spec].repo.owner + '/' + groupSpecs.specs[spec].repo.name;
                                repoOwners[groupSpecs.groupId].repos.add(repoFullname);
                                repos.add(repoFullname)
                            });
                        repoOwners[groupSpecs.groupId].repos = [...repoOwners[groupSpecs.groupId].repos];
                    });
                let contributing, contributingSw, license, licenseSw;
                const octo = new Octokat({ token: config.ghToken });
                const errors = {"now3cjson":[], "invalidcontacts":[], "nocontributing":[], "invalidcontributing": [], "nolicense": [], "nocodeofconduct": [], "invalidlicense": [], "noreadme": [], "contacts": new Set(), "noashnazg": []};

                fetch("https://labs.w3.org/hatchery/repo-manager/api/repos")
                    .then(r => r.json())
                    .then(repoData => {
                        const groupsWithAshNazg = repoData.map(r => r.fullName.toLowerCase());
                        errors.noashnazg = [...repos].map(r => r.toLowerCase()).filter(r => groupsWithAshNazg.indexOf(r) === -1);
                        return Promise.all([...repos].map(repofullname => {
                    return octo.repos('w3c/licenses').contents('WG-CONTRIBUTING.md').fetch().then(ghBlobToString).then(text => contributing = text)
                        .then(() => octo.repos('w3c/licenses').contents('WG-CONTRIBUTING-SW.md').fetch().then(ghBlobToString).then(text => contributingSw = text))
                        .then(() => octo.repos('w3c/licenses').contents('WG-LICENSE.md').fetch().then(ghBlobToString).then(text => license = text))
                        .then(() => octo.repos('w3c/licenses').contents('WG-LICENSE-SW.md').fetch().then(ghBlobToString).then(text => licenseSw = text))
                        .then(() =>
                              octo.repos(...repofullname.split('/'))
                              .contents('w3c.json').fetch())
                        .then(ghBlobToString)
                        .then(str => JSON.parse(str))
                        .then(function(w3cinfo) {
                            return Promise.all(w3cinfo.contacts.map(function(username) {
                                if (typeof username !== "string") {
                                    errors.invalidcontacts.push({repo: repofullname, value: username});
                                    return;
                                } else {
                                    return octo.users(username).fetch()
                                        .then(function(u) {
                                            errors.contacts.add(u.email ? u.email : u.login);
/*                                            if (!u.email) {
                                                console.error("Cannot determine email of " + u.login + ", listed as contact for " + repofullname);
                                                }*/
                                            return;
                                        }, () => errors.invalidcontacts.push({repo: repofullname, value: username}));
                                }
                            }));
                        }).catch(() => errors.now3cjson.push(repofullname))
                            .then(() => octo.repos(...repofullname.split('/'))
                                  .contents('CONTRIBUTING.md').fetch()
                                  .then(ghBlobToString)
                                  .then((repoContributing) => {
                                      if (!mdMatch(repoContributing, contributing) && !mdMatch(repoContributing,contributingSw)) errors.invalidcontributing.push({repo: repofullname, contributing: repoContributing});
                                  }, () => errors.nocontributing.push(repofullname)))
                        .then(() => octo.repos(...repofullname.split('/'))
                              .contents('LICENSE.md').fetch()
                              .then(ghBlobToString)
                              .then((repoLicense) => {
                                  if (!mdMatch(repoLicense, license) && !mdMatch(repoLicense, licenseSw)) errors.invalidlicense.push({repo: repofullname, license: repoLicense});

                              }, () => errors.nolicense.push(repofullname)))
                        .then(() => octo.repos(...repofullname.split('/'))
                              .contents('CODE_OF_CONDUCT.md').fetch()
                              .then(ghBlobToString)
                              .then((repoLicense) => {
                                  // test content
                              }, () => errors.nocodeofconduct.push(repofullname)))
                        .then(() => octo.repos(...repofullname.split('/'))
                              .contents('README.md').fetch()
                              .then(ghBlobToString)
                              .then(() => {
                                  // test content
                              }, () => errors.noreadme.push(repofullname)));
                        }))
                    }).then(() => {
                        errors.contacts = [...errors.contacts];
                        console.log(JSON.stringify({groups: repoOwners, errors},null,2));
                    });
            });
    });

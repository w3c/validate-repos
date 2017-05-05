const fetch = require("node-fetch");
const Octokat = require("octokat");
const config = require("./config.json");

fetch("https://w3c.github.io/spec-dashboard/groups.json")
    .then(r => r.json())
    .then(groupData => {
        const groupIds = Object.keys(groupData);
        Promise.all(groupIds.map(id => fetch("https://w3c.github.io/spec-dashboard/pergroup/" + id + "-repo.json").then(r=>r.json()).catch(err => console.error("Failed to fetch data for group " + id + ": " + err))))
            .then(results => {
                const repos = new Set();
                results.filter(x => x).forEach(groupSpecs => Object.keys(groupSpecs).forEach(spec => repos.add(groupSpecs[spec].repo.owner + '/' + groupSpecs[spec].repo.name)));

                //console.log(repos);

                const octo = new Octokat({ token: config.ghToken });
                const errors = {"now3cjson":[], "invalidcontacts":[], "nocontributing":[], "nolicense": [], "noreadme": []};
                Promise.all([...repos].map(repofullname => {
                    return octo
                        .repos(...repofullname.split('/'))
                        .contents('w3c.json').fetch()
                        .then(function(w3cinfodesc) {
                            var w3cinfo = JSON.parse(new Buffer(w3cinfodesc.content, 'base64').toString('utf8'));
                            return Promise.all(w3cinfo.contacts.map(function(username) {
                                if (typeof username !== "string") {
                                    errors.invalidcontacts.push({repo: repofullname, value: username});
                                    return;
                                } else {
                                    return octo.users(username).fetch()
                                        .then(function(u) {
/*                                            if (!u.email) {
                                                console.error("Cannot determine email of " + u.login + ", listed as contact for " + repofullname);
                                                }*/
                                            return;
                                        }, () => errors.invalidcontacts.push({repo: repofullname, value: username}));
                                }
                            }));
                        }).catch(() => errors.now3cjson.push(repofullname))
                            .then(() => octo.repos(...repofullname.split('/'))
                                  .contents('CONTRIBUTING.md').fetch())
                        .then(() => {
                            // test content
                        }).catch(() => errors.nocontributing.push(repofullname))
                            .then(() => octo.repos(...repofullname.split('/'))
                                  .contents('LICENSE.md').fetch())
                        .then(() => {
                            // test content
                        }).catch(() => errors.nolicense.push(repofullname))
                            .then(() => octo.repos(...repofullname.split('/'))
                                  .contents('README.md').fetch())
                        .then(() => {
                            // test content
                        }).catch(() => errors.noreadme.push(repofullname));
                })).then(() => console.log(JSON.stringify(errors,null,2)));
            });
    });

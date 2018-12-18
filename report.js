const errortypes = {
  "now3cjson": "No w3c.json file",
  "inconsistentgroups": "Inconsistent groups info w3c.json / repo-manager",
  "invalidw3cjson": "Invalid data in w3c.json",
  "incompletew3cjson": "Missing data in w3c.json",
  "nocontributing": "No CONTRIBUTING.md file",
  //    "invalidcontributing": "Invalid CONTRIBUTING.MD file",
  "nolicense": "No LICENSE.md file",
  "nocodeofconduct": "No CODE_OF_CONDUCT.md file",
  "invalidlicense": "Invalid LICENSE.md file",
  "noreadme": "No README.md file",
  "noashnazg": "Not configured with the Repo Manager"
};

// from https://stackoverflow.com/a/5158301
function getParameterByName(name) {
  const match = RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
  return match && decodeURIComponent(match[1].replace(/\+/g, ' '));
}

const defaultReport = ["now3cjson", "inconsistengroups", "invalidw3cjson", "incompletew3cjson", "noashnazg"];

const writeErrorEntry = (name, list, details) => {
  const li = document.createElement('li');
  const link = document.createElement('a');
  link.href = 'https://github.com/' + name;
  link.appendChild(document.createTextNode(name));
  li.appendChild(link);
  if (details)
    li.appendChild(document.createTextNode(': ' + details));
  list.appendChild(li);
};

fetch("report.json")
  .then(r => r.json())
  .then(data => {
    let mentionedRepos = new Set();

    const report = document.getElementById('report');
    const groups = data.groups;
    const filterParam = getParameterByName("filter");
    const groupFilter = gid => getParameterByName("grouptype") ? (groups[gid].type || '').replace(' ', '') === getParameterByName("grouptype") : true;
    const errorFilter = new Set((getParameterByName("filter") || defaultReport.join(',')).split(",").filter(e => e !==''));
    Object.keys(groups).sort((a,b) => groups[a].name.localeCompare(groups[b].name))
      .filter(groupFilter)
      .forEach(groupId => {
        const section = document.createElement('section');
        const title = document.createElement('h2');
        title.appendChild(document.createTextNode(groups[groupId].name));
        section.appendChild(title);
        // FIXME: check repo-type
        if (!groups[groupId].repos.length) {
          const p = document.createElement('p');
          p.appendChild(document.createTextNode('No identified repo for rec-track spec.'));
          section.appendChild(p);
        } else {
          Object.keys(errortypes).filter(t => errorFilter.size === 0 || errorFilter.has(t))
            .forEach(err => {
              const repos = data.errors[err].filter(r => groups[groupId].repos.find(x => x.fullName === r || x.fullName === r.repo));
              if (repos.length) {
                const errsection = document.createElement('section');
                const errtitle = document.createElement('h3');
                errtitle.appendChild(document.createTextNode(errortypes[err]));
                errsection.appendChild(errtitle);

                const list = document.createElement('ul');
                repos.forEach(repo => {
                  const repoName = typeof repo === "string" ? repo : repo.repo;
                  mentionedRepos.add(repoName);
                  writeErrorEntry(repoName, list, repo.error);

                });
                errsection.appendChild(list);
                section.appendChild(errsection);
              }
            });
        }
        report.appendChild(section);
      });
    const section = document.createElement('section');
    const title = document.createElement('h2');
    title.appendChild(document.createTextNode("No w3c.json"));
    section.appendChild(title);
    const ul = document.createElement('ul');
    data.errors.incompletew3cjson
      .filter(x => x.error === "group")
      .forEach(x => writeErrorEntry(x.repo, ul, "missing group in w3c.json"));
    data.errors.illformedw3cjson
      .forEach(x => writeErrorEntry(x, ul, "ill-formed JSON"));
    data.errors.now3cjson
      .filter(x => x.startsWith('w3c') || x.startsWith('WICG') || x.startsWith('WebAudio'))
      .filter(x => !mentionedRepos.has(x))
      .forEach(x => writeErrorEntry(x, ul, "no w3c.json"));
    section.appendChild(ul);
    report.appendChild(section);

  });

const errortypes = {
    "now3cjson": "No w3c.json file",
    "invalidcontacts": "Invalid contacts in w3c.json",
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

fetch("report.json")
    .then(r => r.json())
    .then(data => {
        const report = document.getElementById('report');
        const groups = data.groups;
        const filterParam = getParameterByName("filter");
        const errorFilter = new Set((getParameterByName("filter") || "").split(",").filter(e => e !==''));
        console.log(errorFilter.size);
        Object.keys(groups).sort((a,b) => groups[a].name.localeCompare(groups[b].name))
            .forEach(groupId => {
                const section = document.createElement('section');
                const title = document.createElement('h2');
                title.appendChild(document.createTextNode(groups[groupId].name));
                section.appendChild(title);
                if (!groups[groupId].repos.length) {
                    const p = document.createElement('p');
                    p.appendChild(document.createTextNode('No identified repo for rec-track spec.'));
                    section.appendChild(p);
                } else {
                    Object.keys(errortypes).filter(t => errorFilter.size === 0 || errorFilter.has(t))
                        .forEach(err => {
                            const repos = data.errors[err].filter(r => groups[groupId].repos.indexOf(r) !== -1);
                            if (repos.length) {
                                const errsection = document.createElement('section');
                                const errtitle = document.createElement('h3');
                                errtitle.appendChild(document.createTextNode(errortypes[err]));
                                errsection.appendChild(errtitle);

                                const list = document.createElement('ul');
                                repos.forEach(repo => {
                                    const li = document.createElement('li');
                                    li.appendChild(document.createTextNode(repo))
                                    list.appendChild(li);
                                });
                                errsection.appendChild(list);
                                section.appendChild(errsection);
                            }
                    });
                }
                report.appendChild(section);
            });
    });

/* eslint-env node */

"use strict";

const {ajv, validateW3CJSON} = require("./lib/validator.js");
const report = require("./report.json");

async function main() {
  for (const repo of report.repos) {
    if (repo.isArchived || !repo.w3cjson) {
      continue;
    }
    const fullName = `${repo.owner.login}/${repo.name}`;
    const w3cjson = JSON.parse(repo.w3cjson.text);
    try {
      await validateW3CJSON(w3cjson);
    } catch (err) {
      console.log(`https://github.com/${fullName}/blob/${repo.defaultBranch.name}/w3c.json`);
      console.log(ajv.errorsText(err.errors));
      console.log(JSON.stringify(w3cjson, null, '  '));
      console.log();
    }
  }
}

main().catch(reason => {
  console.error(reason);
  process.exit(1);
});
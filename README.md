# Validate W3C repositories

See [the report](https://w3c.github.io/validate-repos/report.html).

Copyright &copy; 2016&ndash;2017 [World Wide Web Consortium (W3C)](https://www.w3.org/).

This project is licenced [under the terms of the MIT licence](LICENSE.md).

## Running locally

To run the tool locally, you will need [Node.js](https://nodejs.org/), a
[W3C API key](https://w3c.github.io/w3c-api/) and a
[GitHub token](https://help.github.com/en/github/authenticating-to-github/creating-a-personal-access-token-for-the-command-line).
Then create a `config.json` with the following content:

```json
{
  "w3capikey": "replace with W3C API key",
  "ghToken": "replace with GitHub token"
}
```

Finally, run the tool from the command line:
```bash
npm install
node validate.js > report.json
```

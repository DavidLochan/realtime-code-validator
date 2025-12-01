const acorn = require('acorn');

function parseJS(code) {
  try {
    acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
    return true;
  } catch (err) {
    const e = new Error(err.message);
    if (err.loc) e.loc = err.loc;
    throw e;
  }
}

module.exports = { parseJS };

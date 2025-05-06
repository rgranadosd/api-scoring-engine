// polyfill-util.js
const util = require('util');

if (typeof util.isRegExp !== 'function') {
  util.isRegExp = x => x instanceof RegExp;
}

if (typeof util.isDate !== 'function') {
  util.isDate = x => x instanceof Date;
}

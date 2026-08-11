(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TMDDateTime = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function parse(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function toDateTimeLocal(value) {
    const date = parse(value);
    if (!date) return '';
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 19);
  }

  function toRFC3339(value) {
    const date = parse(value);
    return date ? date.toISOString().replace(/\.\d{3}Z$/, 'Z') : '';
  }

  return Object.freeze({ toDateTimeLocal, toRFC3339 });
});

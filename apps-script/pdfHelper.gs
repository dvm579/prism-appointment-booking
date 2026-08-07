function hasVal(v) { return v !== null && v !== undefined && String(v).trim() !== ''; }

function spaces(n) { return new Array(n + 1).join(' '); }

function get(obj, path, dflt) {
  if (!obj || !path) return dflt;
  var parts = path.split('.');
  var cur = obj;
  for (var i = 0; i < parts.length; i++) {
    if (cur == null) return dflt;
    cur = cur[parts[i]];
  }
  return (cur === undefined || cur === null) ? dflt : cur;
}

function fullName(d) {
  var f = get(d, 'demographics.firstName', '');
  var m = get(d, 'demographics.middleName', '');
  var l = get(d, 'demographics.lastName', '');
  return [f, m, l].filter(function(s){ return hasVal(s); }).join(' ');
}

function bestPhone(d) {
  var PHONE_FALLBACKS = ['demographics.cell', 'demographics.home', 'demographics.parentContact'];
  for (var i = 0; i < PHONE_FALLBACKS.length; i++) {
    var v = get(d, PHONE_FALLBACKS[i], '');
    if (hasVal(v)) return v;
  }
  return '';
}

function bestAddress(d) {
  var fa = get(d, 'fullAddress', '');
  if (hasVal(fa)) return fa;
  var street = get(d, 'demographics.street', '');
  var city   = get(d, 'demographics.city', '');
  var state  = get(d, 'demographics.state', '');
  var zip    = get(d, 'demographics.zip', '');
  var line1 = [street].filter(hasVal).join('');
  var line2 = [city, state].filter(hasVal).join(', ');
  var line = [line1, [line2, zip].filter(hasVal).join(' ')].filter(hasVal).join(', ');
  return line;
}
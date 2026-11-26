/* Mini moteur d'affichage autonome (remplace l'éditeur Claude) */
(function () {
  var TPL, comp, vals, root, queued = false, refs = [];

  window.DCLogic = function (props) { this.props = props || {}; this.state = {}; };
  DCLogic.prototype.setState = function (o) {
    Object.assign(this.state, typeof o === 'function' ? o(this.state) : o); schedule();
  };
  DCLogic.prototype.forceUpdate = function () { schedule(); };

  function schedule() { if (!queued) { queued = true; requestAnimationFrame(function () { queued = false; update(); }); } }

  function lookup(path, scope) {
    path = path.trim();
    if (path === 'true') return true; if (path === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(path)) return parseFloat(path);
    var parts = path.split('.'), cur;
    cur = (parts[0] in scope) ? scope[parts[0]] : vals[parts[0]];
    for (var i = 1; i < parts.length && cur != null; i++) cur = cur[parts[i]];
    return cur;
  }
  var WHOLE = /^\s*\{\{([^}]+)\}\}\s*$/;
  function interp(str, scope) {
    return str.replace(/\{\{([^}]+)\}\}/g, function (_, p) { var v = lookup(p, scope); return v == null ? '' : String(v); });
  }
  var BOOL = { autoplay: 1, muted: 1, loop: 1, playsinline: 1, controls: 1 };

  function render(node, scope, out) {
    if (node.nodeType === 3) { out.push(document.createTextNode(interp(node.data, scope))); return; }
    if (node.nodeType !== 1) return;
    var tag = node.tagName.toLowerCase();
    if (tag === 'sc-for') {
      var list = lookup(node.getAttribute('list').replace(/[{}]/g, ''), scope) || [];
      var as = node.getAttribute('as') || 'item';
      list.forEach(function (it, i) {
        var sc = Object.create(scope); sc[as] = it; sc.$index = i;
        node.childNodes.forEach(function (c) { render(c, sc, out); });
      });
      return;
    }
    if (tag === 'sc-if') {
      if (lookup(node.getAttribute('value').replace(/[{}]/g, ''), scope)) node.childNodes.forEach(function (c) { render(c, scope, out); });
      return;
    }
    var el = node.namespaceURI === 'http://www.w3.org/1999/xhtml' ? document.createElement(node.localName) : document.createElementNS(node.namespaceURI, node.localName);
    for (var a = 0; a < node.attributes.length; a++) {
      var at = node.attributes[a], n = at.name, v = at.value, m;
      if (n.indexOf('hint-') === 0) continue;
      if (n === 'onclick') { m = v.match(WHOLE); el.__h = m ? lookup(m[1], scope) : null; continue; }
      if (n === 'ref') { m = v.match(WHOLE); el.__ref = m ? lookup(m[1], scope) : null; continue; }
      if (BOOL[n]) { m = v.match(WHOLE); var bv = m ? lookup(m[1], scope) : true; el.__bool = el.__bool || {}; el.__bool[n] = !!bv; if (bv) el.setAttribute(n, ''); continue; }
      if (n === 'key') { el.__key = interp(v, scope); continue; }
      if (at.namespaceURI) el.setAttributeNS(at.namespaceURI, at.name, interp(v, scope)); else el.setAttribute(at.name, interp(v, scope));
    }
    var kids = []; node.childNodes.forEach(function (c) { render(c, scope, kids); });
    kids.forEach(function (k) { el.appendChild(k); });
    out.push(el);
  }

  function syncProps(el, src) {
    el.__h = src.__h; el.__ref = src.__ref;
    if (el.tagName === 'VIDEO' && src.__bool) { var mu = !!src.__bool.muted; if (el.muted !== mu) el.muted = mu; }
    if (el.__ref) refs.push(el);
  }
  function morph(oldN, newN) {
    if (oldN.nodeType !== newN.nodeType || oldN.nodeName !== newN.nodeName || oldN.__key !== newN.__key) {
      oldN.parentNode.replaceChild(newN, oldN); collectRefs(newN); return;
    }
    if (oldN.nodeType === 3) { if (oldN.data !== newN.data) oldN.data = newN.data; return; }
    var i, na = newN.attributes, oa = oldN.attributes;
    for (i = oa.length - 1; i >= 0; i--) if (!newN.hasAttributeNS(oa[i].namespaceURI, oa[i].localName)) oldN.removeAttributeNS(oa[i].namespaceURI, oa[i].localName);
    for (i = 0; i < na.length; i++) if (oldN.getAttributeNS(na[i].namespaceURI, na[i].localName) !== na[i].value) oldN.setAttributeNS(na[i].namespaceURI, na[i].name, na[i].value);
    syncProps(oldN, newN);
    var oc = Array.prototype.slice.call(oldN.childNodes), nc = Array.prototype.slice.call(newN.childNodes);
    for (i = 0; i < nc.length; i++) { if (i < oc.length) morph(oc[i], nc[i]); else { oldN.appendChild(nc[i]); collectRefs(nc[i]); } }
    for (i = nc.length; i < oc.length; i++) oldN.removeChild(oc[i]);
  }
  function collectRefs(n) {
    if (n.nodeType !== 1) return;
    if (n.tagName === 'VIDEO' && n.__bool) n.muted = !!n.__bool.muted;
    if (n.__ref) refs.push(n);
    for (var i = 0; i < n.childNodes.length; i++) collectRefs(n.childNodes[i]);
  }
  function build() { vals = comp.renderVals(); var out = []; TPL.childNodes.forEach(function (c) { render(c, {}, out); }); return out; }
  function flushRefs() { var r = refs; refs = []; r.forEach(function (el) { if (typeof el.__ref === 'function') el.__ref(el); }); }

  function update() {
    var nodes = build(), wrap = document.createElement('div');
    nodes.forEach(function (n) { wrap.appendChild(n); });
    morph(root, (function () { var r = root.cloneNode(false); while (wrap.firstChild) r.appendChild(wrap.firstChild); return r; })());
    flushRefs();
  }

  document.addEventListener('click', function (e) {
    var n = e.target;
    while (n && n !== document) {
      if (typeof n.__h === 'function') { n.__h(e); return; }
      n = n.parentNode;
    }
  });

  window.__startPortfolio = function (Component) {
    TPL = document.getElementById('tpl').content;
    root = document.getElementById('app');
    comp = new Component({});
    var nodes = build(); nodes.forEach(function (n) { root.appendChild(n); collectRefs(n); });
    flushRefs();
    if (comp.componentDidMount) comp.componentDidMount();
  };
})();

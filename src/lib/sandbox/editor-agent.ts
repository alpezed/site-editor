/**
 * Browser agent injected into the live-preview app inside the sandbox.
 *
 * Runs in the (cross-origin) preview iframe. Activated by the parent editor's
 * "Edit" toggle via postMessage({ type: "setEditMode", enabled }). While on:
 *
 *  - Hovering any element outlines it; clicking selects it and shows a floating
 *    toolbar (component name, move up/down, duplicate, add below, delete).
 *    Each structural op is reported to the parent:
 *      { source:"site-editor", type:"section-op", op, anchor, name }
 *    where `anchor` is the element's visible text (the parent locates the JSX
 *    node by that value — see element-ops.ts). "Add below" sends
 *      { source:"site-editor", type:"add-below" }.
 *  - Double-clicking a text leaf edits it inline; the change is reported as
 *      { source:"site-editor", type:"edit", oldText, newText }
 *    (the parent rewrites the matching literal in source on publish).
 *
 * The toolbar is rendered inside the iframe (the parent can't reach in
 * cross-origin) and marked data-site-editor-ignore so it never selects itself.
 *
 * Served as a static file (public/__editor-agent.js) and loaded by a <script>
 * tag injected into the app's layout at sandbox setup. Never committed.
 */
export const EDITOR_AGENT_JS = String.raw`
(function () {
  if (window.__siteEditorAgent) return;
  window.__siteEditorAgent = true;

  var editMode = false;
  var hovered = null;
  var selected = null;
  var editingText = null;
  var originalText = "";
  var bar = null;
  var addBelowAnchor = null;

  window.addEventListener("message", function (e) {
    var d = e.data;
    if (!d || d.source !== "site-editor") return;
    if (d.type === "insertSection") {
      insertSection(d.html, d.key);
      return;
    }
    if (d.type === "getTree") {
      parent.postMessage({ source: "site-editor", type: "tree", nodes: buildTree() }, "*");
      return;
    }
    if (d.type === "selectById") {
      var t = document.querySelector('[data-sx-id="' + cssEscape(d.sxId) + '"]');
      if (t) {
        selectEl(t);
        t.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
    if (d.type === "applyClasses") {
      // Instant feedback before the sandbox recompiles from source.
      var c = document.querySelector('[data-sx-id="' + cssEscape(d.sxId) + '"]');
      if (c) c.className = d.className;
      return;
    }
    if (d.type !== "setEditMode") return;
    editMode = !!d.enabled;
    if (!editMode) {
      if (editingText) finishText(editingText);
      clearHover();
      clearSelection();
    }
  });

  function cssEscape(s) {
    return String(s).replace(/["\\]/g, "\\$&");
  }

  // Walk the live DOM into a Layers tree. Capped to keep the payload small.
  function buildTree() {
    var MAX = 600;
    var count = 0;
    function node(el) {
      if (count++ > MAX) return null;
      var n = {
        sxId: el.getAttribute("data-sx-id") || undefined,
        name: nameOf(el),
        tag: el.tagName.toLowerCase(),
        sectionKey: el.getAttribute("data-section-key") || undefined,
        children: [],
      };
      for (var i = 0; i < el.children.length; i++) {
        var c = el.children[i];
        if (!selectable(c)) continue;
        var cn = node(c);
        if (cn) n.children.push(cn);
      }
      return n;
    }
    var root = document.querySelector("main") || document.body;
    var out = [];
    for (var i = 0; i < root.children.length; i++) {
      if (!selectable(root.children[i])) continue;
      var cn = node(root.children[i]);
      if (cn) out.push(cn);
    }
    return out;
  }

  // Draw a gallery section into the page immediately, before the source edit is
  // written + recompiled. If "Add below" set an anchor, insert right after it;
  // otherwise append to the main content. Real DOM, so it's editable too.
  function insertSection(html, key) {
    if (!html) return;
    var wrap = document.createElement("div");
    wrap.setAttribute("data-site-editor-injected", "");
    if (key) wrap.setAttribute("data-section-key", key);
    wrap.innerHTML = html;
    // Place after the "Add below" anchor, else after the currently selected
    // element, else append to main — matching where it persists in source.
    var anchor = (addBelowAnchor && addBelowAnchor.parentNode)
      ? addBelowAnchor
      : (selected && selected.parentNode) ? selected : null;
    if (anchor) anchor.after(wrap);
    else (document.querySelector("main") || document.body).appendChild(wrap);
    addBelowAnchor = null;
    wrap.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function isIgnore(el) {
    return !el || (el.closest && el.closest("[data-site-editor-ignore]"));
  }
  function selectable(el) {
    if (!el || el.nodeType !== 1) return false;
    var t = el.tagName;
    if (t === "HTML" || t === "BODY" || t === "SCRIPT" || t === "STYLE") return false;
    if (isIgnore(el)) return false;
    return true;
  }
  function isTextLeaf(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.children.length > 0) return false;
    return el.textContent.trim().length > 0;
  }

  document.addEventListener(
    "mouseover",
    function (e) {
      if (!editMode) return;
      var el = e.target;
      if (!selectable(el)) return;
      if (hovered && hovered !== el && hovered !== selected) hovered.style.outline = "";
      hovered = el;
      if (el !== selected) el.style.outline = "1px dashed #f97316";
    },
    true
  );

  document.addEventListener(
    "mouseout",
    function (e) {
      if (!editMode) return;
      var el = e.target;
      if (el && el !== selected && el.style) el.style.outline = "";
    },
    true
  );

  document.addEventListener(
    "click",
    function (e) {
      if (!editMode) return;
      if (isIgnore(e.target)) return;
      if (!selectable(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      selectEl(e.target);
    },
    true
  );

  document.addEventListener(
    "dblclick",
    function (e) {
      if (!editMode) return;
      var el = e.target;
      if (isIgnore(el) || !isTextLeaf(el)) return;
      e.preventDefault();
      e.stopPropagation();
      startText(el);
    },
    true
  );

  function clearHover() {
    if (hovered && hovered !== selected) hovered.style.outline = "";
    hovered = null;
  }
  function clearSelection() {
    if (selected) selected.style.outline = "";
    selected = null;
    hideBar();
  }
  function selectEl(el) {
    clearSelection();
    selected = el;
    el.style.outline = "2px solid #f97316";
    el.style.outlineOffset = "-1px";
    showBar();
    var wrap = el.closest && el.closest("[data-section-key]");
    parent.postMessage(
      {
        source: "site-editor",
        type: "select",
        sxId: el.getAttribute("data-sx-id") || null,
        name: nameOf(el),
        tag: el.tagName.toLowerCase(),
        classes: (el.getAttribute("class") || "").split(/\s+/).filter(Boolean),
        text: isTextLeaf(el) ? el.textContent.trim() : undefined,
        anchor: anchorOf(el),
        sectionKey: wrap ? wrap.getAttribute("data-section-key") : undefined,
      },
      "*",
    );
  }

  function nameOf(el) {
    try {
      var key = Object.keys(el).find(function (k) {
        return k.indexOf("__reactFiber$") === 0 || k.indexOf("__reactInternalInstance$") === 0;
      });
      var f = el[key];
      while (f) {
        var t = f.type;
        if (typeof t === "function" || (t && typeof t === "object")) {
          var n = t.displayName || t.name;
          if (n) return n;
        }
        f = f.return;
      }
    } catch (err) {}
    return el.tagName.toLowerCase();
  }
  function anchorOf(el) {
    return el.textContent.replace(/\s+/g, " ").trim().slice(0, 400);
  }

  function sendOp(kind) {
    if (!selected) return;
    var wrap = selected.closest && selected.closest("[data-section-key]");
    var isWholeSection = wrap && (selected === wrap || selected === wrap.firstElementChild);

    if (kind === "add-below") {
      // Drop the new section right after the clicked element — both in the live
      // DOM (addBelowAnchor) and in source (anchor = the element's visible text,
      // which the parent locates the JSX node by on sync/save). afterKey still
      // orders staged sections among themselves.
      addBelowAnchor = selected;
      parent.postMessage(
        {
          source: "site-editor",
          type: "add-below",
          afterKey: wrap ? wrap.getAttribute("data-section-key") : null,
          anchor: anchorOf(selected),
        },
        "*",
      );
      return;
    }

    // Whole-section structural ops act on the instance (by key), not its source.
    if (isWholeSection) {
      var skey = wrap.getAttribute("data-section-key");
      if (kind === "delete") {
        wrap.remove();
        clearSelection();
        parent.postMessage({ source: "site-editor", type: "section-remove", key: skey }, "*");
        return;
      }
      if (kind === "move-up" || kind === "move-down") {
        var sib = kind === "move-up" ? wrap.previousElementSibling : wrap.nextElementSibling;
        if (sib && sib.hasAttribute("data-section-key")) {
          if (kind === "move-up") wrap.parentNode.insertBefore(wrap, sib);
          else wrap.parentNode.insertBefore(sib, wrap);
        }
        clearSelection();
        parent.postMessage({ source: "site-editor", type: "section-move", key: skey, dir: kind }, "*");
        return;
      }
      if (kind === "duplicate") {
        var newKey =
          window.crypto && crypto.randomUUID ? crypto.randomUUID() : "dup-" + skey + "-" + Date.now();
        var clone = wrap.cloneNode(true);
        clone.setAttribute("data-section-key", newKey);
        wrap.after(clone);
        clearSelection();
        parent.postMessage(
          { source: "site-editor", type: "section-duplicate", key: skey, newKey: newKey },
          "*",
        );
        return;
      }
    }
    var anchor = anchorOf(selected);
    var name = nameOf(selected);
    // Mutate the live DOM immediately so the change is instant; the parent
    // persists the equivalent source edit in the background (Fast Refresh then
    // reconciles the canonical render).
    var el = selected;
    el.style.outline = "";
    if (kind === "delete") {
      el.remove();
    } else if (kind === "duplicate") {
      el.after(el.cloneNode(true));
    } else if (kind === "move-up" && el.previousElementSibling) {
      el.parentNode.insertBefore(el, el.previousElementSibling);
    } else if (kind === "move-down" && el.nextElementSibling) {
      el.parentNode.insertBefore(el.nextElementSibling, el);
    }
    clearSelection();
    parent.postMessage(
      { source: "site-editor", type: "section-op", op: kind, anchor: anchor, name: name },
      "*"
    );
  }

  function icon(path) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      path + "</svg>";
  }

  // Icon-only action button with a native tooltip (title). No React in the iframe.
  function mkBtn(title, svg, handler, opts) {
    var b = document.createElement("button");
    b.innerHTML = svg;
    b.title = title;
    b.setAttribute("aria-label", title);
    var bg = (opts && opts.bg) || "#27272a";
    var fg = (opts && opts.fg) || "#e4e4e7";
    b.style.cssText =
      "border:0;border-radius:6px;padding:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;background:" +
      bg + ";color:" + fg + ";line-height:0;";
    b.onmousedown = function (ev) { ev.preventDefault(); };
    b.onclick = function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      handler();
    };
    return b;
  }

  function showBar() {
    hideBar();
    bar = document.createElement("div");
    bar.setAttribute("data-site-editor-ignore", "");
    bar.style.cssText =
      "position:fixed;z-index:2147483647;display:flex;gap:6px;align-items:center;padding:4px;border-radius:8px;background:rgba(9,9,11,0.92);box-shadow:0 4px 16px rgba(0,0,0,0.4);";

    var label = document.createElement("span");
    label.textContent = nameOf(selected);
    label.style.cssText =
      "background:#ea580c;color:#fff;border-radius:6px;padding:5px 9px;font:600 12px system-ui,sans-serif;line-height:1;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    bar.appendChild(label);

    bar.appendChild(mkBtn("Move up", icon('<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>'), function () { sendOp("move-up"); }));
    bar.appendChild(mkBtn("Move down", icon('<path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/>'), function () { sendOp("move-down"); }));
    bar.appendChild(mkBtn("Duplicate", icon('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'), function () { sendOp("duplicate"); }));
    bar.appendChild(mkBtn("Add below", icon('<path d="M12 5v14"/><path d="M5 12h14"/>'), function () { sendOp("add-below"); }));
    bar.appendChild(mkBtn("Delete", icon('<path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'), function () { sendOp("delete"); }, { fg: "#f87171" }));

    document.body.appendChild(bar);
    positionBar();
  }
  function positionBar() {
    if (!bar || !selected) return;
    var r = selected.getBoundingClientRect();
    var top = r.top - 44;
    if (top < 8) top = r.top + 8;
    bar.style.top = top + "px";
    bar.style.left = Math.max(8, r.left) + "px";
  }
  function hideBar() {
    if (bar) { bar.remove(); bar = null; }
  }
  window.addEventListener("scroll", positionBar, true);
  window.addEventListener("resize", positionBar);

  function startText(el) {
    clearSelection();
    editingText = el;
    originalText = el.textContent.trim();
    el.contentEditable = "true";
    el.focus();
  }
  function finishText(el) {
    el.contentEditable = "false";
    el.style.outline = "";
    var newText = el.textContent.trim();
    if (newText !== originalText && originalText) {
      parent.postMessage(
        { source: "site-editor", type: "edit", oldText: originalText, newText: newText },
        "*"
      );
    }
    if (editingText === el) editingText = null;
  }
  document.addEventListener(
    "blur",
    function (e) {
      if (e.target === editingText) finishText(e.target);
    },
    true
  );
  document.addEventListener("keydown", function (e) {
    if (!editingText) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      editingText.blur();
    } else if (e.key === "Escape") {
      editingText.textContent = originalText;
      editingText.blur();
    }
  });

  parent.postMessage({ source: "site-editor", type: "ready" }, "*");
})();
`;

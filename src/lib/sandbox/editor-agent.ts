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

  window.addEventListener("message", function (e) {
    var d = e.data;
    if (!d || d.source !== "site-editor" || d.type !== "setEditMode") return;
    editMode = !!d.enabled;
    if (!editMode) {
      if (editingText) finishText(editingText);
      clearHover();
      clearSelection();
    }
  });

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
    if (kind === "add-below") {
      parent.postMessage({ source: "site-editor", type: "add-below" }, "*");
      return;
    }
    parent.postMessage(
      {
        source: "site-editor",
        type: "section-op",
        op: kind,
        anchor: anchorOf(selected),
        name: nameOf(selected),
      },
      "*"
    );
    clearSelection();
  }

  function mkBtn(label, handler, opts) {
    var b = document.createElement("button");
    b.textContent = label;
    var bg = (opts && opts.bg) || "#27272a";
    var fg = (opts && opts.fg) || "#e4e4e7";
    b.style.cssText =
      "border:0;border-radius:6px;padding:5px 9px;cursor:pointer;font:600 12px system-ui,sans-serif;background:" +
      bg + ";color:" + fg + ";line-height:1;";
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

    bar.appendChild(mkBtn("↑", function () { sendOp("move-up"); }));
    bar.appendChild(mkBtn("↓", function () { sendOp("move-down"); }));
    bar.appendChild(mkBtn("Duplicate", function () { sendOp("duplicate"); }));
    bar.appendChild(mkBtn("+ Add below", function () { sendOp("add-below"); }));
    bar.appendChild(mkBtn("Delete", function () { sendOp("delete"); }, { fg: "#f87171" }));

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

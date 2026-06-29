/**
 * Browser agent injected into the live-preview app inside the sandbox.
 *
 * Runs in the (cross-origin) preview iframe. Lets the user click any text
 * element to edit it inline, and reports each change to the parent editor via
 * postMessage: { source: "site-editor", type: "edit", oldText, newText }.
 *
 * Edits are reported by text value — the parent rewrites the matching literal
 * in the repo source on publish, so there's no DOM→source mapping here.
 *
 * Served as a static file (public/__editor-agent.js) and loaded by a <script>
 * tag injected into the app's layout at sandbox setup. Never committed.
 */
export const EDITOR_AGENT_JS = String.raw`
(function () {
  if (window.__siteEditorAgent) return;
  window.__siteEditorAgent = true;

  var OUTLINE = "2px solid #6366f1";
  var hovered = null;
  var editing = null;
  var originalText = "";

  // A text-editable leaf: has text but no element children.
  function isEditable(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.isContentEditable) return true;
    if (el.closest("[data-site-editor-ignore]")) return false;
    var tag = el.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "HTML" || tag === "BODY")
      return false;
    if (el.children.length > 0) return false;
    return el.textContent.trim().length > 0;
  }

  document.addEventListener(
    "mouseover",
    function (e) {
      var el = e.target;
      if (hovered && hovered !== el) hovered.style.outline = "";
      if (isEditable(el)) {
        hovered = el;
        el.style.outline = OUTLINE;
        el.style.cursor = "text";
      }
    },
    true
  );

  document.addEventListener(
    "mouseout",
    function (e) {
      if (e.target.style && e.target !== editing) e.target.style.outline = "";
    },
    true
  );

  document.addEventListener(
    "click",
    function (e) {
      var el = e.target;
      if (!isEditable(el)) return;
      e.preventDefault();
      e.stopPropagation();
      if (editing && editing !== el) finish(editing);
      editing = el;
      originalText = el.textContent.trim();
      el.contentEditable = "true";
      el.focus();
    },
    true
  );

  function finish(el) {
    el.contentEditable = "false";
    el.style.outline = "";
    var newText = el.textContent.trim();
    if (newText !== originalText && originalText) {
      parent.postMessage(
        {
          source: "site-editor",
          type: "edit",
          oldText: originalText,
          newText: newText,
        },
        "*"
      );
    }
    if (editing === el) editing = null;
  }

  document.addEventListener(
    "blur",
    function (e) {
      if (e.target === editing) finish(e.target);
    },
    true
  );

  document.addEventListener("keydown", function (e) {
    if (!editing) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      editing.blur();
    } else if (e.key === "Escape") {
      editing.textContent = originalText;
      editing.blur();
    }
  });

  parent.postMessage({ source: "site-editor", type: "ready" }, "*");
})();
`;

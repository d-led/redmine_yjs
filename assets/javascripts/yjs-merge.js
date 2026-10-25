var RedmineYjsMerge = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/merge.js
  var merge_exports = {};
  __export(merge_exports, {
    minimalEdit: () => minimalEdit,
    reconcileWithSavedContent: () => reconcileWithSavedContent
  });
  function minimalEdit(oldValue, newValue) {
    let start = 0;
    const shortest = Math.min(oldValue.length, newValue.length);
    while (start < shortest && oldValue[start] === newValue[start]) start++;
    let commonSuffix = 0;
    while (commonSuffix < shortest - start && oldValue[oldValue.length - 1 - commonSuffix] === newValue[newValue.length - 1 - commonSuffix]) {
      commonSuffix++;
    }
    const removeCount = oldValue.length - start - commonSuffix;
    const insertText = newValue.slice(start, newValue.length - commonSuffix);
    return { start, removeCount, insertText, isNoop: removeCount === 0 && insertText === "" };
  }
  function reconcileWithSavedContent(Y, doc, text, saved) {
    if (typeof saved !== "string" || saved === "") return false;
    const edit = minimalEdit(text.toString(), saved);
    if (edit.isNoop) return false;
    doc.transact(() => {
      if (edit.removeCount > 0) text.delete(edit.start, edit.removeCount);
      if (edit.insertText !== "") text.insert(edit.start, edit.insertText);
    });
    return true;
  }
  return __toCommonJS(merge_exports);
})();

(() => {
  const MAX_SAVE_BYTES = 256 * 1024 * 1024;
  const EXTRA_FILE_NAME_LIMIT = 120;
  const listeners = new Set();

  function cleanName(name, fallback = "pixel-bug-file") {
    const part = String(name || fallback).split(/[\\/]/).pop().replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").trim().slice(0, EXTRA_FILE_NAME_LIMIT);
    return part || fallback;
  }

  function byteLength(value, encoding) {
    if (encoding === "base64") return Math.ceil(String(value || "").length * 3 / 4);
    return new TextEncoder().encode(String(value ?? "")).length;
  }

  function ensureSize(value, encoding) {
    if (byteLength(value, encoding) > MAX_SAVE_BYTES) throw new Error("Save payload is too large");
  }

  function extensionFromName(name) {
    const match = String(name || "").match(/\.([^.]+)$/);
    return match ? match[1].toLowerCase() : "";
  }

  function mimeForName(name) {
    const ext = extensionFromName(name);
    if (ext === "png") return "image/png";
    if (ext === "gif") return "image/gif";
    if (ext === "svg") return "image/svg+xml";
    if (ext === "html") return "text/html;charset=utf-8";
    if (ext === "json" || ext === "pxbuild" || ext === "pbmod") return "application/json;charset=utf-8";
    if (ext === "obj" || ext === "mtl" || ext === "txt" || ext === "md" || ext === "py") return "text/plain;charset=utf-8";
    return "application/octet-stream";
  }

  function base64ToBytes(value) {
    const clean = String(value || "").replace(/\s/g, "");
    const binary = atob(clean);
    const chunkSize = 8192;
    const chunks = [];
    for (let index = 0; index < binary.length; index += chunkSize) {
      const slice = binary.slice(index, index + chunkSize);
      const bytes = new Uint8Array(slice.length);
      for (let i = 0; i < slice.length; i += 1) bytes[i] = slice.charCodeAt(i);
      chunks.push(bytes);
    }
    return chunks;
  }

  function blobFromData(data, encoding, name) {
    ensureSize(data, encoding);
    const type = mimeForName(name);
    if (encoding === "base64") return new Blob(base64ToBytes(data), { type });
    return new Blob([String(data ?? "")], { type });
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = cleanName(name);
    anchor.rel = "noopener";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function pickerMimeForName(name) {
    const type = mimeForName(name);
    return type.split(";")[0];
  }

  function pickerTypes(filters, name) {
    const items = Array.isArray(filters) ? filters : [];
    const types = items.map(filter => {
      const exts = Array.isArray(filter?.extensions) ? filter.extensions.map(ext => String(ext).replace(/[^a-z0-9]/gi, "").toLowerCase()).filter(Boolean) : [];
      if (!exts.length) return null;
      return { description: String(filter?.name || "File").slice(0, 80), accept: { [pickerMimeForName(name)]: exts.map(ext => `.${ext}`) } };
    }).filter(Boolean);
    return types.length ? types : undefined;
  }

  async function writeWithPicker(blob, name, filters) {
    if (!window.showSaveFilePicker || !window.isSecureContext) return false;
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: cleanName(name), types: pickerTypes(filters, name) });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (error) {
      if (error && error.name === "AbortError") return null;
      if (error && (error.name === "SecurityError" || error.name === "NotAllowedError" || error.name === "TypeError")) return false;
      throw error;
    }
  }

  async function saveFile(options = {}) {
    const defaultPath = cleanName(options.defaultPath || "pixel-bug-file");
    const encoding = options.encoding || "utf8";
    const blob = blobFromData(options.data, encoding, defaultPath);
    const picked = await writeWithPicker(blob, defaultPath, options.filters);
    if (picked === null) return { ok: false };
    if (!picked) downloadBlob(blob, defaultPath);
    const extraFiles = Array.isArray(options.extraFiles) ? options.extraFiles.slice(0, 16) : [];
    for (const extra of extraFiles) {
      const extraName = cleanName(extra?.filename || "pixel-bug-extra.txt", "pixel-bug-extra.txt");
      const extraBlob = blobFromData(extra?.data, extra?.encoding || "utf8", extraName);
      const extraPicked = await writeWithPicker(extraBlob, extraName, [{ name: "Extra File", extensions: [extensionFromName(extraName) || "txt"] }]);
      if (extraPicked !== null && !extraPicked) downloadBlob(extraBlob, extraName);
    }
    return { ok: true, filePath: defaultPath };
  }

  function openWithInput() {
    return new Promise(resolve => {
      const input = document.createElement("input");
      let finished = false;
      input.type = "file";
      input.accept = ".pxbuild,.json";
      input.style.position = "fixed";
      input.style.left = "-9999px";
      document.body.append(input);
      const cleanup = result => {
        if (finished) return;
        finished = true;
        input.remove();
        window.removeEventListener("focus", onFocus, true);
        resolve(result);
      };
      const onFocus = () => setTimeout(() => {
        if (!input.files || !input.files.length) cleanup({ ok: false });
      }, 500);
      input.addEventListener("change", async () => {
        const file = input.files && input.files[0];
        if (!file) return cleanup({ ok: false });
        if (file.size > MAX_SAVE_BYTES) return cleanup({ ok: false, error: "Project file is too large" });
        cleanup({ ok: true, text: await file.text(), filePath: file.name });
      }, { once: true });
      window.addEventListener("focus", onFocus, true);
      input.click();
    });
  }

  async function openProject() {
    if (window.showOpenFilePicker && window.isSecureContext) {
      try {
        const [handle] = await window.showOpenFilePicker({ multiple: false, types: [{ description: "Pixel Bug Project", accept: { "application/json": [".pxbuild", ".json"] } }] });
        const file = await handle.getFile();
        if (file.size > MAX_SAVE_BYTES) throw new Error("Project file is too large");
        return { ok: true, text: await file.text(), filePath: file.name };
      } catch (error) {
        if (error && error.name === "AbortError") return { ok: false };
        throw error;
      }
    }
    return openWithInput();
  }

  function getSystemTheme() {
    return Promise.resolve(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }

  if (window.matchMedia) {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const notify = event => {
      const theme = event.matches ? "dark" : "light";
      for (const listener of listeners) listener(theme);
    };
    if (query.addEventListener) query.addEventListener("change", notify);
    else if (query.addListener) query.addListener(notify);
  }

  window.pixelBug = Object.freeze({
    saveFile,
    openProject,
    getSystemTheme,
    onSystemThemeChanged(callback) {
      if (typeof callback !== "function") return () => {};
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    onBrowserZoomBlocked() {
      return () => {};
    }
  });
})();

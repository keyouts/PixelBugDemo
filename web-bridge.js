(() => {
  const MAX_OPEN_BYTES = 256 * 1024 * 1024;

  function cleanName(name) {
    const safe = String(name || "pixel-bug-file").split(/[\\/]/).pop().replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").trim();
    return safe || "pixel-bug-file";
  }

  function dataToBlob(data, encoding) {
    if (encoding === "base64") {
      const clean = String(data || "").includes(",") ? String(data || "").split(",").pop() : String(data || "");
      const binary = atob(clean);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes]);
    }
    return new Blob([String(data ?? "")], { type: "text/plain;charset=utf-8" });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = cleanName(filename);
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function saveFile(options = {}) {
    const defaultPath = cleanName(options.defaultPath || "pixel-bug-file.txt");
    try {
      downloadBlob(dataToBlob(options.data, options.encoding), defaultPath);
      const files = Array.isArray(options.extraFiles) ? options.extraFiles.slice(0, 16) : [];
      files.forEach((file, index) => {
        setTimeout(() => downloadBlob(dataToBlob(file.data, file.encoding), file.filename || `pixel-bug-extra-${index + 1}.txt`), 80 + index * 120);
      });
      return Promise.resolve({ ok: true, filePath: defaultPath });
    } catch (err) {
      return Promise.reject(err);
    }
  }

  function openProject() {
    return new Promise(resolve => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".pxbuild,.json,application/json";
      input.className = "hidden-file";
      input.addEventListener("change", () => {
        const file = input.files && input.files[0];
        input.remove();
        if (!file) {
          resolve({ ok: false });
          return;
        }
        if (file.size > MAX_OPEN_BYTES) {
          resolve({ ok: false, error: "Project file is too large" });
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve({ ok: true, text: String(reader.result || ""), filePath: file.name });
        reader.onerror = () => resolve({ ok: false, error: "Project file could not be opened" });
        reader.readAsText(file);
      }, { once: true });
      document.body.appendChild(input);
      input.click();
    });
  }

  function getSystemTheme() {
    return Promise.resolve(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }

  function onSystemThemeChanged(callback) {
    if (typeof callback !== "function" || !window.matchMedia) return () => {};
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = event => callback(event.matches ? "dark" : "light");
    query.addEventListener?.("change", listener);
    return () => query.removeEventListener?.("change", listener);
  }

  function onBrowserZoomBlocked() {
    return () => {};
  }

  window.pixelBug = Object.freeze({ saveFile, openProject, getSystemTheme, onSystemThemeChanged, onBrowserZoomBlocked });
})();

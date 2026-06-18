(() => {
  "use strict";

  // Byte Tools
  const encoder = new TextEncoder();
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let value = i;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    crcTable[i] = value >>> 0;
  }

  // Name Tools
  function cleanName(name, fallback = "pixel-bug-file") {
    const safe = String(name || fallback).split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, "").trim();
    return safe || fallback;
  }

  // Type Tools
  function mimeFor(name) {
    const ext = cleanName(name).split(".").pop().toLowerCase();
    if (ext === "png") return "image/png";
    if (ext === "gif") return "image/gif";
    if (ext === "svg") return "image/svg+xml";
    if (ext === "html") return "text/html;charset=utf-8";
    if (ext === "json" || ext === "pxbuild") return "application/json;charset=utf-8";
    if (ext === "obj" || ext === "mtl" || ext === "txt" || ext === "md") return "text/plain;charset=utf-8";
    if (ext === "py") return "text/x-python;charset=utf-8";
    if (ext === "zip") return "application/zip";
    return "application/octet-stream";
  }

  // Blob Tools
  function base64Bytes(data) {
    const binary = atob(String(data || ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  // Blob Tools
  function payloadBlob(file) {
    const data = file && file.data != null ? file.data : "";
    if (file && file.encoding === "base64") return new Blob([base64Bytes(data)], { type: mimeFor(file.filename || file.defaultPath) });
    return new Blob([String(data)], { type: mimeFor(file.filename || file.defaultPath) });
  }

  // Download Tools
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = cleanName(name);
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // Zip Tools
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  // Zip Tools
  function dosTime(date) {
    const year = Math.max(1980, date.getFullYear());
    return {
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
      date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
    };
  }

  // Zip Tools
  function u16(value) {
    return new Uint8Array([value & 255, (value >>> 8) & 255]);
  }

  // Zip Tools
  function u32(value) {
    return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]);
  }

  // Zip Tools
  function concatBytes(parts) {
    const total = parts.reduce((sum, item) => sum + item.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    parts.forEach(item => { out.set(item, offset); offset += item.length; });
    return out;
  }

  // Zip Tools
  async function zipBlob(files) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    const stamp = dosTime(new Date());
    for (const file of files) {
      const nameBytes = encoder.encode(cleanName(file.filename || file.defaultPath));
      const dataBytes = new Uint8Array(await payloadBlob(file).arrayBuffer());
      const crc = crc32(dataBytes);
      const local = concatBytes([
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(stamp.time), u16(stamp.date), u32(crc), u32(dataBytes.length), u32(dataBytes.length), u16(nameBytes.length), u16(0), nameBytes, dataBytes
      ]);
      const central = concatBytes([
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(stamp.time), u16(stamp.date), u32(crc), u32(dataBytes.length), u32(dataBytes.length), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes
      ]);
      locals.push(local);
      centrals.push(central);
      offset += local.length;
    }
    const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
    const end = concatBytes([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(centralSize), u32(offset), u16(0)]);
    return new Blob([...locals, ...centrals, end], { type: "application/zip" });
  }

  // Save Tools
  async function saveFile(options = {}) {
    const primaryName = cleanName(options.defaultPath || "pixel-bug-file");
    const files = [{ filename: primaryName, data: options.data || "", encoding: options.encoding || "utf8" }];
    if (Array.isArray(options.extraFiles)) {
      options.extraFiles.forEach(file => files.push({ filename: cleanName(file.filename), data: file.data || "", encoding: file.encoding || "utf8" }));
      const zipName = primaryName.replace(/\.[^.]+$/, "") + ".zip";
      downloadBlob(await zipBlob(files), zipName);
      return { ok: true, filePath: zipName };
    }
    downloadBlob(payloadBlob(files[0]), primaryName);
    return { ok: true, filePath: primaryName };
  }

  // Open Tools
  async function openProject() {
    return new Promise(resolve => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".pxbuild,application/json";
      input.addEventListener("change", () => {
        const file = input.files && input.files[0];
        if (!file) return resolve({ ok: false });
        const reader = new FileReader();
        reader.onload = () => resolve({ ok: true, text: String(reader.result || ""), filePath: file.name });
        reader.onerror = () => resolve({ ok: false, error: reader.error ? reader.error.message : "Read failed" });
        reader.readAsText(file);
      }, { once: true });
      input.click();
    });
  }

  // Theme Tools
  async function getSystemTheme() {
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  // Theme Tools
  function onSystemThemeChanged(callback) {
    const query = matchMedia("(prefers-color-scheme: dark)");
    const listener = event => callback(event.matches ? "dark" : "light");
    if (query.addEventListener) query.addEventListener("change", listener);
    else if (query.addListener) query.addListener(listener);
    return () => {
      if (query.removeEventListener) query.removeEventListener("change", listener);
      else if (query.removeListener) query.removeListener(listener);
    };
  }

  // Browser Tools
  window.pixelBug = { saveFile, openProject, getSystemTheme, onSystemThemeChanged, onBrowserZoomBlocked: () => () => {} };
})();

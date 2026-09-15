/**
 * 解析个人资料 Markdown 为结构化对象。
 * 规则：
 *  - "## 分组名" 开启一个分组
 *  - 组内 "- 字段: 值" 或 "- 字段：值" 解析为键值对
 *  - 其余非空行作为该分组的自由文本（追加到 __text）
 * 输出结构：{ "分组名": { "字段": "值", ..., "__text": "..." } }
 */
function parseProfileMD(md) {
  const profile = {};
  let current = null;
  const lines = md.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2 && !line.startsWith("###")) {
      current = h2[1].trim();
      if (!profile[current]) profile[current] = {};
      continue;
    }
    if (current === null) continue;
    const kv = line.match(/^[-*]\s*([^:：]{1,30})[:：]\s*(.*)$/);
    if (kv) {
      profile[current][kv[1].trim()] = kv[2].trim();
    } else if (line.trim() && !line.startsWith("#")) {
      const text = line.replace(/^[-*]\s*/, "").trim();
      if (text) {
        profile[current].__text = profile[current].__text
          ? profile[current].__text + "\n" + text
          : text;
      }
    }
  }
  return profile;
}

/** 将资料拍平为 "字段 -> 值" 的扁平表，供本地匹配使用 */
function flattenProfile(profile) {
  const flat = {};
  for (const [group, fields] of Object.entries(profile)) {
    for (const [key, val] of Object.entries(fields)) {
      if (key === "__text") {
        flat[group] = val; // 自由文本以分组名作为键
      } else if (val) {
        flat[key] = val;
      }
    }
  }
  return flat;
}

if (typeof module !== "undefined") {
  module.exports = { parseProfileMD, flattenProfile };
}

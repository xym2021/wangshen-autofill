/* 网申助手 · 表单识别与填充引擎（content script） */

(function () {
  if (window.__wsHelperLoaded) return;
  window.__wsHelperLoaded = true;

  /* ---------- 本地关键词词典：资料字段 -> 页面标签关键词 ---------- */
  const FIELD_KEYWORDS = {
    "姓名": ["姓名", "真实姓名", "name", "fullname", "full name", "your name"],
    "性别": ["性别", "gender", "sex"],
    "出生日期": ["出生", "生日", "birth", "dob", "date of birth"],
    "手机": ["手机", "手机号", "移动电话", "联系电话", "mobile", "phone", "tel"],
    "邮箱": ["邮箱", "电子邮箱", "email", "e-mail", "mail"],
    "政治面貌": ["政治面貌", "political"],
    "籍贯": ["籍贯", "户籍", "native place", "hometown"],
    "现居城市": ["现居", "居住城市", "所在地", "current city", "location", "address", "地址"],
    "期望城市": ["期望城市", "意向城市", "工作城市", "preferred city", "意向地点", "期望工作地"],
    "期望薪资": ["期望薪资", "薪资要求", "salary", "期望月薪", "期望年薪"],
    "身份证号": ["身份证", "证件号", "id card", "idcard", "id number"],
    "最高学历": ["最高学历", "学历", "education", "degree"],
    "毕业院校": ["毕业院校", "学校", "院校", "毕业学校", "university", "college", "school"],
    "专业": ["专业", "major"],
    "入学时间": ["入学时间", "入学年份", "enrollment"],
    "毕业时间": ["毕业时间", "毕业年份", "graduation"],
    "GPA": ["gpa", "绩点", "平均分"],
    "排名": ["排名", "rank", "年级排名", "专业排名"],
    "英语等级": ["英语", "cet", "四六级", "六级", "四级", "ielts", "toefl", "english"],
    "最近公司": ["公司", "实习公司", "工作单位", "company", "employer"],
    "职位": ["职位", "岗位", "position", "job title", "title"],
    "技能": ["技能", "skills", "专业技能", "特长"],
    "证书": ["证书", "certificate", "资格证"],
    "自我评价": ["自我评价", "自我介绍", "个人评价", "个人简介", "self", "about you", "summary", "个人陈述"],
    "职业规划": ["职业规划", "职业目标", "career"],
    "优缺点": ["优缺点", "优点", "缺点", "strength", "weakness"],
    "为什么选择我们公司": ["为什么选择", "为什么加入", "why us", "why join", "申请理由", "求职动机"],
    "实习经历": ["实习经历", "实习经验", "internship"],
    "项目经历": ["项目经历", "项目经验", "project"],
  };

  const PROFILE_KEY_BY_LABEL = {}; // 反向索引
  for (const [field, kws] of Object.entries(FIELD_KEYWORDS)) {
    for (const kw of kws) PROFILE_KEY_BY_LABEL[kw] = field;
  }

  /* ---------- 工具函数 ---------- */
  function norm(s) {
    return (s || "").replace(/[\s　*_＊:：()（）【】\[\]?？]/g, "").toLowerCase();
  }

  function getLabelText(el) {
    const parts = [];
    if (el.labels && el.labels.length) parts.push(...[...el.labels].map(l => l.innerText));
    if (el.getAttribute("aria-label")) parts.push(el.getAttribute("aria-label"));
    if (el.placeholder) parts.push(el.placeholder);
    if (el.name) parts.push(el.name);
    if (el.id) parts.push(el.id);
    // 前一个兄弟/父级里的文本节点（常见表单布局）
    const wrapper = el.closest(".form-item, .form-group, .field, .el-form-item, li, tr, div");
    if (wrapper) {
      const lbl = wrapper.querySelector("label, .label, .form-label, .el-form-item__label, th");
      if (lbl) parts.push(lbl.innerText);
      if (wrapper.innerText && wrapper.innerText.length < 80) parts.push(wrapper.innerText);
    }
    return parts.join(" ").trim();
  }

  function isFillable(el) {
    if (el.disabled || el.readOnly) return false;
    if (el.offsetParent === null && el.type !== "hidden") return false; // 不可见
    const t = (el.type || "text").toLowerCase();
    if (el.tagName === "TEXTAREA") return true;
    if (el.tagName === "SELECT") return true;
    return ["text", "email", "tel", "number", "date", "month", "url", "search"].includes(t);
  }

  function setValue(el, value) {
    // React/Vue 兼容：走原生 setter 再派发事件
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype
      : el.tagName === "SELECT" ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function setSelectValue(el, value) {
    const target = norm(value);
    let best = null;
    for (const opt of el.options) {
      const t = norm(opt.text);
      if (t === target) { best = opt; break; }
      if (!best && (t.includes(target) || target.includes(t))) best = opt;
    }
    if (best) { setValue(el, best.value); return true; }
    return false;
  }

  function highlight(el, color) {
    el.style.outline = `2px solid ${color}`;
    el.style.outlineOffset = "1px";
    el.style.transition = "outline-color .3s";
  }

  /* ---------- 本地匹配 ---------- */
  function matchLocal(labelText, flat) {
    const n = norm(labelText);
    if (!n) return null;
    // 长关键词优先，避免「手机」先于「手机号」截胡之类的问题
    const entries = Object.entries(PROFILE_KEY_BY_LABEL).sort((a, b) => b[0].length - a[0].length);
    for (const [kw, profileKey] of entries) {
      if (n.includes(norm(kw)) && flat[profileKey] !== undefined && flat[profileKey] !== "") {
        return { key: profileKey, value: flat[profileKey] };
      }
    }
    // 兜底：直接以资料字段名匹配
    for (const [k, v] of Object.entries(flat)) {
      if (k.length >= 2 && n.includes(norm(k)) && v) return { key: k, value: v };
    }
    return null;
  }

  /* ---------- 主流程 ---------- */
  async function fillForm(useLLM) {
    const { profile, llmConfig, jobDescription } =
      await chrome.storage.local.get(["profile", "llmConfig", "jobDescription"]);
    if (!profile || Object.keys(profile).length === 0) {
      return { ok: false, error: "未找到个人资料，请先在插件设置中导入 MD 资料" };
    }
    const flat = flattenProfile(profile);

    const fields = [...document.querySelectorAll("input, textarea, select")]
      .filter(isFillable)
      .filter(el => !el.value); // 不覆盖已有内容

    let localFilled = 0, llmFilled = 0;
    const unmatched = [];

    for (const el of fields) {
      const label = getLabelText(el);
      const hit = matchLocal(label, flat);
      if (hit) {
        const ok = el.tagName === "SELECT" ? setSelectValue(el, hit.value) : (setValue(el, hit.value), true);
        if (ok) { highlight(el, "#38a169"); localFilled++; continue; }
      }
      unmatched.push({
        idx: unmatched.length,
        label: label.slice(0, 120),
        tag: el.tagName.toLowerCase(),
        type: el.type || "",
        options: el.tagName === "SELECT" ? [...el.options].map(o => o.text).slice(0, 30) : undefined,
        el,
      });
    }

    if (useLLM && unmatched.length && llmConfig && llmConfig.enabled && llmConfig.apiKey) {
      const resp = await chrome.runtime.sendMessage({
        type: "LLM_MATCH",
        payload: {
          fields: unmatched.map(({ el, ...rest }) => rest),
          profile,
          jobDescription: jobDescription || "",
        },
      });
      if (resp && resp.ok && resp.answers) {
        for (const ans of resp.answers) {
          const target = unmatched[ans.idx];
          if (!target || ans.value === undefined || ans.value === null || ans.value === "") continue;
          const el = target.el;
          const ok = el.tagName === "SELECT" ? setSelectValue(el, String(ans.value)) : (setValue(el, String(ans.value)), true);
          if (ok) { highlight(el, "#805ad5"); llmFilled++; }
        }
      }
    }

    // 剩余未识别字段标黄提示人工处理
    const stillUnmatched = unmatched.filter(u => !u.el.value);
    stillUnmatched.forEach(u => highlight(u.el, "#d69e2e"));

    return { ok: true, localFilled, llmFilled, unmatched: stillUnmatched.length };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "FILL_FORM") {
      fillForm(msg.useLLM).then(sendResponse);
      return true; // 异步
    }
  });
})();

const TEMPLATE_MD = `# 网申个人资料

## 基本信息
- 姓名: 张三
- 性别: 男
- 出生日期: 2000-01-01
- 手机: 13800000000
- 邮箱: zhangsan@example.com
- 政治面貌: 共青团员
- 籍贯: 广东省深圳市
- 现居城市: 北京
- 期望城市: 北京/上海/深圳
- 期望薪资: 面议
- 身份证号: （按需填写）

## 教育经历
- 最高学历: 本科
- 毕业院校: 某某大学
- 专业: 计算机科学与技术
- 入学时间: 2018-09
- 毕业时间: 2022-06
- GPA: 3.6/4.0
- 排名: 前10%
- 英语等级: CET-6 550

## 实习经历
- 最近公司: 某某科技有限公司
- 职位: 后端开发实习生
- 实习时间: 2021-06 至 2021-12
（在此分段描述每段实习的具体工作与成果，LLM 会读取并引用）

## 项目经历
（自由文本：项目名称、角色、技术栈、成果。LLM 生成项目描述时使用）

## 技能证书
- 技能: Java / Python / MySQL / Redis
- 证书: 软件设计师（中级）

## 自我评价
（自由文本：你的自我评价原文。LLM 会以此为基础，结合 JD 优化改写）

## 开放性问答
- 职业规划: （写下你的职业规划原文）
- 优缺点: （写下你的优缺点原文）
- 为什么选择我们公司: （写下你的通用回答）
`;

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.style.display = "block";
  setTimeout(() => (t.style.display = "none"), 1800);
}

async function init() {
  const { profileMD, profile, llmConfig, jobDescription } =
    await chrome.storage.local.get(["profileMD", "profile", "llmConfig", "jobDescription"]);
  if (profileMD) document.getElementById("mdInput").value = profileMD;
  if (profile) document.getElementById("parsedPreview").textContent = JSON.stringify(profile, null, 2);
  if (llmConfig) {
    document.getElementById("llmEnabled").checked = !!llmConfig.enabled;
    document.getElementById("llmBase").value = llmConfig.baseUrl || "";
    document.getElementById("llmKey").value = llmConfig.apiKey || "";
    document.getElementById("llmModel").value = llmConfig.model || "";
  }
  if (jobDescription) document.getElementById("jdInput").value = jobDescription;
}

document.getElementById("saveProfile").addEventListener("click", async () => {
  const md = document.getElementById("mdInput").value;
  const profile = parseProfileMD(md);
  await chrome.storage.local.set({ profileMD: md, profile });
  document.getElementById("parsedPreview").textContent = JSON.stringify(profile, null, 2);
  toast("资料已保存并解析");
});

document.getElementById("loadTemplate").addEventListener("click", () => {
  document.getElementById("mdInput").value = TEMPLATE_MD;
  toast("模板已填入，记得点「保存资料」");
});

document.getElementById("downloadTemplate").addEventListener("click", () => {
  const blob = new Blob([TEMPLATE_MD], { type: "text/markdown;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "profile-template.md";
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById("saveLLM").addEventListener("click", async () => {
  const llmConfig = {
    enabled: document.getElementById("llmEnabled").checked,
    baseUrl: document.getElementById("llmBase").value.trim().replace(/\/+$/, ""),
    apiKey: document.getElementById("llmKey").value.trim(),
    model: document.getElementById("llmModel").value.trim(),
  };
  await chrome.storage.local.set({ llmConfig });
  toast("LLM 配置已保存");
});

document.getElementById("testLLM").addEventListener("click", async () => {
  const el = document.getElementById("testResult");
  el.textContent = "正在测试连接…";
  const resp = await chrome.runtime.sendMessage({ type: "LLM_TEST" });
  el.textContent = resp && resp.ok ? `✅ 连接成功：${resp.sample}` : `❌ ${(resp && resp.error) || "未知错误"}`;
});

document.getElementById("saveJD").addEventListener("click", async () => {
  await chrome.storage.local.set({ jobDescription: document.getElementById("jdInput").value });
  toast("JD 已保存");
});

init();

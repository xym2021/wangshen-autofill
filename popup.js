async function refreshStatus() {
  const { profile, llmConfig } = await chrome.storage.local.get(["profile", "llmConfig"]);
  const el = document.getElementById("status");
  const hasProfile = profile && Object.keys(profile).length > 0;
  const llmOn = llmConfig && llmConfig.enabled && llmConfig.apiKey;
  el.innerHTML =
    `个人资料：${hasProfile ? `<b>已导入</b>（${Object.keys(profile).length} 个分组）` : `<span class="warn">未导入，请先在设置中粘贴 MD 资料</span>`}<br>` +
    `LLM 增强：${llmOn ? `<b>已启用</b>（${llmConfig.model || "默认模型"}）` : "未启用"}`;
}

async function sendFill(useLLM) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const el = document.getElementById("status");
  el.innerHTML = "正在填充，请稍候…";
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { type: "FILL_FORM", useLLM });
    if (resp && resp.ok) {
      el.innerHTML = `✅ 填充完成：本地匹配 <b>${resp.localFilled}</b> 项` +
        (useLLM ? `，LLM 补充 <b>${resp.llmFilled}</b> 项` : "") +
        `，未识别 <b>${resp.unmatched}</b> 项（已在页面标黄）`;
    } else {
      el.innerHTML = `⚠️ ${(resp && resp.error) || "未检测到可填充的表单"}`;
    }
  } catch (e) {
    el.innerHTML = "⚠️ 无法在当前页面运行（可能是浏览器内部页面或页面未加载完成）";
  }
}

document.getElementById("fillLocal").addEventListener("click", () => sendFill(false));
document.getElementById("fillLLM").addEventListener("click", () => sendFill(true));
document.getElementById("openOptions").addEventListener("click", () => chrome.runtime.openOptionsPage());

refreshStatus();

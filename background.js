/* 网申助手 · LLM 代理（service worker）
   content script 不直接请求外部 API，统一走这里，避免 CORS 与 Key 暴露。 */

async function callLLM(messages, maxTokens) {
  const { llmConfig } = await chrome.storage.local.get("llmConfig");
  if (!llmConfig || !llmConfig.enabled || !llmConfig.apiKey) {
    return { ok: false, error: "LLM 未启用或未配置 API Key" };
  }
  const base = (llmConfig.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = llmConfig.model || "gpt-4o-mini";
  try {
    const resp = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${llmConfig.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
        max_tokens: maxTokens || 2000,
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      return { ok: false, error: `HTTP ${resp.status}: ${text.slice(0, 200)}` };
    }
    const data = await resp.json();
    return { ok: true, content: data.choices[0].message.content };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function buildMatchPrompt(fields, profile, jobDescription) {
  const system = `你是网申表单填充助手。给你一份求职者资料（JSON）和一组网页表单字段，请为每个字段给出应填入的值。

规则：
1. 严格依据资料内容回答，资料中没有的信息，根据常识合理推断（如「是否接受调剂」填「是」），无法确定的填空字符串。
2. 开放性问题（自我评价、职业规划、优缺点、为什么选择我们公司等），基于资料生成 100~200 字、真诚具体、第一人称的回答。${jobDescription ? "生成开放题答案时，向以下目标岗位 JD 靠拢，突出匹配点：\n" + jobDescription.slice(0, 1500) : ""}
3. select 字段的值必须从其 options 中选择最贴近的一项。
4. 只返回 JSON，格式：{"answers":[{"idx":数字,"value":"填入值"}]}，不要任何多余文字。`;

  const user = `求职者资料：\n${JSON.stringify(profile, null, 2)}\n\n表单字段：\n${JSON.stringify(fields, null, 2)}`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "LLM_MATCH") {
    (async () => {
      const { fields, profile, jobDescription } = msg.payload;
      const r = await callLLM(buildMatchPrompt(fields, profile, jobDescription));
      if (!r.ok) { sendResponse(r); return; }
      try {
        // 容错：有些模型会包裹 ```json ... ``` 或夹带说明文字
        const m = r.content.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(m ? m[0] : r.content);
        sendResponse({ ok: true, answers: parsed.answers || [] });
      } catch (e) {
        sendResponse({ ok: false, error: "LLM 返回格式无法解析: " + r.content.slice(0, 200) });
      }
    })();
    return true;
  }

  if (msg.type === "LLM_TEST") {
    (async () => {
      const r = await callLLM(
        [{ role: "user", content: "回复一个 JSON：{\"ok\":true,\"hello\":\"你的模型名或一句问候\"}" }],
        100
      );
      if (!r.ok) { sendResponse(r); return; }
      sendResponse({ ok: true, sample: r.content.slice(0, 100) });
    })();
    return true;
  }
});

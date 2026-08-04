const { verifyToken, getTokenFromRequest } = require("../lib/auth");
const { applyCors } = require("../lib/cors");

var SYSTEM_PROMPT_EN = "You are the Gym AI Agent inside IbTheLifter, a workout tracking app. Answer questions about exercise form, programming, recovery, and general fitness with clear, practical, safe advice. Keep answers concise and actionable - a few short paragraphs or a short list, not an essay. If a question is about an injury or a medical condition beyond general guidance, recommend seeing a doctor or physical therapist rather than diagnosing.";
var SYSTEM_PROMPT_AR = "أنت مساعد الجيم الذكي داخل تطبيق IbTheLifter لتتبع التمارين. أجب عن أسئلة أداء التمارين، البرمجة التدريبية، التعافي، واللياقة العامة بنصائح واضحة وعملية وآمنة. اجعل إجاباتك موجزة وقابلة للتنفيذ - بضع فقرات قصيرة أو قائمة مختصرة، وليس مقالًا طويلًا. إذا كان السؤال متعلقًا بإصابة أو حالة طبية تتجاوز الإرشادات العامة، انصح بمراجعة طبيب أو أخصائي علاج طبيعي بدلاً من التشخيص.";

// Auth-gated (not just CORS-open) so only logged-in app users can trigger paid API
// calls - and history/length are capped so one request can't balloon cost.
module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") { res.status(405).json({ error: "METHOD_NOT_ALLOWED" }); return; }

  var token = getTokenFromRequest(req);
  if (!token) { res.status(401).json({ error: "NO_TOKEN" }); return; }
  try { verifyToken(token); } catch (e) { res.status(401).json({ error: "INVALID_TOKEN" }); return; }

  var body = req.body || {};
  var messages = Array.isArray(body.messages) ? body.messages : [];
  if (!messages.length) { res.status(400).json({ error: "INVALID_INPUT" }); return; }

  var trimmed = messages.slice(-20).map(function(m){
    return { role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, 2000) };
  });
  var systemPrompt = body.lang === "ar" ? SYSTEM_PROMPT_AR : SYSTEM_PROMPT_EN;

  try {
    var apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt,
        messages: trimmed
      })
    });

    if (!apiRes.ok) {
      res.status(502).json({ error: "AI_UPSTREAM_ERROR" });
      return;
    }
    var data = await apiRes.json();
    var reply = (data.content && data.content[0] && data.content[0].text) ? data.content[0].text : "";
    if (!reply) { res.status(502).json({ error: "AI_UPSTREAM_ERROR" }); return; }
    res.status(200).json({ reply: reply });
  } catch (e) {
    res.status(500).json({ error: "SERVER_ERROR" });
  }
};

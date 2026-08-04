const { verifyToken, getTokenFromRequest } = require("../lib/auth");
const { applyCors } = require("../lib/cors");

var SYSTEM_PROMPT_EN = "You are the Gym AI Agent inside IbTheLifter, a workout tracking app. Answer questions about exercise form, programming, recovery, and general fitness with clear, practical, safe advice. Keep answers SHORT: 2-4 sentences, or a bullet list of at most 5 short items - never both, never more than that unless the user explicitly asks for more detail. Plain text only: no markdown headers (#), no horizontal rules (---), no long multi-section structure. Bold (**word**) is fine for a key term. If a question is about an injury or a medical condition beyond general guidance, recommend seeing a doctor or physical therapist rather than diagnosing.";
var SYSTEM_PROMPT_AR = "أنت مساعد الجيم الذكي داخل تطبيق IbTheLifter لتتبع التمارين. أجب عن أسئلة أداء التمارين، البرمجة التدريبية، التعافي، واللياقة العامة بنصائح واضحة وعملية وآمنة. اجعل إجاباتك قصيرة جدًا: من جملتين إلى أربع جمل، أو قائمة نقطية من 5 عناصر قصيرة كحد أقصى - وليس كليهما، ولا أطول من ذلك إلا إذا طلب المستخدم تفاصيل أكثر صراحةً. نص عادي فقط: بدون عناوين ماركداون (#)، وبدون خطوط فاصلة (---)، وبدون تركيب متعدد الأقسام. يمكن استخدام الخط العريض (**كلمة**) لكلمة مفتاحية واحدة. إذا كان السؤال متعلقًا بإصابة أو حالة طبية تتجاوز الإرشادات العامة، انصح بمراجعة طبيب أو أخصائي علاج طبيعي بدلاً من التشخيص.";

// gemini-flash-latest is Google's rolling alias to their current free-tier flash
// model - pinned version strings (gemini-2.0-flash-001, gemini-2.5-flash-lite, etc)
// were found to 404 ("no longer available to new users") on a fresh API key, so the
// alias is the only choice confirmed to keep working as Google rotates versions.
var MODEL = "gemini-flash-latest";

// Auth-gated (not just CORS-open) so only logged-in app users can trigger AI calls -
// and history/length are capped so one request can't run away with the free quota.
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
    return {
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content || "").slice(0, 2000) }]
    };
  });
  var systemPrompt = body.lang === "ar" ? SYSTEM_PROMPT_AR : SYSTEM_PROMPT_EN;

  try {
    var apiRes = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent?key=" + process.env.GEMINI_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: trimmed,
          systemInstruction: { parts: [{ text: systemPrompt }] },
          // gemini-flash-latest resolves to a Gemini 3.x model, which defaults to a
          // "medium" internal reasoning pass before answering - several extra seconds
          // of latency for zero benefit on short fitness Q&A. Minimal thinking cut a
          // ~4s reply down to ~1.3s in testing with no noticeable quality loss.
          generationConfig: { thinkingConfig: { thinkingLevel: "minimal" }, maxOutputTokens: 500 }
        })
      }
    );

    if (apiRes.status === 429) { res.status(429).json({ error: "RATE_LIMITED" }); return; }
    if (!apiRes.ok) { res.status(502).json({ error: "AI_UPSTREAM_ERROR" }); return; }

    var data = await apiRes.json();
    var reply = (data.candidates && data.candidates[0] && data.candidates[0].content &&
      data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text) || "";
    if (!reply) { res.status(502).json({ error: "AI_UPSTREAM_ERROR" }); return; }
    res.status(200).json({ reply: reply });
  } catch (e) {
    res.status(500).json({ error: "SERVER_ERROR" });
  }
};

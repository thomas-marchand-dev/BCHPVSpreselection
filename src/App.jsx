import { useState, useEffect, useRef } from "react";
import { storage } from "./storage.js";

// ─── PROMPTS ──────────────────────────────────────────────────────────────────

const RESEARCH_PROMPT = `You are a senior medical device analyst for the Boston Children's Hospital Pediatric Venture Studio. 
A physician has submitted a clinical device idea. Search the web thoroughly to gather evidence across these areas:
1. Clinical burden and epidemiology — patient population, incidence, unmet need
2. Current standard of care and its limitations
3. Published clinical literature and outcomes data
4. Existing devices and competing approaches
5. Relevant patents and freedom-to-operate landscape
6. FDA regulatory pathway and predicate devices
7. Reimbursement landscape: CPT/DRG codes, payer coverage

Search multiple times across all these areas. Be thorough. Only cite sources you actually found via search.`;

const SYNTHESIS_PROMPT = `You are a senior evaluator for the Boston Children's Hospital Pediatric Venture Studio. 
You have been given a clinical device idea AND a list of verified web sources found during research.

Your job: produce a comprehensive evaluation report as JSON.
CRITICAL SOURCE RULE: In the "sources" array, list EVERY webpage you actually visited or retrieved during your research. Include the exact URL and full title. This is the most important part of the report — the selection committee needs to verify every claim. Do NOT invent URLs. Only include pages you actually retrieved. Aim for 8-15 sources minimum.

Score the idea across 7 criteria (each 1-5):
1. Unmet Clinical Need (weight: 20%)
2. Pediatric Specificity (weight: 15%)
3. Innovation & Novelty (weight: 15%)
4. Technical Feasibility (weight: 15%)
5. Regulatory Pathway (weight: 15%)
6. Market & Patient Impact (weight: 10%)
7. BCH Strategic Fit (weight: 10%)

Scoring: 1=Very weak, 2=Below average, 3=Average, 4=Strong, 5=Exceptional
Verdict: exactly "ELIGIBLE", "PENDING", or "INELIGIBLE"

Return ONLY valid JSON, no markdown, no preamble:
{
  "summary": "3-4 sentence synthesis",
  "scores": {
    "unmet_need": { "score": 3, "rationale": "1-2 sentences" },
    "pediatric_specificity": { "score": 3, "rationale": "1-2 sentences" },
    "innovation": { "score": 3, "rationale": "1-2 sentences" },
    "technical_feasibility": { "score": 3, "rationale": "1-2 sentences" },
    "regulatory_pathway": { "score": 3, "rationale": "1-2 sentences" },
    "market_impact": { "score": 3, "rationale": "1-2 sentences" },
    "bch_fit": { "score": 3, "rationale": "1-2 sentences" }
  },
  "weighted_total": 3.0,
  "verdict": "ELIGIBLE",
  "verdict_rationale": "2-3 sentences",
  "key_strengths": ["strength 1", "strength 2"],
  "key_concerns": ["concern 1", "concern 2"],
  "recommended_next_steps": "1-2 sentences",
  "sources": [
    { "url": "https://exact-url-you-visited.com/page", "title": "Full page title", "context": "1 sentence on what this source supports" },
    { "url": "https://another-real-url.com/article", "title": "Full page title", "context": "1 sentence on what this source supports" }
  ],
  "clinical_landscape": {
    "problem_summary": "3-4 sentences",
    "current_standard_of_care": "2-3 sentences",
    "key_literature": [
      { "citation": "Author, Journal, Year", "finding": "1 sentence", "source_url": "url from verified list or null" }
    ],
    "evidence_gaps": "2-3 sentences"
  },
  "competitive_landscape": {
    "existing_devices": [
      { "name": "device/company", "status": "marketed", "limitation": "why it falls short", "source_url": "url or null" }
    ],
    "white_space": "2-3 sentences"
  },
  "freedom_to_operate": {
    "landscape_summary": "2-3 sentences",
    "key_patents": [
      { "identifier": "patent number or assignee", "relevance": "1 sentence", "source_url": "url or null" }
    ],
    "fto_risk": "MEDIUM",
    "fto_commentary": "2-3 sentences"
  },
  "market_and_epidemiology": {
    "patient_population": "2-3 sentences with numbers",
    "annual_us_cases": "number with source",
    "global_opportunity": "1-2 sentences",
    "market_size_estimate": "dollar estimate"
  },
  "regulatory_analysis": {
    "recommended_pathway": "HDE/HUD",
    "pathway_rationale": "2-3 sentences",
    "predicate_devices": ["device 1", "device 2"],
    "key_regulatory_risks": "2-3 sentences",
    "estimated_timeline": "X years"
  },
  "reimbursement_landscape": {
    "relevant_cpt_codes": ["code: description"],
    "relevant_drg_codes": ["code: description"],
    "payer_landscape": "2-3 sentences",
    "reimbursement_risk": "MEDIUM",
    "commentary": "1-2 sentences"
  },
  "strategic_fit": {
    "bch_capabilities": "2-3 sentences",
    "partnership_opportunities": "1-2 sentences",
    "recommended_team": ["role 1", "role 2", "role 3"]
  }
}`;

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const CRITERIA = [
  { key: "unmet_need",          label: "Unmet Clinical Need",    weight: "20%", icon: "🩺" },
  { key: "pediatric_specificity",label: "Pediatric Specificity", weight: "15%", icon: "👶" },
  { key: "innovation",          label: "Innovation & Novelty",   weight: "15%", icon: "💡" },
  { key: "technical_feasibility",label: "Technical Feasibility", weight: "15%", icon: "⚙️" },
  { key: "regulatory_pathway",  label: "Regulatory Pathway",     weight: "15%", icon: "📋" },
  { key: "market_impact",       label: "Market & Patient Impact",weight: "10%", icon: "📈" },
  { key: "bch_fit",             label: "BCH Strategic Fit",      weight: "10%", icon: "🏥" },
];

const VERDICT_CONFIG = {
  "ELIGIBLE":   { color: "#00875a", bg: "#e3f5ec", sub: "Ready to present to Selection Committee", threshold: "Score ≥ 3.5" },
  "PENDING":    { color: "#b76e00", bg: "#fff4e0", sub: "Address concerns before presenting",       threshold: "Score 2.5 – 3.4" },
  "INELIGIBLE": { color: "#c0392b", bg: "#fdeef0", sub: "Not suitable for Selection Committee",    threshold: "Score < 2.5" },
};

const CRITERIA_WEIGHTS = {
  unmet_need: 0.20, pediatric_specificity: 0.15, innovation: 0.15,
  technical_feasibility: 0.15, regulatory_pathway: 0.15,
  market_impact: 0.10, bch_fit: 0.10
};

const RISK_CONFIG = {
  "LOW":    { color: "#00875a", bg: "#e3f5ec" },
  "MEDIUM": { color: "#b76e00", bg: "#fff4e0" },
  "HIGH":   { color: "#c0392b", bg: "#fdeef0" },
};

const DEFAULT_WEIGHTS = {
  unmet_need: 20, pediatric_specificity: 15, innovation: 15,
  technical_feasibility: 15, regulatory_pathway: 15,
  market_impact: 10, bch_fit: 10,
};

function computeWeightedTotal(scores, weights) {
  const totalPct = Object.values(weights).reduce((a, b) => a + b, 0);
  if (!scores || totalPct === 0) return null;
  let wt = 0;
  Object.entries(weights).forEach(([key, pct]) => {
    const s = scores[key];
    const val = s && typeof s.score === "number" ? Math.min(5, Math.max(1, s.score)) : 3;
    wt += val * (pct / totalPct);
  });
  return Math.round(wt * 10) / 10;
}

const STAGES = [
  { label: "Reviewing clinical problem",      pct: 8  },
  { label: "Searching clinical literature",   pct: 22 },
  { label: "Analyzing competitive landscape", pct: 38 },
  { label: "Scanning patent landscape",       pct: 52 },
  { label: "Assessing regulatory pathway",    pct: 66 },
  { label: "Reviewing reimbursement data",    pct: 78 },
  { label: "Verifying sources",               pct: 88 },
  { label: "Compiling evaluation report",     pct: 96 },
];

// ─── Q&A PRE-SCREEN ───────────────────────────────────────────────────────────

const QA_SYSTEM = `You are the intake coordinator for the Boston Children's Hospital Pediatric Venture Studio.
A physician has submitted a device idea. They may have also attached supporting documents — if so, read them carefully before asking questions, as the documents may already answer what you would ask. Your job is to gather the clinical and technical context that ONLY the submitting physician can provide — information that comes from their direct clinical experience, not from research.

DO NOT ask about:
- Epidemiology, incidence rates, or annual patient numbers (the committee will research this)
- Market size or commercial opportunity (the committee will research this)
- Patent landscape or regulatory pathways (the committee will research this)
- Literature or published evidence (the committee will research this)

ONLY ask about things the PI knows from their own practice:
- What specific clinical scenario or failure they personally observe
- What their proposed device actually does and how it works mechanically
- Why current tools or approaches fail in their hands
- What makes this problem genuinely pediatric-specific vs. an adult problem
- Where in the care pathway the device would be used and by whom
- How far along the concept is (idea only, bench work, animal data, prior patents, etc.)
- Any prior work, collaborators, or prototypes they already have

A complete submission needs all of the above. If anything is missing or vague, ask exactly ONE question — the single most important gap. Be direct and conversational. Do not number your question. Do not explain why you're asking.

If the submission is complete, respond ONLY with the exact text: APPROVED`;

// Build the first-turn content block: idea text + any uploaded documents
function buildFirstMessage(ideaText, docs) {
  if (!docs || docs.length === 0) {
    return [{ type: "text", text: ideaText }];
  }
  const blocks = [{ type: "text", text: ideaText + "\n\nI have also attached the following supporting documents for your review:" }];
  docs.forEach(doc => {
    const ext = doc.name.split(".").pop().toLowerCase();
    const isImage = ["png","jpg","jpeg","gif","webp"].includes(ext);
    const isPdf = ext === "pdf";
    if (isPdf) {
      blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: doc.base64 }, title: doc.name });
    } else if (isImage) {
      const mime = doc.mediaType || "image/jpeg";
      blocks.push({ type: "image", source: { type: "base64", media_type: mime, data: doc.base64 } });
    } else {
      // For other file types just note the filename — can't embed binary
      blocks.push({ type: "text", text: `[Attached: ${doc.name} — ${(doc.size/1024).toFixed(1)} KB]` });
    }
  });
  return blocks;
}

async function runQA(messages, docs) {
  // Replace the first message's content with rich blocks if docs provided
  const enrichedMessages = messages.map((m, i) => {
    if (i === 0 && docs && docs.length > 0) {
      return { role: m.role, content: buildFirstMessage(m.content, docs) };
    }
    return m;
  });

  const resp = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 600,
      temperature: 0,
      system: QA_SYSTEM,
      messages: enrichedMessages
    })
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message);
  return (data.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
}

// ─── ENGINE ───────────────────────────────────────────────────────────────────

function safeParseJSON(text) {
  let clean = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON found in response");
  clean = clean.slice(start, end + 1);
  try { return JSON.parse(clean); } catch (_) {}
  try { return Function('"use strict"; return (' + clean + ')')(); } catch (_) {}
  throw new Error("Could not parse response — please try again");
}

async function runAnalysis(idea, onEvent, docs) {

  // ── PHASE 1: RESEARCH ─────────────────────────────────────────────────────
  // web_search_20250305 is FULLY SERVER-SIDE — Anthropic executes searches
  // automatically during generation. One single API call, no loop, no tool_result.

  const researchSystem = `You are a senior medical device research analyst for BCH Pediatric Venture Studio.
Search the web thoroughly across these 7 areas for the device idea provided. Perform multiple searches per area:
1. Clinical burden & epidemiology (incidence, patient population, age-specific data)
2. Current standard of care and its specific limitations
3. Peer-reviewed clinical literature (PubMed, journals — find actual papers)
4. Existing competing devices and companies (name specific products)
5. Patent landscape (Google Patents, USPTO — find relevant patents)
6. FDA regulatory pathway and predicate devices (check FDA 510k database)
7. Reimbursement: CPT codes, DRG codes, payer coverage policies

After all searches, write a dense research brief covering all 7 areas with specific facts, numbers, exact URLs, and citations. This brief will be used by a second AI to write the evaluation report, so include every detail.`;

  onEvent({ type: "start", text: "Searching clinical literature & evidence…", pct: 5 });

  const researchContent = docs && docs.length > 0
    ? buildFirstMessage(`Research this pediatric device idea across all 7 domains, then write a comprehensive research brief.\n\nIDEA:\n${idea}`, docs)
    : `Research this pediatric device idea across all 7 domains, then write a comprehensive research brief.\n\nIDEA:\n${idea}`;

  // Emit progress events while waiting (the fetch will take 30-90s)
  const progressEvents = [
    { pct: 15, text: "Searching epidemiology & burden data…" },
    { pct: 28, text: "Scanning peer-reviewed literature (PubMed)…" },
    { pct: 42, text: "Identifying competing devices & companies…" },
    { pct: 55, text: "Searching patent landscape (USPTO, Google Patents)…" },
    { pct: 67, text: "Checking FDA regulatory database & predicates…" },
    { pct: 78, text: "Reviewing reimbursement codes & payer policies…" },
    { pct: 88, text: "Compiling research brief…" },
  ];
  let progIdx = 0;
  const progTimer = setInterval(() => {
    if (progIdx < progressEvents.length) {
      const e = progressEvents[progIdx++];
      onEvent({ type: "stage", text: e.text, pct: e.pct });
    }
  }, 8000); // advance every 8s

  let researchBrief = "";
  try {
    const resp = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        temperature: 0,
        system: researchSystem,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: researchContent }]
      }),
    });
    clearInterval(progTimer);
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);
    researchBrief = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
  } catch(e) {
    clearInterval(progTimer);
    throw e;
  }

  if (!researchBrief) throw new Error("Research phase returned no content. Please try again.");
  onEvent({ type: "compile", text: "Research complete — synthesizing evaluation report…", pct: 92 });

  if (!researchBrief) throw new Error("Research phase returned no content. Please try again.");
  onEvent({ type: "compile", text: "Research complete — synthesizing evaluation report…", pct: 92 });

  // ── PHASE 2: SYNTHESIS ────────────────────────────────────────────────────
  // Single clean call — no tool history, just idea + research brief → JSON report

  const synthesisSystem = `You are a senior evaluator for BCH Pediatric Venture Studio. You have a device idea and a research brief from live web searches. Write a concise evaluation report as JSON.

SCORING: 1=fundamental gaps 2=significant problems 3=moderate/addressable 4=strong/minor gaps 5=exceptional. Score independently, no weighted_total or verdict.
SOURCES: copy exact URLs from the brief only. No invented URLs.
BREVITY: rationale = 1-2 sentences max. Keep all text fields short.

Return ONLY valid JSON:
{"summary":"2-3 sentences","scores":{"unmet_need":{"score":3,"rationale":"1-2 sentences"},"pediatric_specificity":{"score":3,"rationale":"1-2 sentences"},"innovation":{"score":3,"rationale":"1-2 sentences"},"technical_feasibility":{"score":3,"rationale":"1-2 sentences"},"regulatory_pathway":{"score":3,"rationale":"1-2 sentences"},"market_impact":{"score":3,"rationale":"1-2 sentences"},"bch_fit":{"score":3,"rationale":"1-2 sentences"}},"verdict_rationale":"2 sentences","key_strengths":["s1","s2"],"key_concerns":["c1","c2"],"recommended_next_steps":"2 steps","sources":[{"url":"https://...","title":"...","context":"1 sentence"}],"clinical_landscape":{"problem_summary":"2-3 sentences","current_standard_of_care":"2 sentences","key_literature":[{"citation":"Author, Journal, Year","finding":"1 sentence","source_url":"url or null"}],"evidence_gaps":"2 sentences"},"competitive_landscape":{"existing_devices":[{"name":"...","status":"marketed","limitation":"1 sentence","source_url":"url or null"}],"white_space":"2 sentences"},"freedom_to_operate":{"landscape_summary":"2 sentences","key_patents":[{"identifier":"...","relevance":"1 sentence","source_url":"url or null"}],"fto_risk":"MEDIUM","fto_commentary":"2 sentences"},"market_and_epidemiology":{"patient_population":"2 sentences","annual_us_cases":"~X,XXX/year (Source)","global_opportunity":"1 sentence","market_size_estimate":"$XXM–$XXXM"},"regulatory_analysis":{"recommended_pathway":"510(k)","pathway_rationale":"2 sentences","predicate_devices":["device1"],"key_regulatory_risks":"2 sentences","estimated_timeline":"X–Y years"},"reimbursement_landscape":{"relevant_cpt_codes":["XXXXX: desc"],"relevant_drg_codes":["XXX: desc"],"payer_landscape":"2 sentences","reimbursement_risk":"MEDIUM","commentary":"1 sentence"},"strategic_fit":{"bch_capabilities":"2 sentences","partnership_opportunities":"1 sentence","recommended_team":["role1","role2","role3"]}}`;

  const synthEvents = [
    { pct: 94, text: "Scoring criteria against evidence…" },
    { pct: 97, text: "Finalising report structure…" },
  ];
  let synthIdx = 0;
  const synthTimer = setInterval(() => {
    if (synthIdx < synthEvents.length) {
      const e = synthEvents[synthIdx++];
      onEvent({ type: "stage", text: e.text, pct: e.pct });
    }
  }, 10000);

  let synthData;
  try {
    const synthResp = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 6000,
        temperature: 0,
        system: synthesisSystem,
        messages: [{
          role: "user",
          content: `DEVICE IDEA:\n${idea}\n\nRESEARCH BRIEF:\n${researchBrief}`
        }]
      })
    });
    clearInterval(synthTimer);
    synthData = await synthResp.json();
  } catch(e) {
    clearInterval(synthTimer);
    throw e;
  }
  if (synthData.error) throw new Error(synthData.error.message);

  const finalText = (synthData.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  onEvent({ type: "done", text: "Report compiled.", pct: 100 });

  if (!finalText) throw new Error("Synthesis returned no content. Please try again.");
  const report = safeParseJSON(finalText);

  if (!Array.isArray(report.sources)) report.sources = [];
  const seen = new Set();
  report.sources = report.sources.filter(s => {
    if (!s || !s.url || !s.url.startsWith("http") || seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });

  const WEIGHTS = {
    unmet_need: 0.20, pediatric_specificity: 0.15, innovation: 0.15,
    technical_feasibility: 0.15, regulatory_pathway: 0.15,
    market_impact: 0.10, bch_fit: 0.10
  };
  const scores = report.scores || {};
  let weightedTotal = 0;
  let totalWeight = 0;
  Object.entries(WEIGHTS).forEach(([key, w]) => {
    const s = scores[key];
    const val = s && typeof s.score === "number" ? Math.min(5, Math.max(1, s.score)) : 3;
    weightedTotal += val * w;
    totalWeight += w;
  });
  report.weighted_total = Math.round((weightedTotal / totalWeight) * 10) / 10;

  if (report.weighted_total >= 3.5) report.verdict = "ELIGIBLE";
  else if (report.weighted_total >= 2.5) report.verdict = "PENDING";
  else report.verdict = "INELIGIBLE";

  onEvent({ type: "done", text: `Report compiled. ${report.sources ? report.sources.length : 0} sources verified.` });
  return { report, verifiedSources: report.sources };
}


// ─── UI COMPONENTS ────────────────────────────────────────────────────────────

function Spinner({ visible }) {
  const messages = [
    "Searching clinical literature…",
    "Scanning competitive landscape…",
    "Reviewing patent landscape…",
    "Checking FDA regulatory database…",
    "Analyzing reimbursement data…",
    "Assessing BCH strategic fit…",
    "Compiling evaluation report…",
  ];
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const iv = setInterval(() => setMsgIdx(i => (i + 1) % messages.length), 3500);
    return () => clearInterval(iv);
  }, [visible]);

  if (!visible) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 20, padding: "16px 20px", background: "#f0ede8", borderRadius: 10, border: "1px solid #e0dbd4" }}>
      <svg width="22" height="22" viewBox="0 0 22 22" style={{ flexShrink: 0, animation: "spin 0.9s linear infinite" }}>
        <circle cx="11" cy="11" r="9" fill="none" stroke="#e0dbd4" strokeWidth="2.5" />
        <path d="M11 2 A9 9 0 0 1 20 11" fill="none" stroke="#0c2340" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <span style={{ fontFamily: "sans-serif", fontSize: 13, color: "#555" }}>{messages[msgIdx]}</span>
    </div>
  );
}

function ScoreBar({ score }) {
  const color = score >= 4 ? "#00875a" : score >= 3 ? "#b76e00" : "#c0392b";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, height: 5, background: "#ece9e4", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: (score / 5 * 100) + "%", height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color, minWidth: 28 }}>{score}/5</span>
    </div>
  );
}

function RiskBadge({ level }) {
  const cfg = RISK_CONFIG[level] || RISK_CONFIG["MEDIUM"];
  return <span style={{ background: cfg.bg, color: cfg.color, fontFamily: "monospace", fontWeight: 700, fontSize: 11, padding: "3px 10px", borderRadius: 4, letterSpacing: 1 }}>{level}</span>;
}

function ST({ children }) {
  return <div style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: "uppercase", color: "#8a7f74", marginBottom: 14, paddingBottom: 8, borderBottom: "1px solid #e8e3dc" }}>{children}</div>;
}

function Card({ children, style }) {
  return <div style={{ background: "white", borderRadius: 10, padding: "24px 28px", marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", ...(style||{}) }}>{children}</div>;
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label style={{ fontFamily: "sans-serif", fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: "100%", padding: "10px 14px", border: "1.5px solid #ddd8d0", borderRadius: 8, fontFamily: "sans-serif", fontSize: 14, boxSizing: "border-box", outline: "none", background: "#faf9f7" }} />
    </div>
  );
}

function Meta({ label, value }) {
  return (
    <div>
      <div style={{ fontFamily: "sans-serif", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#7aaac8", marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "sans-serif", fontSize: 14, fontWeight: 600, color: "white" }}>{value}</div>
    </div>
  );
}

function SourceLink({ url, title }) {
  if (!url) return null;
  const display = title || url;
  const short = display.length > 70 ? display.slice(0, 70) + "…" : display;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "sans-serif", fontSize: 11, color: "#2563a8", textDecoration: "none", background: "#edf4ff", padding: "3px 9px", borderRadius: 4, border: "1px solid #c3d9f7", wordBreak: "break-all" }}>
      <span>🔗</span>{short}
    </a>
  );
}

function SourcesPanel({ sources }) {
  const list = (sources || []).filter(s => s && s.url && s.url.startsWith("http"));
  return (
    <div className="sources-section" style={{ background: "#0c2340", borderRadius: 10, padding: "28px 32px", marginBottom: 16 }}>
      <div style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: "uppercase", color: "#7aaac8", marginBottom: 6, paddingBottom: 10, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        Research Sources & References — {list.length} verified {list.length === 1 ? "source" : "sources"}
      </div>
      <div style={{ fontFamily: "sans-serif", fontSize: 12, color: "#7aaac8", marginBottom: 18, lineHeight: 1.5 }}>
        All sources below were retrieved via live web search during this analysis. Click any URL to open the original.
      </div>
      {list.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {list.map((s, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.06)", borderRadius: 6, padding: "12px 16px", border: "1px solid rgba(255,255,255,0.09)" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ fontFamily: "monospace", fontSize: 11, color: "#c8a850", background: "rgba(200,168,80,0.18)", padding: "2px 8px", borderRadius: 3, minWidth: 26, textAlign: "center", flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "sans-serif", fontWeight: 600, fontSize: 13, color: "white", marginBottom: 3, lineHeight: 1.4 }}>{s.title || "Untitled Source"}</div>
                  {s.context && (
                    <div style={{ fontFamily: "sans-serif", fontSize: 12, color: "#99b8cc", marginBottom: 6, lineHeight: 1.4 }}>{s.context}</div>
                  )}
                  <a href={s.url} target="_blank" rel="noopener noreferrer"
                    style={{ fontFamily: "monospace", fontSize: 11, color: "#5ba4d4", wordBreak: "break-all", lineHeight: 1.5, display: "block" }}>
                    {s.url}
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 6, padding: "16px", fontFamily: "sans-serif", fontSize: 13, color: "#4a7fa0", fontStyle: "italic" }}>
          The model performed web searches during analysis but did not return source URLs in this session. Re-run the analysis to capture sources.
        </div>
      )}
    </div>
  );
}


// ─── MAIN APP ─────────────────────────────────────────────────────────────────

// ── PI Submission view ──────────────────────────────────────────────────────


// ─── FILE UPLOADER ────────────────────────────────────────────────────────────

function FileUploader({ files, onAdd, onRemove, label = "Supporting Documents", hint = "Upload PDFs, Word docs, images, or presentations (max 5 files · 10MB each)" }) {
  const [dragOver, setDragOver] = useState(false);

  async function processFiles(fileList) {
    const allowed = Array.from(fileList).slice(0, 5 - files.length);
    for (const file of allowed) {
      if (file.size > 10 * 1024 * 1024) { alert(`${file.name} is too large (max 10MB).`); continue; }
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(",")[1]);
        r.onerror = () => rej(new Error("Read failed"));
        r.readAsDataURL(file);
      });
      const mediaType = file.type || "application/octet-stream";
      onAdd({ name: file.name, size: file.size, mediaType, base64, addedAt: new Date().toISOString() });
    }
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function fileIcon(name) {
    const ext = name.split(".").pop().toLowerCase();
    if (["pdf"].includes(ext)) return "📄";
    if (["doc","docx"].includes(ext)) return "📝";
    if (["ppt","pptx"].includes(ext)) return "📊";
    if (["xls","xlsx","csv"].includes(ext)) return "📈";
    if (["png","jpg","jpeg","gif","webp"].includes(ext)) return "🖼️";
    return "📎";
  }

  return (
    <div>
      <div style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: "uppercase", color: "#8a7f74", marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: "sans-serif", fontSize: 12, color: "#8a7f74", marginBottom: 12, lineHeight: 1.5 }}>{hint}</div>

      {/* Drop zone — using label so click works in sandboxed iframe */}
      {files.length < 5 && (
        <label
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); processFiles(e.dataTransfer.files); }}
          style={{ display: "block", border: `2px dashed ${dragOver ? "#0c2340" : "#ddd8d0"}`, borderRadius: 10, padding: "20px 16px", textAlign: "center", cursor: "pointer", background: dragOver ? "#eef4fa" : "#faf9f7", transition: "all 0.2s", marginBottom: 12 }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>📎</div>
          <div style={{ fontFamily: "sans-serif", fontSize: 13, fontWeight: 600, color: "#0c2340", marginBottom: 3 }}>Click to upload or drag & drop</div>
          <div style={{ fontFamily: "sans-serif", fontSize: 11, color: "#aaa" }}>PDF · DOCX · PPTX · XLSX · Images · {5 - files.length} slot{5 - files.length !== 1 ? "s" : ""} remaining</div>
          <input type="file" multiple accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.gif,.webp" style={{ display: "none" }}
            onChange={e => { processFiles(e.target.files); e.target.value = ""; }} />
        </label>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {files.map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "white", borderRadius: 8, border: "1px solid #e8e3dc" }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>{fileIcon(f.name)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "sans-serif", fontSize: 13, fontWeight: 600, color: "#1a1814", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                <div style={{ fontFamily: "monospace", fontSize: 10, color: "#aaa", marginTop: 2 }}>{formatSize(f.size)}</div>
              </div>
              <button onClick={() => onRemove(i)}
                style={{ background: "#fdeef0", border: "none", borderRadius: 6, width: 28, height: 28, cursor: "pointer", color: "#c0392b", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PIView() {
  const [submittedBy, setSubmittedBy] = useState("");
  const [department, setDepartment] = useState("");
  const [idea, setIdea] = useState("");
  const [qaThread, setQaThread] = useState([]);
  const [qaInput, setQaInput] = useState("");
  const [qaLoading, setQaLoading] = useState(false);
  const [qaApproved, setQaApproved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);
  const [attachments, setAttachments] = useState([]);

  const wordCount = idea.trim().split(/\s+/).filter(Boolean).length;

  async function handleQA(userAnswer) {
    setQaLoading(true);
    try {
      const newThread = userAnswer ? [...qaThread, { role: "user", content: userAnswer }] : qaThread;
      const apiMessages = [{ role: "user", content: idea }, ...newThread];
      const reply = await runQA(apiMessages, attachments);
      if (reply.trim() === "APPROVED") {
        setQaThread([...newThread, { role: "assistant", content: "APPROVED" }]);
        setQaApproved(true);
      } else {
        setQaThread([...newThread, { role: "assistant", content: reply }]);
        setQaInput("");
      }
    } catch(e) { setError(e.message); }
    setQaLoading(false);
  }

  async function handleSaveSubmission() {
    setSaving(true);
    try {
      const id = "sub_" + Date.now();
      const submission = {
        id, submittedBy, department, idea, qaThread,
        attachments: attachments.map(f => ({ name: f.name, size: f.size, mediaType: f.mediaType, base64: f.base64 })),
        submittedAt: new Date().toISOString(),
        status: "pending"
      };
      await storage.set(id, JSON.stringify(submission), true);
      setSubmitted(true);
    } catch(e) { setError("Failed to save: " + e.message); }
    setSaving(false);
  }

  if (submitted) {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f2ee", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 520, textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 20 }}>✅</div>
          <div style={{ fontFamily: "Georgia,serif", fontSize: 24, fontWeight: 700, color: "#0c2340", marginBottom: 12 }}>Application Submitted</div>
          <div style={{ fontFamily: "sans-serif", fontSize: 15, color: "#555", lineHeight: 1.7, marginBottom: 28 }}>
            Thank you, {submittedBy || "Investigator"}. Your device idea has been received by the BCH Pediatric Venture Studio selection committee. You will be contacted if your submission advances to the next stage.
          </div>
          <div style={{ fontFamily: "sans-serif", fontSize: 12, color: "#aaa" }}>Boston Children's Hospital · Pediatric Venture Studio · {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Georgia,serif", minHeight: "100vh", background: "#f5f2ee", color: "#1a1814" }}>
      <style dangerouslySetInnerHTML={{__html: `@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}} />
      <div style={{ background: "#0c2340", color: "white", padding: "20px 40px" }}>
        <div style={{ fontFamily: "sans-serif", fontSize: 17, fontWeight: 700 }}>Boston Children's Hospital · Pediatric Venture Studio</div>
        <div style={{ fontFamily: "sans-serif", fontSize: 12, color: "#7aaac8", marginTop: 3 }}>Device Idea Submission</div>
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "36px 24px" }}>
        <Card>
          <div style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: "uppercase", color: "#8a7f74", marginBottom: 16, paddingBottom: 8, borderBottom: "1px solid #e8e3dc" }}>Your Details</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: submittedBy.trim() && department.trim() ? 28 : 16 }}>
            <div>
              <label style={{ fontFamily: "sans-serif", fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>
                Your Name <span style={{ color: "#c0392b" }}>*</span>
              </label>
              <input value={submittedBy} onChange={e => setSubmittedBy(e.target.value)} placeholder="Dr. Jane Smith"
                style={{ width: "100%", padding: "10px 14px", border: submittedBy.trim() ? "1.5px solid #b3dfc4" : "1.5px solid #ddd8d0", borderRadius: 8, fontFamily: "sans-serif", fontSize: 14, boxSizing: "border-box", outline: "none", background: "#faf9f7" }} />
            </div>
            <div>
              <label style={{ fontFamily: "sans-serif", fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>
                Department / Division <span style={{ color: "#c0392b" }}>*</span>
              </label>
              <input value={department} onChange={e => setDepartment(e.target.value)} placeholder="e.g. Cardiology, Neonatology"
                style={{ width: "100%", padding: "10px 14px", border: department.trim() ? "1.5px solid #b3dfc4" : "1.5px solid #ddd8d0", borderRadius: 8, fontFamily: "sans-serif", fontSize: 14, boxSizing: "border-box", outline: "none", background: "#faf9f7" }} />
            </div>
          </div>

          {!(submittedBy.trim() && department.trim()) && (
            <div style={{ padding: "14px 18px", background: "#fff8ed", border: "1.5px solid #e8c870", borderRadius: 8, fontFamily: "sans-serif", fontSize: 13, color: "#7a5a00", marginBottom: 4 }}>
              Please enter your name and department to begin the application.
            </div>
          )}

          {submittedBy.trim() && department.trim() && (
          <><div style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: "uppercase", color: "#8a7f74", marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid #e8e3dc" }}>Describe Your Device Idea</div>
          <p style={{ fontFamily: "sans-serif", fontSize: 13, color: "#6b6458", marginBottom: 14, lineHeight: 1.65 }}>
            In your own words, describe the clinical problem you're trying to solve, your proposed solution, and the patients it would help. Don't worry about being too formal — write it as you would explain it to a colleague.
          </p>

          <textarea
            value={idea}
            onChange={e => { setIdea(e.target.value); setQaThread([]); setQaApproved(false); }}
            disabled={qaThread.length > 0}
            placeholder="Example: In our NICU, we see infants with congenital diaphragmatic hernia who need precise ventilation monitoring. The sensors we currently use were designed for adults and can't accurately measure the tiny volumes involved..."
            rows={8}
            style={{ width: "100%", padding: "14px 16px", border: "1.5px solid #ddd8d0", borderRadius: 8, fontFamily: "Georgia,serif", fontSize: 14, lineHeight: 1.75, resize: "vertical", boxSizing: "border-box", outline: "none", background: qaThread.length > 0 ? "#f5f2ee" : "#faf9f7", color: "#1a1814", opacity: qaThread.length > 0 ? 0.7 : 1 }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, marginBottom: 16 }}>
            <span style={{ fontFamily: "monospace", fontSize: 12, color: wordCount < 10 && attachments.length === 0 ? "#c0392b" : "#888" }}>{wordCount} words{attachments.length > 0 && wordCount < 10 ? " (optional — document attached)" : ""}</span>
            {qaThread.length > 0 && !qaApproved && (
              <button onClick={() => { setQaThread([]); setQaApproved(false); }} style={{ background: "none", border: "none", fontFamily: "sans-serif", fontSize: 12, color: "#888", cursor: "pointer", textDecoration: "underline" }}>✏️ Edit description</button>
            )}
          </div>

          {/* Document upload */}
          <div style={{ marginBottom: 20, paddingTop: 16, borderTop: "1px solid #e8e3dc" }}>
            <FileUploader
              files={attachments}
              onAdd={f => setAttachments(prev => [...prev, f])}
              onRemove={i => setAttachments(prev => prev.filter((_,idx) => idx !== i))}
              label="Supporting Documents (Optional)"
              hint="Upload any relevant literature, preliminary data, patents, or protocols. These will be shared with the committee."
            />
          </div>

          {qaThread.length === 0 && !qaApproved && (
            <button onClick={() => handleQA(null)} disabled={qaLoading || (wordCount < 10 && attachments.length === 0)}
              style={{ width: "100%", background: qaLoading || (wordCount < 10 && attachments.length === 0) ? "#c0bbb4" : "#0c2340", color: "white", border: "none", borderRadius: 8, padding: "13px", fontFamily: "sans-serif", fontWeight: 600, fontSize: 14, cursor: qaLoading || (wordCount < 10 && attachments.length === 0) ? "not-allowed" : "pointer" }}>
              {qaLoading ? "Reviewing…" : "Submit for Review →"}
            </button>
          )}

          {/* Q&A thread */}
          {qaThread.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {qaThread.filter(m => m.content !== "APPROVED").map((msg, i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", flexDirection: msg.role === "assistant" ? "row" : "row-reverse" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: msg.role === "assistant" ? "#0c2340" : "#c8a850", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>
                      {msg.role === "assistant" ? "🏥" : "👤"}
                    </div>
                    <span style={{ fontFamily: "sans-serif", fontSize: 9, fontWeight: 700, color: msg.role === "assistant" ? "#0c2340" : "#8a7050", letterSpacing: 0.5, textTransform: "uppercase", whiteSpace: "nowrap" }}>
                      {msg.role === "assistant" ? "PVS Agent" : (submittedBy.trim() || "You")}
                    </span>
                  </div>
                  <div style={{ maxWidth: "82%", padding: "12px 16px", borderRadius: 12, background: msg.role === "assistant" ? "#eef4fa" : "#fff8ed", border: msg.role === "assistant" ? "1px solid #c3d9f7" : "1px solid #e8c870", fontFamily: "sans-serif", fontSize: 14, lineHeight: 1.7, color: "#1a1814", whiteSpace: "pre-wrap" }}>
                    {msg.content}
                  </div>
                </div>
              ))}

              {qaApproved ? (
                <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", background: "#e3f5ec", borderRadius: 10, border: "1.5px solid #7dbe9e" }}>
                  <span style={{ fontSize: 24 }}>✅</span>
                  <div>
                    <div style={{ fontFamily: "sans-serif", fontWeight: 700, fontSize: 14, color: "#00875a" }}>Your submission is complete</div>
                    <div style={{ fontFamily: "sans-serif", fontSize: 13, color: "#2d7a4f", marginTop: 2 }}>Click below to send it to the selection committee.</div>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                  <textarea
                    value={qaInput}
                    onChange={e => setQaInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && qaInput.trim()) { e.preventDefault(); handleQA(qaInput); } }}
                    placeholder="Your answer… (Enter to send)"
                    rows={3}
                    style={{ flex: 1, padding: "10px 14px", border: "1.5px solid #c3d9f7", borderRadius: 8, fontFamily: "Georgia,serif", fontSize: 13, lineHeight: 1.6, resize: "none", boxSizing: "border-box", outline: "none", background: "#faf9f7" }}
                  />
                  <button onClick={() => qaInput.trim() && handleQA(qaInput)} disabled={qaLoading || !qaInput.trim()}
                    style={{ background: qaLoading || !qaInput.trim() ? "#c0bbb4" : "#0c2340", color: "white", border: "none", borderRadius: 8, padding: "0 18px", fontFamily: "sans-serif", fontWeight: 700, fontSize: 20, cursor: qaLoading || !qaInput.trim() ? "not-allowed" : "pointer" }}>
                    {qaLoading ? "…" : "↑"}
                  </button>
                </div>
              )}

              {qaApproved && (
                <button onClick={handleSaveSubmission} disabled={saving || !submittedBy.trim()}
                  style={{ width: "100%", marginTop: 4, background: saving || !submittedBy.trim() ? "#c0bbb4" : "#00875a", color: "white", border: "none", borderRadius: 8, padding: "14px", fontFamily: "sans-serif", fontWeight: 700, fontSize: 15, cursor: saving || !submittedBy.trim() ? "not-allowed" : "pointer" }}>
                  {saving ? "Submitting…" : !submittedBy.trim() ? "Enter your name above to submit" : "Submit Application →"}
                </button>
              )}
            </div>
          )}
          {error && <p style={{ color: "#c0392b", fontFamily: "sans-serif", fontSize: 13, marginTop: 12 }}>⚠ {error}</p>}
          </>)}
        </Card>
      </div>
    </div>
  );
}

// ── Committee Dashboard ───────────────────────────────────────────────────────

function CommitteeApp() {
  const [submissions, setSubmissions] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selected, setSelected] = useState(null); // full submission object
  const [view, setView] = useState("dashboard"); // "dashboard" | "review"
  const [reviewStep, setReviewStep] = useState(1); // 1 | 2 | 3

  // Committee review state
  const [report, setReport] = useState(null);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activityLog, setActivityLog] = useState([]);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [error, setError] = useState(null);
  const [piScore, setPiScore] = useState(null);
  const [teamRatings, setTeamRatings] = useState({ expertise: null, commercialization: null, institutional: null, completeness: null, commitment: null });
  const [weights, setWeights] = useState({ ...DEFAULT_WEIGHTS });
  const [piWeightPct, setPiWeightPct] = useState(15);
  const [weightsOpen, setWeightsOpen] = useState(false);
  const [committeeFiles, setCommitteeFiles] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // sub.id to confirm

  const ratedValues = Object.values(teamRatings).filter(v => v !== null);
  const computedTeamScore = ratedValues.length > 0 ? Math.round((ratedValues.reduce((a,b) => a+b,0) / ratedValues.length) * 10) / 10 : null;
  const teamComplete = ratedValues.length === 5;
  const weightSum = Object.values(weights).reduce((a,b) => a+b, 0);
  const weightsValid = weightSum === 100;
  const ideaWeightedTotal = report ? computeWeightedTotal(report.scores, weights) : null;
  const PI_WEIGHT_FRAC = piWeightPct / 100;
  const IDEA_WEIGHT_FRAC = 1 - PI_WEIGHT_FRAC;
  const adjustedTotal = (ideaWeightedTotal !== null && computedTeamScore !== null)
    ? Math.round((ideaWeightedTotal * IDEA_WEIGHT_FRAC + computedTeamScore * PI_WEIGHT_FRAC) * 10) / 10
    : ideaWeightedTotal;
  const finalVerdict = adjustedTotal !== null ? (adjustedTotal >= 3.5 ? "ELIGIBLE" : adjustedTotal >= 2.5 ? "PENDING" : "INELIGIBLE") : null;
  const vCfg = finalVerdict ? (VERDICT_CONFIG[finalVerdict] || VERDICT_CONFIG["PENDING"]) : null;
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  function setWeight(key, val) { setWeights(w => ({ ...w, [key]: Math.max(0, Math.min(100, Number(val))) })); }
  function resetWeights() { setWeights({ ...DEFAULT_WEIGHTS }); setPiWeightPct(15); }

  useEffect(() => {
    loadSubmissions();
  }, []);

  async function loadSubmissions() {
    setLoadingList(true);
    try {
      const result = await storage.list("sub_", true);
      if (result && result.keys) {
        const items = await Promise.all(result.keys.map(async key => {
          try {
            const r = await storage.get(key, true);
            return r ? JSON.parse(r.value) : null;
          } catch { return null; }
        }));
        setSubmissions(items.filter(Boolean).sort((a,b) => new Date(b.submittedAt) - new Date(a.submittedAt)));
      }
    } catch(e) { console.error(e); }
    setLoadingList(false);
  }

  async function openSubmission(sub) {
    setSelected(sub);
    setReport(null); setSources([]); setError(null);
    setPiScore(null);
    setTeamRatings({ expertise: null, commercialization: null, institutional: null, completeness: null, commitment: null });
    setCommitteeFiles([]);
    setView("review");
    // Try to load a cached report for this submission
    try {
      const cached = await storage.get("report_" + sub.id, true);
      if (cached) {
        const d = JSON.parse(cached.value);
        setReport(d.report);
        setSources(d.sources || []);
        if (d.teamRatings) setTeamRatings(d.teamRatings);
        if (d.weights) setWeights(d.weights);
        if (d.piWeightPct !== undefined) setPiWeightPct(d.piWeightPct);
        setReviewStep(3); // go straight to report
      } else {
        setReviewStep(1);
      }
    } catch(e) {
      setReviewStep(1);
    }
  }

  async function archiveSubmission(sub) {
    try {
      const updated = { ...sub, status: "archived", archivedAt: new Date().toISOString() };
      await storage.set(sub.id, JSON.stringify(updated), true);
      setSubmissions(prev => prev.map(s => s.id === sub.id ? updated : s));
    } catch(e) { alert("Failed to archive: " + e.message); }
  }

  async function unarchiveSubmission(sub) {
    try {
      const updated = { ...sub, status: "pending", archivedAt: null };
      await storage.set(sub.id, JSON.stringify(updated), true);
      setSubmissions(prev => prev.map(s => s.id === sub.id ? updated : s));
    } catch(e) { alert("Failed to unarchive: " + e.message); }
  }

  async function deleteSubmission(sub) {
    try {
      await storage.delete(sub.id, true);
      try { await storage.delete("report_" + sub.id, true); } catch(_) {}
      setSubmissions(prev => prev.filter(s => s.id !== sub.id));
      setConfirmDelete(null);
    } catch(e) { alert("Failed to delete: " + e.message); }
  }

  async function handleRunAnalysis() {
    if (!selected || !teamComplete) return;
    const ideaText = selected.idea
      + (selected.qaThread && selected.qaThread.filter(m => m.content !== "APPROVED").length > 0
        ? "\n\n--- Clarifications from Q&A ---\n"
          + selected.qaThread.filter(m => m.content !== "APPROVED").map(m => (m.role === "user" ? "Investigator: " : "Reviewer asked: ") + m.content).join("\n\n")
        : "");
    // Append committee doc names to context so model knows they exist
    const docContext = committeeFiles.length > 0 ? "\n\n--- Committee-uploaded reference documents ---\n" + committeeFiles.map(f => `• ${f.name}`).join("\n") : "";
    setLoading(true); setError(null); setActivityLog([]); setAnalysisProgress(0);
    try {
      const allDocs = [...(selected.attachments || []), ...committeeFiles];
      const { report: r, verifiedSources } = await runAnalysis(ideaText, ev => {
        setActivityLog(prev => [...prev, ev]);
        if (ev.pct !== undefined) setAnalysisProgress(ev.pct);
      }, allDocs);
      setReport(r); setSources(verifiedSources); setAnalysisProgress(100);
      // Cache report so committee can revisit without re-running
      try {
        const cacheKey = "report_" + selected.id;
        await storage.set(cacheKey, JSON.stringify({ report: r, sources: verifiedSources, teamRatings, weights, piWeightPct, cachedAt: new Date().toISOString() }), true);
      } catch(e) { /* cache save failed silently */ }
    } catch(e) { setError(e.message); setAnalysisProgress(0); }
    setLoading(false);
  }

  // ── Dashboard ──
  // Seed an example project if storage is empty
  useEffect(() => {
    async function seedExample() {
      try {
        const result = await storage.list("sub_", true);
        if (result && result.keys && result.keys.length === 0) {
          const example = {
            id: "sub_example",
            submittedBy: "Dr. Sarah Chen",
            department: "Cardiology — Interventional",
            idea: "In our cath lab, we perform epicardial ventricular tachycardia ablation in pediatric patients with structural heart disease. The current mapping and ablation catheters are designed for adult anatomy and have shaft stiffness and tip geometry that makes navigating the small, fragile pediatric epicardial space extremely difficult. We frequently have to modify technique in ways that extend procedure time and increase complication risk. I believe we need a catheter system specifically engineered for pediatric epicardial access — with appropriate shaft flexibility, a smaller tip size, and an irrigation profile matched to the lower blood volumes in children.",
            qaThread: [
              { role: "assistant", content: "What specifically fails with the current catheter when you're working in a small pediatric epicardial space — is it the initial access, the navigation to the target site, or maintaining stable contact during ablation?" },
              { role: "user", content: "All three, honestly. The puncture itself is harder because the needle geometry assumes a larger chest. Once inside, the stiff shafts make navigation unpredictable — small movements cause large deflections. And contact force is nearly impossible to control because the catheters weren't designed for the pressures and volumes we're working with in a 15kg child." },
              { role: "assistant", content: "Do you have a sense yet of the core engineering change — is this primarily a shaft flexibility problem, a tip redesign, or would it require a ground-up catheter architecture?" },
              { role: "user", content: "I think it needs to be ground-up. The stiffness profiles, the irrigation holes, the mapping electrode spacing — all of it is scaled wrong. I've been working informally with our biomedical engineering group and we have a rough prototype concept with variable stiffness zones along the shaft." },
              { role: "assistant", content: "APPROVED" }
            ],
            attachments: [],
            submittedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
            status: "pending"
          };
          await storage.set("sub_example", JSON.stringify(example), true);
        }
      } catch(e) { /* seed failed silently */ }
    }
    seedExample();
  }, []);

  if (view === "dashboard") {
    const statusColors = { pending: { bg: "#fff8ed", color: "#b76e00", label: "Pending Review" }, reviewed: { bg: "#e3f5ec", color: "#00875a", label: "Reviewed" }, ineligible: { bg: "#fdeef0", color: "#c0392b", label: "Ineligible" }, archived: { bg: "#f0ede8", color: "#aaa", label: "Archived" } };
    const active = submissions.filter(s => s.status !== "archived");
    const archived = submissions.filter(s => s.status === "archived");
    const visible = showArchived ? archived : active;

    return (
      <div style={{ fontFamily: "Georgia,serif", minHeight: "100vh", background: "#f0ede8" }}>
        <style dangerouslySetInnerHTML={{__html: `@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}} />

        {/* Header */}
        <div style={{ background: "#0c2340", color: "white", padding: "18px 40px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: "sans-serif", fontSize: 17, fontWeight: 700 }}>Boston Children's Hospital · Pediatric Venture Studio</div>
            <div style={{ fontFamily: "sans-serif", fontSize: 12, color: "#7aaac8", marginTop: 3 }}>Selection Committee Dashboard</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button onClick={() => setMethodologyOpen(o => !o)} style={{ background: "rgba(255,255,255,0.1)", color: "white", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, padding: "8px 14px", fontFamily: "sans-serif", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>? Methodology</button>
            <button onClick={loadSubmissions} style={{ background: "#1e3a5c", color: "white", border: "none", borderRadius: 6, padding: "8px 16px", fontFamily: "sans-serif", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>↻ Refresh</button>
          </div>
        </div>

        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>

          {/* Methodology modal */}
          {methodologyOpen && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 9998, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "32px 16px", overflowY: "auto" }}
              onClick={e => { if (e.target === e.currentTarget) setMethodologyOpen(false); }}>
              <div style={{ background: "#f0ede8", borderRadius: 16, padding: "36px 40px", maxWidth: 900, width: "100%", position: "relative", boxShadow: "0 24px 80px rgba(0,0,0,0.3)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                  <div style={{ fontFamily: "sans-serif", fontSize: 18, fontWeight: 700, color: "#0c2340" }}>Screening Methodology</div>
                  <button onClick={() => setMethodologyOpen(false)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#888", lineHeight: 1 }}>×</button>
                </div>

                <p style={{ fontFamily: "Georgia,serif", fontSize: 14, lineHeight: 1.8, color: "#3a3530", marginBottom: 20 }}>
                  This tool uses a two-phase AI pipeline. Phase 1 searches the web across 7 mandatory domains and compiles a research brief. Phase 2 uses that brief — without any tool call history — to generate a structured JSON report. This two-call architecture prevents context overflow and keeps scoring deterministic.
                </p>

                {/* Search volume */}
                <div style={{ background: "#0c2340", borderRadius: 10, padding: "20px 24px", color: "white", marginBottom: 14 }}>
                  <div style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#7aaac8", marginBottom: 14 }}>Search Engine & Volume</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 14 }}>
                    {[
                      { stat: "≥ 7", label: "Min searches", sub: "One per domain, enforced in system prompt" },
                      { stat: "≤ 12", label: "Max search rounds", sub: "Hard loop cap to prevent runaway calls" },
                      { stat: "8–15", label: "Sources required", sub: "Only URLs actually retrieved, never invented" },
                    ].map((s,i) => (
                      <div key={i} style={{ background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: "12px 14px" }}>
                        <div style={{ fontFamily: "monospace", fontSize: 26, fontWeight: 700, color: "#c8a850", lineHeight: 1, marginBottom: 5 }}>{s.stat}</div>
                        <div style={{ fontFamily: "sans-serif", fontSize: 12, fontWeight: 600, color: "white", marginBottom: 3 }}>{s.label}</div>
                        <div style={{ fontFamily: "sans-serif", fontSize: 11, color: "#7aaac8", lineHeight: 1.5 }}>{s.sub}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontFamily: "sans-serif", fontSize: 11, color: "#7aaac8", lineHeight: 1.7, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 12 }}>
                    <strong style={{ color: "#c8dae8" }}>Provider:</strong> Anthropic <span style={{ fontFamily: "monospace", color: "#c8a850" }}>web_search_20250305</span> · Live web queries · Two-phase architecture eliminates context overflow.
                  </div>
                </div>

                {/* 7 domains */}
                <div style={{ background: "#eef4fa", borderRadius: 10, padding: "18px 22px", border: "1px solid #d0e4f5", marginBottom: 14 }}>
                  <div style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#0c2340", marginBottom: 12 }}>7 Mandatory Search Domains</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {[
                      { num:"01", domain:"Clinical Burden & Epidemiology",         where:"CDC, NIH, WHO, PubMed",                            what:"Incidence, prevalence, age-specific rates" },
                      { num:"02", domain:"Standard of Care & Clinical Limitations", where:"AAP/AHA guidelines, UpToDate, hospital protocols",    what:"Current protocols, failure modes, documented gaps" },
                      { num:"03", domain:"Peer-Reviewed Clinical Literature",       where:"PubMed, Google Scholar, NEJM, Pediatrics, JAMA",     what:"RCTs, outcomes studies, systematic reviews" },
                      { num:"04", domain:"Competing Devices & Companies",           where:"Company sites, FDA 510(k) summaries, Crunchbase",    what:"Marketed products, pipeline, specific limitations" },
                      { num:"05", domain:"Patent Landscape",                        where:"Google Patents, USPTO, Espacenet",                   what:"Assignees, claim scope, FTO risk" },
                      { num:"06", domain:"FDA Regulatory Pathway & Predicates",     where:"FDA 510(k)/De Novo/PMA databases, FDA.gov guidance",  what:"K-numbers, device classification, product codes" },
                      { num:"07", domain:"Reimbursement: CPT, DRG & Payer Policy",  where:"CMS.gov, AMA CPT lookup, payer coverage pages",      what:"Codes, coverage status, payer policy language" },
                    ].map((d,i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "26px 1fr 1fr", gap: 10, background: "white", borderRadius: 6, padding: "9px 12px", alignItems: "flex-start" }}>
                        <div style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, color: "#0c2340", opacity: 0.3 }}>{d.num}</div>
                        <div>
                          <div style={{ fontFamily: "sans-serif", fontWeight: 700, fontSize: 12, color: "#0c2340", marginBottom: 2 }}>{d.domain}</div>
                          <div style={{ fontFamily: "sans-serif", fontSize: 11, color: "#4a6a88" }}><strong>Sources:</strong> {d.where}</div>
                        </div>
                        <div style={{ fontFamily: "sans-serif", fontSize: 11, color: "#555" }}><strong>Captures:</strong> {d.what}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Accuracy controls */}
                <div style={{ background: "#fdf6e3", borderRadius: 10, padding: "18px 22px", border: "1px solid #e8d8a0", marginBottom: 14 }}>
                  <div style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#5a3e00", marginBottom: 12 }}>Accuracy & Anti-Hallucination Controls</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {[
                      { icon:"🔒", label:"Deterministic scoring",        desc:"Weighted total and verdict computed in code. The model never outputs these values." },
                      { icon:"🌡️", label:"Temperature = 0",              desc:"Same inputs always produce the same scores on the synthesis call." },
                      { icon:"🔗", label:"URL validation filter",         desc:"Every source URL validated programmatically — must be https:// and unique." },
                      { icon:"✂️",  label:"Two-phase architecture",        desc:"Research brief only (no tool history) fed to synthesis. Eliminates context overflow." },
                      { icon:"🚫", label:"Score independence",            desc:"Synthesis prompt forbids adjusting scores to reach a target verdict." },
                      { icon:"📋", label:"Structured JSON output",         desc:"Strict schema with resilient fallback parser." },
                    ].map((c,i) => (
                      <div key={i} style={{ display: "flex", gap: 10, background: "white", borderRadius: 6, padding: "9px 12px", alignItems: "flex-start" }}>
                        <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>{c.icon}</span>
                        <div><span style={{ fontFamily: "sans-serif", fontWeight: 700, fontSize: 12, color: "#1a1814" }}>{c.label} — </span><span style={{ fontFamily: "sans-serif", fontSize: 12, color: "#555" }}>{c.desc}</span></div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Score anchors */}
                <div style={{ background: "white", borderRadius: 10, padding: "18px 22px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                  <div style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#8a7f74", marginBottom: 12 }}>Score Anchors & Verdict Thresholds</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
                    {[
                      { score:"5", label:"Exceptional", color:"#00875a", bg:"#e3f5ec", desc:"Best-in-class evidence. Clearly differentiated, strong validation, favorable regulatory path." },
                      { score:"4", label:"Strong",      color:"#5a8a3c", bg:"#f0f7ea", desc:"Strong evidence with only minor gaps. Viable path with manageable risks." },
                      { score:"3", label:"Moderate",    color:"#b76e00", bg:"#fff8ed", desc:"Some evidence but meaningful gaps remain. Addressable with additional work." },
                      { score:"2", label:"Weak",        color:"#d4691b", bg:"#fdf1e8", desc:"Significant problems. Substantial barriers without major pivots." },
                      { score:"1", label:"Insufficient",color:"#c0392b", bg:"#fdeef0", desc:"No meaningful evidence of viability. Fundamental gaps." },
                    ].map((a,i) => (
                      <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", background: a.bg, borderRadius: 6, padding: "8px 12px" }}>
                        <div style={{ width: 24, height: 24, borderRadius: 5, background: a.color, color: "white", fontFamily: "monospace", fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{a.score}</div>
                        <div><span style={{ fontFamily: "sans-serif", fontWeight: 700, fontSize: 12, color: a.color }}>{a.label} — </span><span style={{ fontFamily: "sans-serif", fontSize: 12, color: "#555" }}>{a.desc}</span></div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {[
                      { verdict:"ELIGIBLE",   color:"#00875a", bg:"#e3f5ec", rule:"≥ 3.5 — Ready to present to Selection Committee" },
                      { verdict:"PENDING",    color:"#b76e00", bg:"#fff4e0", rule:"2.5–3.4 — Address key concerns first" },
                      { verdict:"INELIGIBLE", color:"#c0392b", bg:"#fdeef0", rule:"< 2.5 — Not suitable at this stage" },
                    ].map((v,i) => (
                      <div key={i} style={{ background: v.bg, border: `1.5px solid ${v.color}55`, borderRadius: 7, padding: "8px 14px", flex: 1, minWidth: 160 }}>
                        <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 12, color: v.color, marginBottom: 3 }}>{v.verdict}</div>
                        <div style={{ fontFamily: "sans-serif", fontSize: 11, color: "#555" }}>{v.rule}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {loadingList ? (
            <div style={{ textAlign: "center", padding: 60, fontFamily: "sans-serif", color: "#888" }}>Loading submissions…</div>
          ) : (
            <>
              {/* Stats bar */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
                {[
                  { label: "All Active", val: active.length, color: "#0c2340", filter: null, active: !showArchived },
                  { label: "Pending Review", val: active.filter(s => s.status === "pending").length, color: "#b76e00", filter: null, active: !showArchived },
                  { label: "Reviewed", val: active.filter(s => s.status === "reviewed").length, color: "#00875a", filter: null, active: !showArchived },
                  { label: "Archived", val: archived.length, color: "#aaa", filter: "archived", active: showArchived },
                ].map((s, i) => (
                  <div key={i} onClick={() => setShowArchived(i === 3)}
                    style={{ background: (i === 3) === showArchived ? (i === 3 ? "#f0ede8" : "#eef4fa") : "white", borderRadius: 10, padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", cursor: "pointer", border: (i === 3) === showArchived ? `1.5px solid ${s.color}55` : "1.5px solid transparent", transition: "all 0.15s" }}>
                    <div style={{ fontFamily: "sans-serif", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: (i === 3) === showArchived ? s.color : "#aaa", marginBottom: 6 }}>{s.label}</div>
                    <div style={{ fontFamily: "monospace", fontSize: 30, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.val}</div>
                  </div>
                ))}
              </div>

              {/* Confirm delete dialog */}
              {confirmDelete && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
                  <div style={{ background: "white", borderRadius: 14, padding: "32px 36px", maxWidth: 420, width: "90%", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
                    <div style={{ fontSize: 36, marginBottom: 14 }}>🗑️</div>
                    <div style={{ fontFamily: "sans-serif", fontWeight: 700, fontSize: 17, color: "#1a1814", marginBottom: 10 }}>Delete this project?</div>
                    <div style={{ fontFamily: "sans-serif", fontSize: 13, color: "#777", lineHeight: 1.6, marginBottom: 24 }}>
                      This will permanently delete the submission and its cached report. This cannot be undone. Only archived projects can be deleted.
                    </div>
                    <div style={{ display: "flex", gap: 12 }}>
                      <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, background: "#f0ede8", color: "#555", border: "none", borderRadius: 8, padding: "11px", fontFamily: "sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Cancel</button>
                      <button onClick={() => deleteSubmission(submissions.find(s => s.id === confirmDelete))} style={{ flex: 1, background: "#c0392b", color: "white", border: "none", borderRadius: 8, padding: "11px", fontFamily: "sans-serif", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Delete permanently</button>
                    </div>
                  </div>
                </div>
              )}

              {visible.length === 0 ? (
                <div style={{ textAlign: "center", padding: 60, background: "white", borderRadius: 12 }}>
                  <div style={{ fontSize: 40, marginBottom: 16 }}>{showArchived ? "📦" : "📭"}</div>
                  <div style={{ fontFamily: "sans-serif", fontSize: 16, color: "#888" }}>{showArchived ? "No archived projects." : "No active submissions yet."}</div>
                  <div style={{ fontFamily: "sans-serif", fontSize: 13, color: "#aaa", marginTop: 8 }}>{showArchived ? "Archive a project from the active list to see it here." : "PI submissions will appear here automatically."}</div>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: "uppercase", color: "#8a7f74" }}>
                      {showArchived ? "📦 Archived" : "Active"} · {visible.length} project{visible.length !== 1 ? "s" : ""}
                    </div>
                    {showArchived && (
                      <button onClick={() => setShowArchived(false)} style={{ background: "none", border: "none", fontFamily: "sans-serif", fontSize: 12, color: "#888", cursor: "pointer", textDecoration: "underline" }}>← Back to active</button>
                    )}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
                    {visible.map(sub => {
                      const sc = statusColors[sub.status] || statusColors.pending;
                      const qaRounds = Math.ceil(((sub.qaThread||[]).filter(m => m.content !== "APPROVED").length) / 2);
                      const hasDocs = (sub.attachments||[]).length > 0;
                      const isArchived = sub.status === "archived";
                      return (
                        <div key={sub.id}
                          style={{ background: isArchived ? "#f9f8f6" : "white", borderRadius: 12, padding: "22px 24px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", border: "1.5px solid transparent", transition: "all 0.15s", display: "flex", flexDirection: "column", gap: 12 }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = isArchived ? "#ccc" : "#0c2340"; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = "transparent"; }}>

                          {/* Card header */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div>
                              <div style={{ fontFamily: "sans-serif", fontWeight: 700, fontSize: 15, color: isArchived ? "#888" : "#0c2340" }}>{sub.submittedBy || "Unknown"}</div>
                              {sub.department && <div style={{ fontFamily: "sans-serif", fontSize: 12, color: "#aaa", marginTop: 2 }}>{sub.department}</div>}
                            </div>
                            <span style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, background: sc.bg, color: sc.color, padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap", letterSpacing: 0.5 }}>{sc.label}</span>
                          </div>

                          {/* Idea preview */}
                          <div style={{ fontFamily: "Georgia,serif", fontSize: 13, color: isArchived ? "#999" : "#555", lineHeight: 1.6 }}>
                            {(sub.idea || "").slice(0, 160)}{(sub.idea||"").length > 160 ? "…" : ""}
                          </div>

                          {/* Tags */}
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontFamily: "sans-serif", fontSize: 10, color: "#888", background: "#f5f2ee", padding: "2px 8px", borderRadius: 4 }}>
                              {new Date(sub.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </span>
                            {qaRounds > 0 && <span style={{ fontFamily: "sans-serif", fontSize: 10, color: "#2563a8", background: "#edf4ff", padding: "2px 8px", borderRadius: 4 }}>{qaRounds} Q&A round{qaRounds !== 1 ? "s" : ""}</span>}
                            {hasDocs && <span style={{ fontFamily: "sans-serif", fontSize: 10, color: "#7d3c98", background: "#f5eeff", padding: "2px 8px", borderRadius: 4 }}>📎 {sub.attachments.length} doc{sub.attachments.length !== 1 ? "s" : ""}</span>}
                          </div>

                          {/* Actions */}
                          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                            {!isArchived && (
                              <button onClick={() => openSubmission(sub)}
                                style={{ flex: 1, background: "#0c2340", color: "white", border: "none", borderRadius: 8, padding: "9px", fontFamily: "sans-serif", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                                Review & Screen →
                              </button>
                            )}
                            {isArchived && (
                              <button onClick={() => openSubmission(sub)}
                                style={{ flex: 1, background: "#f0ede8", color: "#555", border: "1px solid #ddd", borderRadius: 8, padding: "9px", fontFamily: "sans-serif", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                                View Report →
                              </button>
                            )}
                            {!isArchived ? (
                              <button onClick={e => { e.stopPropagation(); archiveSubmission(sub); }}
                                title="Archive this project"
                                style={{ background: "#f0ede8", color: "#888", border: "1px solid #ddd", borderRadius: 8, padding: "9px 12px", fontFamily: "sans-serif", fontSize: 13, cursor: "pointer" }}>
                                📦
                              </button>
                            ) : (
                              <>
                                <button onClick={e => { e.stopPropagation(); unarchiveSubmission(sub); }}
                                  title="Restore to active"
                                  style={{ background: "#e3f5ec", color: "#00875a", border: "1px solid #b3dfc4", borderRadius: 8, padding: "9px 12px", fontFamily: "sans-serif", fontSize: 13, cursor: "pointer" }}>
                                  ↩
                                </button>
                                <button onClick={e => { e.stopPropagation(); setConfirmDelete(sub.id); }}
                                  title="Delete permanently"
                                  style={{ background: "#fdeef0", color: "#c0392b", border: "1px solid #f0b8b8", borderRadius: 8, padding: "9px 12px", fontFamily: "sans-serif", fontSize: 13, cursor: "pointer" }}>
                                  🗑️
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}


        </div>
      </div>
    );
  }

  // ── Review view ──
  const stepDone = [true, teamComplete, !!report];
  const stepLabels = ["Submission Review", "Team Assessment", "AI Report"];
  const stepIcons  = ["📋", "👥", "🔬"];

  return (
    <div style={{ fontFamily: "Georgia,serif", minHeight: "100vh", background: "#f0ede8", color: "#1a1814" }}>
      <style dangerouslySetInnerHTML={{__html:`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes shimmer { 0%{transform:translateX(-100%)} 100%{transform:translateX(300%)} }
        @keyframes pulse-bar { 0%,100%{opacity:1} 50%{opacity:0.6} }
        @media print { .no-print{display:none!important} body{-webkit-print-color-adjust:exact;print-color-adjust:exact} @page{margin:1.2cm 1.5cm;size:A4} .sources-section{background:#0c2340!important} }
        a:hover{text-decoration:underline}
      `}} />

      {/* Header */}
      <div className="no-print" style={{ background: "#0c2340", color: "white", padding: "16px 40px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: "sans-serif", fontSize: 16, fontWeight: 700 }}>Boston Children's Hospital · Pediatric Venture Studio</div>
          <div style={{ fontFamily: "sans-serif", fontSize: 12, color: "#7aaac8", marginTop: 2 }}>
            Reviewing: <strong style={{ color: "white" }}>{selected?.submittedBy}</strong>{selected?.department && ` · ${selected.department}`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => { setView("dashboard"); setReport(null); setReviewStep(1); }}
            style={{ background: "#1e3a5c", color: "white", border: "none", borderRadius: 6, padding: "8px 16px", fontFamily: "sans-serif", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
            ← Dashboard
          </button>
          {report && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontFamily: "sans-serif", fontSize: 11, color: "#7aaac8", background: "rgba(255,255,255,0.07)", padding: "4px 10px", borderRadius: 4 }}>📋 Report loaded</span>
              <button onClick={() => { setReport(null); setSources([]); setAnalysisProgress(0); setReviewStep(2); }} style={{ background: "#1e3a5c", color: "white", border: "none", borderRadius: 6, padding: "8px 14px", fontFamily: "sans-serif", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>↺ Re-run</button>
              <button onClick={() => window.print()} style={{ background: "#c8a850", color: "#0c2340", border: "none", borderRadius: 6, padding: "8px 16px", fontFamily: "sans-serif", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>⬇ Export PDF</button>
            </div>
          )}
        </div>
      </div>

      {/* Step indicator */}
      <div className="no-print" style={{ background: "white", borderBottom: "1px solid #e0dbd4", padding: "0 40px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", alignItems: "stretch" }}>
          {[1,2,3].map(n => {
            const active = reviewStep === n;
            const done = n < reviewStep || (n === 3 && !!report);
            return (
              <button key={n}
                onClick={() => { if (n <= reviewStep || done) setReviewStep(n); }}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 24px", background: "none", border: "none", borderBottom: active ? "3px solid #0c2340" : "3px solid transparent", cursor: n <= reviewStep || done ? "pointer" : "default", flex: 1, justifyContent: "center", transition: "border-color 0.2s" }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: done ? "#00875a" : active ? "#0c2340" : "#e8e3dc", color: done || active ? "white" : "#aaa", fontFamily: "sans-serif", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {done ? "✓" : n}
                </div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontFamily: "sans-serif", fontSize: 11, color: active ? "#0c2340" : done ? "#00875a" : "#aaa", fontWeight: 700, letterSpacing: 0.5 }}>{stepIcons[n-1]} {stepLabels[n-1]}</div>
                  <div style={{ fontFamily: "sans-serif", fontSize: 10, color: "#bbb", marginTop: 1 }}>
                    {n === 1 ? "Read & verify submission" : n === 2 ? "Rate the team (5 criteria)" : "Run AI analysis"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>

        {/* ─── STEP 1: SUBMISSION REVIEW ─── */}
        {reviewStep === 1 && (
          <>
            <Card>
              <ST>Original Description</ST>
              <div style={{ fontFamily: "Georgia,serif", fontSize: 14, lineHeight: 1.85, color: "#3a3530", background: "#faf9f7", padding: "18px 20px", borderRadius: 8, border: "1px solid #e8e3dc", marginBottom: 20 }}>
                {selected?.idea || <span style={{ color: "#aaa", fontStyle: "italic" }}>No description provided.</span>}
              </div>

              {selected?.qaThread?.filter(m => m.content !== "APPROVED").length > 0 && (
                <>
                  <ST>Intake Q&A</ST>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                    {selected.qaThread.filter(m => m.content !== "APPROVED").map((msg, i) => (
                      <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", flexDirection: msg.role === "assistant" ? "row" : "row-reverse" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flexShrink: 0 }}>
                          <div style={{ width: 32, height: 32, borderRadius: "50%", background: msg.role === "assistant" ? "#0c2340" : "#c8a850", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>
                            {msg.role === "assistant" ? "🏥" : "👤"}
                          </div>
                          <span style={{ fontFamily: "sans-serif", fontSize: 9, fontWeight: 700, color: msg.role === "assistant" ? "#0c2340" : "#8a7050", letterSpacing: 0.5, textTransform: "uppercase", whiteSpace: "nowrap" }}>
                            {msg.role === "assistant" ? "PVS Agent" : (selected?.submittedBy?.trim() || "Investigator")}
                          </span>
                        </div>
                        <div style={{ maxWidth: "82%", padding: "11px 15px", borderRadius: 10, background: msg.role === "assistant" ? "#eef4fa" : "#fff8ed", border: msg.role === "assistant" ? "1px solid #c3d9f7" : "1px solid #e8c870", fontFamily: "sans-serif", fontSize: 13, lineHeight: 1.65, color: "#1a1814", whiteSpace: "pre-wrap" }}>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {selected?.attachments?.length > 0 && (
                <>
                  <ST>Documents from Investigator ({selected.attachments.length})</ST>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                    {selected.attachments.map((f, i) => {
                      const ext = f.name.split(".").pop().toLowerCase();
                      const icon = ext === "pdf" ? "📄" : ["doc","docx"].includes(ext) ? "📝" : ["ppt","pptx"].includes(ext) ? "📊" : ["png","jpg","jpeg"].includes(ext) ? "🖼️" : "📎";
                      const sizeStr = f.size < 1024*1024 ? (f.size/1024).toFixed(1)+" KB" : (f.size/(1024*1024)).toFixed(1)+" MB";
                      return (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#f5f2ee", borderRadius: 8, border: "1px solid #e8e3dc" }}>
                          <span style={{ fontSize: 20 }}>{icon}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontFamily: "sans-serif", fontSize: 13, fontWeight: 600, color: "#1a1814" }}>{f.name}</div>
                            <div style={{ fontFamily: "monospace", fontSize: 10, color: "#aaa" }}>{sizeStr}</div>
                          </div>
                          <a href={`data:${f.mediaType};base64,${f.base64}`} download={f.name}
                            style={{ fontFamily: "sans-serif", fontSize: 11, fontWeight: 600, color: "#0c2340", background: "#e3f0fc", padding: "4px 12px", borderRadius: 6, textDecoration: "none" }}>
                            ⬇ Download
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              <ST>Committee Reference Documents (Optional)</ST>
              <FileUploader
                files={committeeFiles}
                onAdd={f => setCommitteeFiles(prev => [...prev, f])}
                onRemove={i => setCommitteeFiles(prev => prev.filter((_,idx) => idx !== i))}
                label=""
                hint="Upload additional context for the AI analysis — clinical guidelines, competitive data, prior art, or internal notes."
              />
            </Card>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
              <button onClick={() => setReviewStep(2)}
                style={{ background: "#0c2340", color: "white", border: "none", borderRadius: 8, padding: "13px 32px", fontFamily: "sans-serif", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                Submission reviewed — Rate the Team →
              </button>
            </div>
          </>
        )}

        {/* ─── STEP 2: TEAM ASSESSMENT ─── */}
        {reviewStep === 2 && (
          <>
            <Card>
              <ST>Team Strength Assessment</ST>
              <p style={{ fontFamily: "sans-serif", fontSize: 13, color: "#6b6458", lineHeight: 1.65, marginBottom: 24 }}>
                Rate the team across 5 criteria. Scores are averaged into the Team Strength score, which carries <strong>{piWeightPct}%</strong> of the final pre-selection decision.
                {computedTeamScore !== null && (
                  <span style={{ marginLeft: 10, fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: "#0c2340", background: "#eef4fa", padding: "3px 12px", borderRadius: 6 }}>
                    Current avg: {computedTeamScore} / 5
                  </span>
                )}
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {[
                  { key: "expertise",         icon: "🩺", label: "Clinical Expertise",              desc: "Depth of hands-on clinical experience in this specific disease area or procedure." },
                  { key: "commercialization", icon: "🚀", label: "Commercialization Track Record",   desc: "Prior experience bringing medical innovations to market — patents, spin-outs, industry partnerships." },
                  { key: "institutional",     icon: "🏛️",  label: "Institutional Support",            desc: "Departmental backing, protected time, access to lab resources, and administrative commitment." },
                  { key: "completeness",      icon: "👥", label: "Team Completeness",               desc: "Key roles assembled: clinical lead, engineering, regulatory affairs, business development." },
                  { key: "commitment",        icon: "⚡", label: "Commitment & Readiness",          desc: "Demonstrated urgency, realistic timeline, and active engagement with the Venture Studio process." },
                ].map(criterion => (
                  <div key={criterion.key} style={{ padding: "18px 20px", background: teamRatings[criterion.key] ? "#faf9f7" : "white", borderRadius: 10, border: teamRatings[criterion.key] ? "1.5px solid #b3dfc4" : "1.5px solid #e8e3dc", transition: "all 0.2s" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
                      <span style={{ fontSize: 22, marginTop: 1 }}>{criterion.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontFamily: "sans-serif", fontWeight: 700, fontSize: 15, color: "#1a1814" }}>{criterion.label}</span>
                          {teamRatings[criterion.key] && (
                            <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: teamRatings[criterion.key] >= 4 ? "#00875a" : teamRatings[criterion.key] === 3 ? "#b76e00" : "#c0392b", background: teamRatings[criterion.key] >= 4 ? "#e3f5ec" : teamRatings[criterion.key] === 3 ? "#fff4e0" : "#fdeef0", padding: "2px 8px", borderRadius: 4 }}>
                              {["","Insufficient","Weak","Moderate","Strong","Exceptional"][teamRatings[criterion.key]]} ({teamRatings[criterion.key]}/5)
                            </span>
                          )}
                        </div>
                        <div style={{ fontFamily: "sans-serif", fontSize: 12, color: "#888", lineHeight: 1.5, marginTop: 3 }}>{criterion.desc}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      {[{score:1,label:"Insufficient"},{score:2,label:"Weak"},{score:3,label:"Moderate"},{score:4,label:"Strong"},{score:5,label:"Exceptional"}].map(opt => {
                        const sel = teamRatings[criterion.key] === opt.score;
                        const color = opt.score >= 4 ? "#00875a" : opt.score === 3 ? "#b76e00" : "#c0392b";
                        return (
                          <button key={opt.score}
                            onClick={() => setTeamRatings(r => ({ ...r, [criterion.key]: sel ? null : opt.score }))}
                            style={{ flex: 1, padding: "10px 4px", borderRadius: 8, cursor: "pointer", transition: "all 0.15s", background: sel ? color : "#f5f2ee", border: sel ? "2px solid "+color : "2px solid transparent", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                            <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 18, color: sel ? "white" : "#aaa" }}>{opt.score}</span>
                            <span style={{ fontFamily: "sans-serif", fontSize: 9, fontWeight: 700, color: sel ? "white" : "#bbb", letterSpacing: 0.5, textTransform: "uppercase" }}>{opt.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {ratedValues.length > 0 && (
                <div style={{ marginTop: 20, padding: "14px 18px", background: "#f5f2ee", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: "sans-serif", fontSize: 13, color: ratedValues.length < 5 ? "#b76e00" : "#00875a", fontWeight: 600 }}>
                    {ratedValues.length < 5 ? `${ratedValues.length}/5 criteria rated — rate all 5 to continue` : "✓ All 5 criteria rated"}
                  </span>
                  <span style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: computedTeamScore >= 4 ? "#00875a" : computedTeamScore >= 3 ? "#b76e00" : "#c0392b" }}>{computedTeamScore} / 5</span>
                </div>
              )}
            </Card>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <button onClick={() => setReviewStep(1)} style={{ background: "#e8e3dc", color: "#555", border: "none", borderRadius: 8, padding: "12px 24px", fontFamily: "sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
                ← Back
              </button>
              <button onClick={() => setReviewStep(3)} disabled={!teamComplete}
                style={{ background: !teamComplete ? "#c0bbb4" : "#0c2340", color: "white", border: "none", borderRadius: 8, padding: "13px 32px", fontFamily: "sans-serif", fontWeight: 700, fontSize: 14, cursor: !teamComplete ? "not-allowed" : "pointer" }}>
                Team rated — Generate Report →
              </button>
            </div>
          </>
        )}

        {/* ─── STEP 3: REPORT ─── */}
        {reviewStep === 3 && (
          <>
            {!report ? (
              <Card>
                <ST>Generate Pre-Selection Report</ST>
                <p style={{ fontFamily: "sans-serif", fontSize: 13, color: "#6b6458", lineHeight: 1.65, marginBottom: 20 }}>
                  The AI will search the web across 7 domains, synthesize the evidence, and produce a scored evaluation report. This takes 1–3 minutes.
                </p>

                {/* Summary of previous steps */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
                  <div style={{ background: "#f5f2ee", borderRadius: 8, padding: "14px 16px" }}>
                    <div style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#8a7f74", marginBottom: 8 }}>Submission</div>
                    <div style={{ fontFamily: "sans-serif", fontSize: 13, fontWeight: 600, color: "#0c2340" }}>{selected?.submittedBy}</div>
                    <div style={{ fontFamily: "sans-serif", fontSize: 12, color: "#888" }}>{selected?.department}</div>
                    {selected?.qaThread?.filter(m => m.content !== "APPROVED").length > 0 && (
                      <div style={{ fontFamily: "sans-serif", fontSize: 11, color: "#2563a8", marginTop: 4 }}>
                        {Math.ceil(selected.qaThread.filter(m => m.content !== "APPROVED").length / 2)} Q&A rounds completed
                      </div>
                    )}
                  </div>
                  <div style={{ background: "#f5f2ee", borderRadius: 8, padding: "14px 16px" }}>
                    <div style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#8a7f74", marginBottom: 8 }}>Team Score</div>
                    <div style={{ fontFamily: "monospace", fontSize: 28, fontWeight: 700, color: computedTeamScore >= 4 ? "#00875a" : computedTeamScore >= 3 ? "#b76e00" : "#c0392b" }}>{computedTeamScore} / 5</div>
                    <div style={{ fontFamily: "sans-serif", fontSize: 11, color: "#888", marginTop: 3 }}>Avg of 5 team criteria · {piWeightPct}% weight</div>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
                  <button onClick={() => setReviewStep(2)} style={{ background: "#e8e3dc", color: "#555", border: "none", borderRadius: 8, padding: "12px 24px", fontFamily: "sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
                    ← Edit Team Scores
                  </button>
                  <button onClick={handleRunAnalysis} disabled={loading || !weightsValid}
                    style={{ background: loading || !weightsValid ? "#c0bbb4" : "#0c2340", color: "white", border: "none", borderRadius: 8, padding: "14px 36px", fontFamily: "sans-serif", fontWeight: 700, fontSize: 15, cursor: loading || !weightsValid ? "not-allowed" : "pointer" }}>
                    {loading ? "Screening in progress…" : "🔬 Generate Pre-Selection Report →"}
                  </button>
                </div>

                {error && <p style={{ color: "#c0392b", fontFamily: "sans-serif", fontSize: 13, marginTop: 14 }}>⚠ {error}</p>}

                {loading && (
                  <div style={{ marginTop: 20, padding: "22px 24px", background: "#0c2340", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)" }}>
                    {/* Header row */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {/* Animated spinner dot */}
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#c8a850", animation: "pulse-bar 1.2s ease-in-out infinite" }} />
                        <div style={{ fontFamily: "sans-serif", fontSize: 13, fontWeight: 600, color: "white" }}>
                          {activityLog.length > 0 ? activityLog[activityLog.length - 1].text : "Initializing…"}
                        </div>
                      </div>
                      <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: "#c8a850" }}>
                        {analysisProgress}%
                      </div>
                    </div>

                    {/* Progress bar with shimmer */}
                    <div style={{ height: 8, background: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden", marginBottom: 18, position: "relative" }}>
                      <div style={{ position: "absolute", inset: 0, width: analysisProgress + "%", background: "linear-gradient(90deg, #1a5276, #c8a850)", borderRadius: 4, transition: "width 1.2s ease" }} />
                      {/* Shimmer sweep — always animating while loading */}
                      <div style={{ position: "absolute", top: 0, left: 0, width: "40%", height: "100%", background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)", animation: "shimmer 2s ease-in-out infinite", borderRadius: 4 }} />
                    </div>

                    {/* Stage list */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      {activityLog.slice(-5).map((ev, i, arr) => {
                        const isLatest = i === arr.length - 1;
                        return (
                          <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", opacity: isLatest ? 1 : 0.35, transition: "opacity 0.4s" }}>
                            <span style={{ fontSize: 12, flexShrink: 0 }}>
                              {ev.type === "search" ? "🔍" : ev.type === "compile" ? "📝" : ev.type === "done" ? "✅" : ev.type === "start" ? "🚀" : "▸"}
                            </span>
                            <span style={{ fontFamily: "sans-serif", fontSize: 12, color: isLatest ? "#e8f0f8" : "#5a8aaa", fontWeight: isLatest ? 600 : 400 }}>
                              {ev.text}
                            </span>
                            {isLatest && ev.pct !== undefined && (
                              <span style={{ fontFamily: "monospace", fontSize: 10, color: "#c8a850", marginLeft: "auto" }}>{ev.pct}%</span>
                            )}
                          </div>
                        );
                      })}
                      {/* Blinking cursor to show it's alive */}
                      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 2 }}>
                        <span style={{ width: 12, height: 12, borderRadius: "50%", border: "1.5px solid #c8a850", animation: "pulse-bar 1s ease-in-out infinite", flexShrink: 0 }} />
                        <span style={{ fontFamily: "monospace", fontSize: 11, color: "#5a8aaa" }}>Processing — this may take 1–3 minutes</span>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            ) : vCfg && (() => {
              const CRITERIA = [
                { key: "unmet_need", label: "Unmet Clinical Need", icon: "🩺" },
                { key: "pediatric_specificity", label: "Pediatric Specificity", icon: "👶" },
                { key: "innovation", label: "Innovation & Novelty", icon: "💡" },
                { key: "technical_feasibility", label: "Technical Feasibility", icon: "⚙️" },
                { key: "regulatory_pathway", label: "Regulatory Pathway", icon: "📋" },
                { key: "market_impact", label: "Market & Patient Impact", icon: "📈" },
                { key: "bch_fit", label: "BCH Strategic Fit", icon: "🏥" },
              ];
              return (
              <>
                {/* Cover */}
                <div style={{ background: "#0c2340", borderRadius: 12, padding: "40px 44px", marginBottom: 20, color: "white" }}>
                  <div style={{ fontFamily: "sans-serif", fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#7aaac8", marginBottom: 12 }}>Pre-Selection Screening · Confidential</div>
                  <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.3, marginBottom: 8 }}>Boston Children's Hospital<br/>& The Pediatric Venture Studio</div>
                  <div style={{ fontSize: 15, color: "#c8dae8", marginBottom: 28 }}>Clinical Device Idea Pre-Selection Report</div>
                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 24 }}>
                    <Meta label="Investigator" value={selected?.submittedBy || "—"} />
                    <Meta label="Department" value={selected?.department || "—"} />
                    <Meta label="Date" value={date} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px 22px", border: "1px solid rgba(255,255,255,0.12)" }}>
                      <div style={{ fontFamily: "sans-serif", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#7aaac8", marginBottom: 4 }}>Idea Score</div>
                      <div style={{ fontFamily: "monospace", fontSize: 46, fontWeight: 700, color: "#c8dae8", lineHeight: 1 }}>{ideaWeightedTotal}</div>
                      <div style={{ fontFamily: "sans-serif", fontSize: 10, color: "#5a7fa0", marginTop: 3 }}>{100-piWeightPct}% weight</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "rgba(200,168,80,0.12)", borderRadius: 12, padding: "14px 22px", border: "1px solid rgba(200,168,80,0.4)" }}>
                      <div style={{ fontFamily: "sans-serif", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#7aaac8", marginBottom: 4 }}>Team Score</div>
                      <div style={{ fontFamily: "monospace", fontSize: 46, fontWeight: 700, color: "#c8a850", lineHeight: 1 }}>{computedTeamScore}</div>
                      <div style={{ fontFamily: "sans-serif", fontSize: 10, color: "#5a7fa0", marginTop: 3 }}>{piWeightPct}% weight</div>
                    </div>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 24 }}>→</div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: vCfg.bg, borderRadius: 12, padding: "14px 22px", border: "2px solid "+vCfg.color }}>
                      <div style={{ fontFamily: "sans-serif", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: vCfg.color, marginBottom: 4 }}>Final Score</div>
                      <div style={{ fontFamily: "monospace", fontSize: 46, fontWeight: 700, color: vCfg.color, lineHeight: 1 }}>{adjustedTotal}</div>
                      <div style={{ fontFamily: "sans-serif", fontSize: 9, color: vCfg.color, marginTop: 3, opacity: 0.7 }}>idea×{100-piWeightPct}% + team×{piWeightPct}%</div>
                    </div>
                    <div style={{ width: 1, height: 80, background: "rgba(255,255,255,0.12)" }} />
                    <div>
                      <div style={{ fontFamily: "sans-serif", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#7aaac8", marginBottom: 8 }}>Pre-Selection Decision</div>
                      <div style={{ background: vCfg.bg, border: "2px solid "+vCfg.color, borderRadius: 10, padding: "12px 24px", display: "inline-block" }}>
                        <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 22, color: vCfg.color, letterSpacing: 2 }}>{finalVerdict}</div>
                        <div style={{ fontFamily: "sans-serif", fontSize: 11, color: vCfg.color, marginTop: 4 }}>{vCfg.sub}</div>
                        <div style={{ fontFamily: "monospace", fontSize: 10, color: vCfg.color, marginTop: 3, opacity: 0.6 }}>{vCfg.threshold}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Executive Summary */}
                <Card>
                  <ST>Executive Summary</ST>
                  <div style={{ fontSize: 15, lineHeight: 1.8, marginBottom: 20 }}>{report.summary}</div>
                  <div style={{ background: "#f5f2ee", borderRadius: 8, padding: "16px 20px", marginBottom: 20 }}>
                    <div style={{ fontFamily: "sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#888", marginBottom: 8 }}>Verdict Rationale</div>
                    <div style={{ fontFamily: "sans-serif", fontSize: 14, lineHeight: 1.7 }}>{report.verdict_rationale}</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div style={{ background: "#e3f5ec", borderRadius: 8, padding: 18 }}>
                      <div style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#00875a", marginBottom: 10 }}>Key Strengths</div>
                      {(report.key_strengths||[]).map((s,i) => <div key={i} style={{ display: "flex", gap: 8, marginBottom: 7 }}><span style={{ color: "#00875a" }}>✓</span><span style={{ fontFamily: "sans-serif", fontSize: 13, color: "#1a4a35", lineHeight: 1.5 }}>{s}</span></div>)}
                    </div>
                    <div style={{ background: "#fdeef0", borderRadius: 8, padding: 18 }}>
                      <div style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#c0392b", marginBottom: 10 }}>Key Concerns</div>
                      {(report.key_concerns||[]).map((c,i) => <div key={i} style={{ display: "flex", gap: 8, marginBottom: 7 }}><span style={{ color: "#c0392b" }}>!</span><span style={{ fontFamily: "sans-serif", fontSize: 13, color: "#4a1a1a", lineHeight: 1.5 }}>{c}</span></div>)}
                    </div>
                  </div>
                  {report.recommended_next_steps && <div style={{ marginTop: 14, borderLeft: "3px solid #c8a850", paddingLeft: 14 }}><span style={{ fontFamily: "sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#b76e00" }}>Next Steps: </span><span style={{ fontFamily: "sans-serif", fontSize: 13, color: "#555" }}>{report.recommended_next_steps}</span></div>}
                </Card>

                {/* Impact */}
                <Card>
                  <ST>Patient Impact Analysis</ST>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", background: "#0c2340", borderRadius: 10 }}>
                      <div style={{ fontFamily: "sans-serif", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#7aaac8", width: 140, flexShrink: 0 }}>Annual US Cases</div>
                      <div style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700, color: "white" }}>{report.market_and_epidemiology?.annual_us_cases || "—"}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", background: "#0c2340", borderRadius: 10 }}>
                      <div style={{ fontFamily: "sans-serif", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#7aaac8", width: 140, flexShrink: 0 }}>Market Size Estimate</div>
                      <div style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700, color: "#c8a850" }}>{report.market_and_epidemiology?.market_size_estimate || "—"}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 16, padding: "14px 18px", background: "#f5f2ee", borderRadius: 10, border: "1px solid #e8e3dc" }}>
                      <div style={{ fontFamily: "sans-serif", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#8a7f74", width: 140, flexShrink: 0, paddingTop: 2 }}>Global Opportunity</div>
                      <div style={{ fontFamily: "sans-serif", fontSize: 14, color: "#3a3530", lineHeight: 1.6 }}>{report.market_and_epidemiology?.global_opportunity || "—"}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 16, padding: "14px 18px", background: "#f5f2ee", borderRadius: 10, border: "1px solid #e8e3dc" }}>
                      <div style={{ fontFamily: "sans-serif", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#8a7f74", width: 140, flexShrink: 0, paddingTop: 2 }}>Patient Population</div>
                      <div style={{ fontFamily: "sans-serif", fontSize: 14, color: "#3a3530", lineHeight: 1.75 }}>{report.market_and_epidemiology?.patient_population}</div>
                    </div>
                  </div>
                </Card>

                {/* Criteria */}
                <Card>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, paddingBottom: 8, borderBottom: "1px solid #e8e3dc" }}>
                    <div style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2.5, textTransform: "uppercase", color: "#8a7f74" }}>Criteria Scoring</div>
                    <button onClick={() => setWeightsOpen(o => !o)} style={{ fontFamily: "sans-serif", fontSize: 11, fontWeight: 600, color: "#0c2340", background: "#eef4fa", border: "1.5px solid #c3d9f7", borderRadius: 6, padding: "4px 12px", cursor: "pointer" }}>⚖️ {weightsOpen ? "Hide" : "Edit"} Weights</button>
                  </div>
                  {weightsOpen && (
                    <div style={{ background: "#f5f2ee", borderRadius: 8, padding: "16px 18px", marginBottom: 18, border: "1px solid #e0dbd4" }}>
                      <div style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#8a7f74", marginBottom: 12 }}>
                        Adjust weights — must sum to 100%
                        <span style={{ marginLeft: 10, fontFamily: "monospace", fontSize: 11, color: weightsValid ? "#00875a" : "#c0392b", background: weightsValid ? "#e3f5ec" : "#fdeef0", padding: "2px 8px", borderRadius: 4 }}>{weightSum}%</span>
                      </div>
                      {CRITERIA.map(c => (
                        <div key={c.key} style={{ display: "grid", gridTemplateColumns: "20px 1fr 80px", gap: 10, alignItems: "center", marginBottom: 10 }}>
                          <span style={{ fontSize: 14 }}>{c.icon}</span>
                          <div>
                            <div style={{ fontFamily: "sans-serif", fontSize: 12, fontWeight: 600, color: "#1a1814", marginBottom: 2 }}>{c.label}</div>
                            <input type="range" min="0" max="60" value={weights[c.key]} onChange={e => setWeight(c.key, e.target.value)} style={{ width: "100%", accentColor: "#0c2340", cursor: "pointer" }} />
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <input type="number" min="0" max="100" value={weights[c.key]} onChange={e => setWeight(c.key, e.target.value)} style={{ width: 44, padding: "4px 6px", border: "1.5px solid #ddd8d0", borderRadius: 6, fontFamily: "monospace", fontSize: 13, fontWeight: 700, textAlign: "center", outline: "none", background: "white" }} />
                            <span style={{ fontFamily: "monospace", fontSize: 12, color: "#888" }}>%</span>
                          </div>
                        </div>
                      ))}
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, alignItems: "center" }}>
                        <span style={{ fontFamily: "sans-serif", fontSize: 11, color: "#888" }}>Recalculated: <strong style={{ fontFamily: "monospace", color: "#0c2340" }}>{ideaWeightedTotal ?? "—"}</strong></span>
                        <button onClick={resetWeights} style={{ background: "none", border: "1.5px solid #ddd8d0", borderRadius: 6, padding: "5px 12px", fontFamily: "sans-serif", fontSize: 11, color: "#888", cursor: "pointer" }}>↺ Reset</button>
                      </div>
                    </div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                    {CRITERIA.map(c => {
                      const s = report.scores?.[c.key];
                      if (!s) return null;
                      const changed = weights[c.key] !== DEFAULT_WEIGHTS[c.key];
                      const color = s.score >= 4 ? "#00875a" : s.score >= 3 ? "#b76e00" : "#c0392b";
                      return (
                        <div key={c.key}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <span>{c.icon}</span>
                            <span style={{ fontFamily: "sans-serif", fontWeight: 600, fontSize: 14 }}>{c.label}</span>
                            <span style={{ fontFamily: "monospace", fontSize: 10, color: changed ? "#b76e00" : "#bbb", background: changed ? "#fff4e0" : "#f0ece6", padding: "2px 7px", borderRadius: 4 }}>{weights[c.key]}%{changed ? ` (was ${DEFAULT_WEIGHTS[c.key]}%)` : ""}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ flex: 1, height: 5, background: "#ece9e4", borderRadius: 3, overflow: "hidden" }}>
                              <div style={{ width: (s.score/5*100)+"%", height: "100%", background: color, borderRadius: 3 }} />
                            </div>
                            <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color, minWidth: 28 }}>{s.score}/5</span>
                          </div>
                          <div style={{ fontFamily: "sans-serif", fontSize: 13, color: "#6b6458", marginTop: 5, lineHeight: 1.55 }}>{s.rationale}</div>
                        </div>
                      );
                    })}
                  </div>
                </Card>

                {/* Clinical landscape */}
                <Card>
                  <ST>Clinical Landscape & Literature</ST>
                  <div style={{ fontFamily: "sans-serif", fontSize: 14, lineHeight: 1.7, marginBottom: 14 }}>{report.clinical_landscape?.problem_summary}</div>
                  <div style={{ fontFamily: "sans-serif", fontSize: 13, color: "#555", lineHeight: 1.65, marginBottom: 18 }}><strong>Standard of Care:</strong> {report.clinical_landscape?.current_standard_of_care}</div>
                  {(report.clinical_landscape?.key_literature||[]).map((l,i) => (
                    <div key={i} style={{ background: "#f5f2ee", borderRadius: 6, padding: "12px 14px", marginBottom: 8 }}>
                      <div style={{ fontFamily: "monospace", fontSize: 11, color: "#0c2340", marginBottom: 4 }}>{l.citation}</div>
                      <div style={{ fontFamily: "sans-serif", fontSize: 13, color: "#444" }}>{l.finding}</div>
                      {l.source_url && <SourceLink url={l.source_url} title={l.source_url} />}
                    </div>
                  ))}
                  {report.clinical_landscape?.evidence_gaps && <div style={{ borderLeft: "3px solid #c8a850", paddingLeft: 14, marginTop: 12 }}><div style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#b76e00", marginBottom: 6 }}>Evidence Gaps</div><div style={{ fontFamily: "sans-serif", fontSize: 13, color: "#555", lineHeight: 1.6 }}>{report.clinical_landscape.evidence_gaps}</div></div>}
                </Card>

                {/* Competitive */}
                <Card>
                  <ST>Competitive Landscape</ST>
                  {(report.competitive_landscape?.existing_devices||[]).map((d,i) => (
                    <div key={i} style={{ background: "#f5f2ee", borderRadius: 6, padding: "12px 14px", marginBottom: 10 }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontFamily: "monospace", fontSize: 10, background: "#e0dbd4", color: "#555", padding: "2px 8px", borderRadius: 3 }}>{d.status}</span>
                        <span style={{ fontFamily: "sans-serif", fontWeight: 600, fontSize: 14 }}>{d.name}</span>
                      </div>
                      <div style={{ fontFamily: "sans-serif", fontSize: 13, color: "#666" }}>{d.limitation}</div>
                      {d.source_url && <SourceLink url={d.source_url} title={d.source_url} />}
                    </div>
                  ))}
                  <div style={{ borderLeft: "3px solid #0c2340", paddingLeft: 14, marginTop: 8 }}>
                    <div style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#0c2340", marginBottom: 6 }}>White Space Opportunity</div>
                    <div style={{ fontFamily: "sans-serif", fontSize: 14, color: "#333", lineHeight: 1.65 }}>{report.competitive_landscape?.white_space}</div>
                  </div>
                </Card>

                {/* FTO */}
                <Card>
                  <ST>Freedom to Operate</ST>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                    <span style={{ fontFamily: "sans-serif", fontSize: 13, fontWeight: 600 }}>FTO Risk:</span>
                    <RiskBadge level={report.freedom_to_operate?.fto_risk} />
                  </div>
                  <div style={{ fontFamily: "sans-serif", fontSize: 14, lineHeight: 1.7, marginBottom: 14 }}>{report.freedom_to_operate?.landscape_summary}</div>
                  {(report.freedom_to_operate?.key_patents||[]).map((p,i) => (
                    <div key={i} style={{ background: "#f5f2ee", borderRadius: 6, padding: "10px 14px", marginBottom: 8 }}>
                      <span style={{ fontFamily: "monospace", fontSize: 11, color: "#0c2340" }}>{p.identifier}</span>
                      <span style={{ fontFamily: "sans-serif", fontSize: 13, color: "#555", marginLeft: 10 }}>{p.relevance}</span>
                    </div>
                  ))}
                  <div style={{ fontFamily: "sans-serif", fontSize: 13, color: "#666", lineHeight: 1.6, fontStyle: "italic" }}>{report.freedom_to_operate?.fto_commentary}</div>
                </Card>

                {/* Regulatory */}
                <Card>
                  <ST>Regulatory Analysis</ST>
                  <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
                    <div style={{ background: "#e3f0fc", color: "#0c4a8a", fontFamily: "monospace", fontWeight: 700, fontSize: 13, padding: "6px 16px", borderRadius: 6 }}>{report.regulatory_analysis?.recommended_pathway}</div>
                    <div style={{ fontFamily: "sans-serif", fontSize: 12, color: "#888" }}>Timeline: <strong>{report.regulatory_analysis?.estimated_timeline}</strong></div>
                  </div>
                  <div style={{ fontFamily: "sans-serif", fontSize: 14, lineHeight: 1.7, marginBottom: 14 }}>{report.regulatory_analysis?.pathway_rationale}</div>
                  {(report.regulatory_analysis?.predicate_devices||[]).length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#999", marginBottom: 8 }}>Predicate Devices</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {report.regulatory_analysis.predicate_devices.map((p,i) => <span key={i} style={{ fontFamily: "monospace", fontSize: 12, background: "#f5f2ee", padding: "4px 10px", borderRadius: 4 }}>{p}</span>)}
                      </div>
                    </div>
                  )}
                  <div style={{ fontFamily: "sans-serif", fontSize: 13, color: "#666", fontStyle: "italic", lineHeight: 1.6 }}>{report.regulatory_analysis?.key_regulatory_risks}</div>
                </Card>

                {/* Reimbursement */}
                <Card>
                  <ST>Reimbursement Landscape</ST>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                    <span style={{ fontFamily: "sans-serif", fontSize: 13, fontWeight: 600 }}>Reimbursement Risk:</span>
                    <RiskBadge level={report.reimbursement_landscape?.reimbursement_risk} />
                  </div>
                  <div style={{ fontFamily: "sans-serif", fontSize: 14, lineHeight: 1.7, marginBottom: 14 }}>{report.reimbursement_landscape?.payer_landscape}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    {(report.reimbursement_landscape?.relevant_cpt_codes||[]).length > 0 && <div><div style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#999", marginBottom: 8 }}>CPT Codes</div>{report.reimbursement_landscape.relevant_cpt_codes.map((c,i) => <div key={i} style={{ fontFamily: "monospace", fontSize: 12, background: "#f5f2ee", padding: "5px 10px", borderRadius: 4, marginBottom: 5 }}>{c}</div>)}</div>}
                    {(report.reimbursement_landscape?.relevant_drg_codes||[]).length > 0 && <div><div style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#999", marginBottom: 8 }}>DRG Codes</div>{report.reimbursement_landscape.relevant_drg_codes.map((c,i) => <div key={i} style={{ fontFamily: "monospace", fontSize: 12, background: "#f5f2ee", padding: "5px 10px", borderRadius: 4, marginBottom: 5 }}>{c}</div>)}</div>}
                  </div>
                </Card>

                {/* Strategic fit */}
                <Card>
                  <ST>BCH Strategic Fit & Recommended Team</ST>
                  <div style={{ fontFamily: "sans-serif", fontSize: 14, lineHeight: 1.7, marginBottom: 14 }}>{report.strategic_fit?.bch_capabilities}</div>
                  <div style={{ fontFamily: "sans-serif", fontSize: 13, color: "#666", lineHeight: 1.6, marginBottom: 16 }}>{report.strategic_fit?.partnership_opportunities}</div>
                  {(report.strategic_fit?.recommended_team||[]).length > 0 && (
                    <div>
                      <div style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#999", marginBottom: 10 }}>Recommended Team Roles</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {report.strategic_fit.recommended_team.map((r,i) => <span key={i} style={{ background: "#e3f0fc", color: "#0c4a8a", fontFamily: "sans-serif", fontSize: 12, fontWeight: 600, padding: "5px 14px", borderRadius: 20 }}>{r}</span>)}
                      </div>
                    </div>
                  )}
                </Card>

                <SourcesPanel sources={report.sources||[]} />
                <div style={{ fontFamily: "sans-serif", fontSize: 11, color: "#aaa", textAlign: "center", padding: "8px 0 24px" }}>
                  BCH Pediatric Venture Studio AI Screening · Advisory only · {date}
                </div>
              </>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}

// ── Root App// ── Root App — role selector ──────────────────────────────────────────────────

export default function App() {
  const [role, setRole] = useState(null); // null | "pi" | "committee"
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);
  const COMMITTEE_PASSWORD = "admin";

  if (role === "pi") return <PIView />;
  if (role === "committee") return <CommitteeApp />;

  return (
    <div style={{ minHeight: "100vh", background: "#0c2340", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 460 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontFamily: "sans-serif", fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: "#7aaac8", marginBottom: 14 }}>Boston Children's Hospital</div>
          <div style={{ fontFamily: "Georgia,serif", fontSize: 26, fontWeight: 700, color: "white", lineHeight: 1.3, marginBottom: 8 }}>Pediatric Venture Studio</div>
          <div style={{ fontFamily: "sans-serif", fontSize: 14, color: "#7aaac8" }}>Device Idea Screening Platform</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 32 }}>
          {/* PI card */}
          <button onClick={() => setRole("pi")}
            style={{ background: "rgba(255,255,255,0.04)", border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: "28px 20px", cursor: "pointer", textAlign: "left", transition: "all 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.borderColor = "#c8a850"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}>
            <div style={{ fontSize: 32, marginBottom: 14 }}>🩺</div>
            <div style={{ fontFamily: "sans-serif", fontWeight: 700, fontSize: 15, color: "white", marginBottom: 8 }}>I'm an Investigator</div>
            <div style={{ fontFamily: "sans-serif", fontSize: 12, color: "#7aaac8", lineHeight: 1.6 }}>Submit your device idea for pre-selection review by the BCH Venture Studio committee.</div>
          </button>

          {/* Committee card */}
          <div style={{ background: "rgba(255,255,255,0.04)", border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: "28px 20px", textAlign: "left" }}>
            <div style={{ fontSize: 32, marginBottom: 14 }}>🏥</div>
            <div style={{ fontFamily: "sans-serif", fontWeight: 700, fontSize: 15, color: "white", marginBottom: 8 }}>Selection Committee</div>
            <div style={{ fontFamily: "sans-serif", fontSize: 12, color: "#7aaac8", lineHeight: 1.6, marginBottom: 14 }}>Review submitted applications and generate AI pre-selection reports.</div>
            <input
              type="password"
              value={pwInput}
              onChange={e => { setPwInput(e.target.value); setPwError(false); }}
              onKeyDown={e => { if (e.key === "Enter") { if (pwInput === COMMITTEE_PASSWORD) { setRole("committee"); } else { setPwError(true); setPwInput(""); } } }}
              placeholder="Committee password"
              style={{ width: "100%", padding: "9px 12px", borderRadius: 7, border: pwError ? "1.5px solid #c0392b" : "1.5px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.07)", color: "white", fontFamily: "sans-serif", fontSize: 13, boxSizing: "border-box", outline: "none", marginBottom: 8 }}
            />
            {pwError && <div style={{ fontFamily: "sans-serif", fontSize: 11, color: "#e07070", marginBottom: 8 }}>Incorrect password.</div>}
            <button onClick={() => { if (pwInput === COMMITTEE_PASSWORD) { setRole("committee"); } else { setPwError(true); setPwInput(""); } }}
              style={{ width: "100%", padding: "9px", background: "#c8a850", color: "#0c2340", border: "none", borderRadius: 7, fontFamily: "sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              Sign In →
            </button>
          </div>
        </div>

        <div style={{ fontFamily: "sans-serif", fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center" }}>
          Boston Children's Hospital · Pediatric Venture Studio · Access restricted to authorized users
        </div>
      </div>
    </div>
  );
}

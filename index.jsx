import { useState, useEffect, useRef } from "react";

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

// Fixed weights — must match WEIGHTS in runAnalysis
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

async function runAnalysis(idea, onEvent) {
  // Single continuous conversation: search first, then synthesize in same context
  // This means the model remembers every URL it visited when writing the final report
  const systemPrompt = `You are a senior medical device evaluator for the Boston Children's Hospital Pediatric Venture Studio.

STEP 1 — RESEARCH: Search the web thoroughly across all 7 areas below. Perform at least 7 separate searches.
1. Clinical burden & epidemiology (incidence, patient population, disease impact)
2. Current standard of care and specific clinical limitations
3. Published peer-reviewed clinical literature (PubMed, journals)
4. Existing competing devices and companies
5. Patent landscape (Google Patents, USPTO)
6. FDA regulatory pathway and predicate devices (FDA 510k database, FDA.gov)
7. Reimbursement: CPT codes, DRG codes, payer coverage policies

STEP 2 — REPORT: After all searches, return ONLY valid JSON. No markdown. No preamble. No commentary.

SCORING RULES — use these exact anchors, no exceptions:
Score 1 = No evidence of this quality. Fundamental gaps that cannot be addressed.
Score 2 = Weak evidence. Significant problems that would likely prevent success.
Score 3 = Moderate evidence. Some gaps but addressable with more work.
Score 4 = Strong evidence. Minor gaps only. Clearly viable path.
Score 5 = Exceptional evidence. Best-in-class for a pre-seed device concept.

DO NOT include "weighted_total" or "verdict" in your JSON — those are computed automatically from your scores.
DO NOT round or adjust scores to reach a particular verdict — score each criterion independently.

SOURCES RULE: In "sources", list every URL you actually retrieved. Copy exact URLs from search results. Do not invent any URL. 8+ sources required.

Return this exact JSON structure:
{
  "summary": "3-4 sentence factual synthesis of the idea and its context based on your research",
  "scores": {
    "unmet_need": {
      "score": 4,
      "rationale": "2 sentences citing specific evidence found. State the clinical gap and what the evidence says about its severity."
    },
    "pediatric_specificity": {
      "score": 4,
      "rationale": "2 sentences. Is this genuinely pediatric-specific or adaptable from adult devices? Cite evidence."
    },
    "innovation": {
      "score": 3,
      "rationale": "2 sentences. What specifically is novel vs existing solutions found in your search?"
    },
    "technical_feasibility": {
      "score": 3,
      "rationale": "2 sentences. What evidence supports or undermines the technical approach?"
    },
    "regulatory_pathway": {
      "score": 3,
      "rationale": "2 sentences. What specific FDA pathway applies and what predicates exist?"
    },
    "market_impact": {
      "score": 3,
      "rationale": "2 sentences. What are the specific patient numbers and market size from your research?"
    },
    "bch_fit": {
      "score": 3,
      "rationale": "2 sentences. What specific BCH capabilities or programs align with this idea?"
    }
  },
  "verdict_rationale": "2-3 sentences explaining the overall assessment.",
  "key_strengths": ["Specific strength with evidence", "Specific strength with evidence", "Specific strength with evidence"],
  "key_concerns": ["Specific concern with evidence", "Specific concern with evidence"],
  "recommended_next_steps": "2 concrete, specific next steps based on findings.",
  "sources": [
    { "url": "https://actual-url.com/page", "title": "Exact title from search result", "context": "What claim this supports" }
  ],
  "clinical_landscape": {
    "problem_summary": "3-4 sentences with specific numbers from research",
    "current_standard_of_care": "2-3 sentences describing current practice and its limitations",
    "key_literature": [
      { "citation": "Author et al., Journal, Year", "finding": "Specific finding from this paper", "source_url": "url or null" }
    ],
    "evidence_gaps": "2-3 sentences on what the literature does NOT yet address"
  },
  "competitive_landscape": {
    "existing_devices": [
      { "name": "Specific device or company name", "status": "marketed", "limitation": "Specific limitation relevant to this idea", "source_url": "url or null" }
    ],
    "white_space": "2-3 sentences on the specific gap this idea could fill"
  },
  "freedom_to_operate": {
    "landscape_summary": "2-3 sentences on what patents exist in this space",
    "key_patents": [
      { "identifier": "US patent number or assignee", "relevance": "Why this patent matters for FTO", "source_url": "url or null" }
    ],
    "fto_risk": "LOW",
    "fto_commentary": "2-3 sentences on overall FTO risk and recommended next step"
  },
  "market_and_epidemiology": {
    "patient_population": "2-3 sentences with specific incidence numbers and sources",
    "annual_us_cases": "~X,XXX/year (Source Name, Year)",
    "global_opportunity": "1-2 sentences with global burden estimate",
    "market_size_estimate": "$XXM–$XXXM (methodology: per-procedure cost × volume)"
  },
  "regulatory_analysis": {
    "recommended_pathway": "510(k)",
    "pathway_rationale": "2-3 sentences explaining why this pathway applies",
    "predicate_devices": ["Specific predicate device name", "Specific predicate device name"],
    "key_regulatory_risks": "2-3 sentences on specific regulatory challenges",
    "estimated_timeline": "X–Y years to clearance"
  },
  "reimbursement_landscape": {
    "relevant_cpt_codes": ["XXXXX: Specific procedure description"],
    "relevant_drg_codes": ["XXX: Specific DRG description"],
    "payer_landscape": "2-3 sentences on current reimbursement coverage and gaps",
    "reimbursement_risk": "MEDIUM",
    "commentary": "1-2 sentences on reimbursement strategy"
  },
  "strategic_fit": {
    "bch_capabilities": "2-3 sentences citing specific BCH departments, labs, or programs",
    "partnership_opportunities": "1-2 sentences on specific industry or academic partners",
    "recommended_team": ["Specific clinical role", "Specific engineering role", "Regulatory Affairs role", "Business Development role"]
  }
}`;

  const messages = [{
    role: "user",
    content: `Evaluate this pediatric device idea. First search the web thoroughly across all relevant areas, then produce the complete JSON evaluation report.

IDEA:
${idea}`
  }];

  const tools = [{ type: "web_search_20250305", name: "web_search" }];
  const SEARCH_LABELS = [
    "Reviewing clinical problem & background",
    "Searching clinical epidemiology & burden data",
    "Scanning peer-reviewed literature (PubMed)",
    "Identifying competing devices & companies",
    "Searching patent landscape (USPTO, Google Patents)",
    "Checking FDA regulatory database & predicates",
    "Reviewing reimbursement codes & payer policies",
    "Cross-referencing findings",
    "Synthesizing evidence into report",
  ];
  let stageIdx = 0;
  let finalText = "";
  onEvent({ type: "start", text: "Initializing pre-selection screening…" });

  for (let i = 0; i < 20; i++) {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 10000,
        temperature: 0,
        system: systemPrompt,
        tools,
        messages
      }),
    });

    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);

    messages.push({ role: "assistant", content: data.content });

    // Grab any text blocks
    const texts = (data.content || []).filter(b => b.type === "text").map(b => b.text);
    if (texts.length) finalText = texts.join("");

    // Advance stage indicator
    stageIdx = Math.min(stageIdx + 1, SEARCH_LABELS.length - 1);
    onEvent({ type: "stage", text: SEARCH_LABELS[stageIdx] });

    if (data.stop_reason === "end_turn") break;

    // Feed tool results back to continue
    const toolUses = (data.content || []).filter(b => b.type === "tool_use");
    if (!toolUses.length) break;
    toolUses.forEach(b => {
      const query = b.input && b.input.query ? b.input.query : "web search";
      onEvent({ type: "search", text: query });
    });
    messages.push({
      role: "user",
      content: toolUses.map(b => ({ type: "tool_result", tool_use_id: b.id, content: "Search completed successfully." }))
    });
  }

  onEvent({ type: "compile", text: "All searches complete — compiling evaluation report…" });

  if (!finalText) throw new Error("No response received. Please try again.");
  const report = safeParseJSON(finalText);

  // Ensure sources is always an array
  if (!Array.isArray(report.sources)) report.sources = [];
  const seen = new Set();
  report.sources = report.sources.filter(s => {
    if (!s || !s.url || !s.url.startsWith("http") || seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });

  // ── DETERMINISTIC: compute weighted_total from scores in code, never trust model ──
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

  // ── DETERMINISTIC: compute verdict from weighted_total with hard thresholds ──
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

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);
  const TEAM_PASSWORD = "BCHventures2026";

  const [view, setView] = useState("form");
  const [idea, setIdea] = useState("");
  const [submittedBy, setSubmittedBy] = useState("");
  const [department, setDepartment] = useState("");
  const [loading, setLoading] = useState(false);
  const [activityLog, setActivityLog] = useState([]);
  const [report, setReport] = useState(null);
  const [sources, setSources] = useState([]);
  const [error, setError] = useState(null);
  const [piScore, setPiScore] = useState(null); // 1-5, null = not yet entered

  const wordCount = idea.trim().split(/\s+/).filter(Boolean).length;
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  // PI weight: 15% of final score. Idea = 85%.
  const PI_WEIGHT = 0.15;
  const IDEA_WEIGHT = 0.85;

  const adjustedTotal = (report && piScore !== null)
    ? Math.round((report.weighted_total * IDEA_WEIGHT + piScore * PI_WEIGHT) * 10) / 10
    : report ? report.weighted_total : null;

  const finalVerdict = adjustedTotal !== null
    ? (adjustedTotal >= 3.5 ? "ELIGIBLE" : adjustedTotal >= 2.5 ? "PENDING" : "INELIGIBLE")
    : null;

  const vCfg = finalVerdict ? (VERDICT_CONFIG[finalVerdict] || VERDICT_CONFIG["PENDING"]) : null;

  async function handleSubmit() {
    if (wordCount < 50) return;
    setLoading(true); setError(null); setActivityLog([]);
    try {
      const { report: r, verifiedSources } = await runAnalysis(idea, (ev) => setActivityLog(prev => [...prev, ev]));
      setReport(r);
      setSources(verifiedSources);
      setPiScore(null);
      setView("report");
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  return (
    <div style={{ fontFamily: "Georgia,serif", minHeight: "100vh", background: "#f5f2ee", color: "#1a1814" }}>
      {!authed && (
        <div style={{ position: "fixed", inset: 0, background: "#0c2340", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: "48px 52px", width: "100%", maxWidth: 420, textAlign: "center" }}>
            <div style={{ fontFamily: "sans-serif", fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: "#7aaac8", marginBottom: 16 }}>Boston Children's Hospital</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "white", lineHeight: 1.3, marginBottom: 6 }}>Pediatric Venture Studio</div>
            <div style={{ fontFamily: "sans-serif", fontSize: 13, color: "#7aaac8", marginBottom: 36 }}>Pre-Selection Screening Tool</div>
            <div style={{ marginBottom: 12, textAlign: "left" }}>
              <label style={{ fontFamily: "sans-serif", fontSize: 11, fontWeight: 600, color: "#7aaac8", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 8 }}>Team Password</label>
              <input
                type="password"
                value={pwInput}
                onChange={e => { setPwInput(e.target.value); setPwError(false); }}
                onKeyDown={e => { if (e.key === "Enter") { if (pwInput === TEAM_PASSWORD) { setAuthed(true); } else { setPwError(true); setPwInput(""); } } }}
                placeholder="Enter password"
                autoFocus
                style={{ width: "100%", padding: "12px 16px", borderRadius: 8, border: pwError ? "1.5px solid #c0392b" : "1.5px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.07)", color: "white", fontFamily: "sans-serif", fontSize: 15, boxSizing: "border-box", outline: "none" }}
              />
              {pwError && <div style={{ fontFamily: "sans-serif", fontSize: 12, color: "#e07070", marginTop: 8 }}>Incorrect password. Please try again.</div>}
            </div>
            <button
              onClick={() => { if (pwInput === TEAM_PASSWORD) { setAuthed(true); } else { setPwError(true); setPwInput(""); } }}
              style={{ width: "100%", padding: "13px", background: "#c8a850", color: "#0c2340", border: "none", borderRadius: 8, fontFamily: "sans-serif", fontWeight: 700, fontSize: 14, cursor: "pointer", marginTop: 4 }}>
              Sign In →
            </button>
            <div style={{ fontFamily: "sans-serif", fontSize: 11, color: "rgba(255,255,255,0.2)", marginTop: 28 }}>Access restricted to authorized Venture Studio team members.</div>
          </div>
        </div>
      )}
      <style dangerouslySetInnerHTML={{__html:`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.6); }
        }
        @keyframes pulse-ring {
          0%   { box-shadow: 0 0 0 0 rgba(200,168,80,0.5), 0 0 16px rgba(200,168,80,0.3); }
          70%  { box-shadow: 0 0 0 8px rgba(200,168,80,0), 0 0 16px rgba(200,168,80,0.1); }
          100% { box-shadow: 0 0 0 0 rgba(200,168,80,0), 0 0 16px rgba(200,168,80,0.3); }
        }
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { margin: 1.2cm 1.5cm; size: A4; }
          a { color: #5ba4d4 !important; text-decoration: none; }
          .sources-section { background: #0c2340 !important; color: white !important; border-radius: 8px; padding: 20px; }
          .sources-section a { display: block; color: #3a8fbf !important; font-size: 10px; word-break: break-all; }
        }
        a:hover { text-decoration: underline; }
      `}} />

      {/* HEADER */}
      <div className="no-print" style={{ background: "#0c2340", color: "white", padding: "20px 40px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: "sans-serif", fontSize: 17, fontWeight: 700 }}>Boston Children's Hospital & The Pediatric Venture Studio</div>
          <div style={{ fontFamily: "sans-serif", fontSize: 12, color: "#7aaac8", marginTop: 3 }}>
            {view === "form" ? "AI Pre-Selection Screening Tool" : "Pre-Selection Report"}
          </div>
        </div>
        {view === "report" && (
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => { setView("form"); setReport(null); setSources([]); setError(null); setPiScore(null); }}
              style={{ background: "#1e3a5c", color: "white", border: "none", borderRadius: 6, padding: "8px 16px", fontFamily: "sans-serif", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
              ← New Submission
            </button>
            <button onClick={() => window.print()}
              style={{ background: "#c8a850", color: "#0c2340", border: "none", borderRadius: 6, padding: "8px 16px", fontFamily: "sans-serif", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
              ⬇ Export PDF
            </button>
          </div>
        )}
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "36px 24px" }}>

        {/* ── FORM ── */}
        {view === "form" && (
          <Card>
            <ST>Investigator Details</ST>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
              <Field label="Investigator Name" value={submittedBy} onChange={setSubmittedBy} placeholder="Dr. Jane Smith" />
              <Field label="Department / Division" value={department} onChange={setDepartment} placeholder="e.g. Cardiology, Neonatology" />
            </div>
            <ST>Idea Description (150–250 words)</ST>
            <p style={{ fontFamily: "sans-serif", fontSize: 13, color: "#6b6458", marginBottom: 12, lineHeight: 1.6 }}>
              Describe your clinical device idea — the problem, proposed solution, target population, and why existing solutions fall short.
            </p>
            <textarea value={idea} onChange={e => setIdea(e.target.value)}
              placeholder="Example: In our NICU, infants born with congenital diaphragmatic hernia require precise tidal volume monitoring during high-frequency ventilation. Current adult-derived sensors fail to accurately measure volumes below 5ml..."
              rows={10} style={{ width: "100%", padding: "14px 16px", border: "1.5px solid #ddd8d0", borderRadius: 8, fontFamily: "Georgia,serif", fontSize: 14, lineHeight: 1.75, resize: "vertical", boxSizing: "border-box", outline: "none", background: "#faf9f7", color: "#1a1814" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
              <span style={{ fontFamily: "monospace", fontSize: 12, color: wordCount < 50 ? "#c0392b" : wordCount > 300 ? "#b76e00" : "#00875a" }}>
                {wordCount} words {wordCount < 50 ? "— min 50 required" : wordCount > 300 ? "— consider trimming" : "✓"}
              </span>
              <button onClick={handleSubmit} disabled={loading || wordCount < 50}
                style={{ background: loading || wordCount < 50 ? "#c0bbb4" : "#0c2340", color: "white", border: "none", borderRadius: 8, padding: "13px 30px", fontFamily: "sans-serif", fontWeight: 600, fontSize: 14, cursor: loading || wordCount < 50 ? "not-allowed" : "pointer" }}>
                {loading ? "Screening in progress…" : "Generate Pre-Selection Report →"}
              </button>
            </div>
            <Spinner visible={loading} />
            {error && <p style={{ color: "#c0392b", fontFamily: "sans-serif", fontSize: 13, marginTop: 12 }}>⚠ {error}</p>}
          </Card>
        )}

        {/* ── REPORT ── */}
        {view === "report" && report && vCfg && (
          <>
            {/* Cover */}
            <div style={{ background: "#0c2340", borderRadius: 12, padding: "40px 44px", marginBottom: 20, color: "white" }}>
              <div style={{ fontFamily: "sans-serif", fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#7aaac8", marginBottom: 12 }}>Pre-Selection Screening · Confidential</div>
              <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.3, marginBottom: 8 }}>Boston Children's Hospital<br />& The Pediatric Venture Studio</div>
              <div style={{ fontSize: 15, color: "#c8dae8", marginBottom: 28 }}>Clinical Device Idea Pre-Selection Report</div>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 24 }}>
                <Meta label="Investigator" value={submittedBy || "—"} />
                <Meta label="Department" value={department || "—"} />
                <Meta label="Date" value={date} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                {/* Idea Score */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px 22px", border: "1px solid rgba(255,255,255,0.12)" }}>
                  <div style={{ fontFamily: "sans-serif", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#7aaac8", marginBottom: 4 }}>Idea Score</div>
                  <div style={{ fontFamily: "monospace", fontSize: 46, fontWeight: 700, color: "#c8dae8", lineHeight: 1 }}>{report.weighted_total}</div>
                  <div style={{ fontFamily: "sans-serif", fontSize: 10, color: "#5a7fa0", marginTop: 3 }}>85% weight</div>
                </div>

                {/* PI Strength input */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: piScore !== null ? "rgba(200,168,80,0.12)" : "rgba(255,255,255,0.04)", borderRadius: 12, padding: "14px 22px", border: piScore !== null ? "1px solid rgba(200,168,80,0.4)" : "1.5px dashed rgba(255,255,255,0.25)" }}>
                  <div style={{ fontFamily: "sans-serif", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#7aaac8", marginBottom: 6 }}>PI Strength</div>
                  {piScore === null ? (
                    <>
                      <div style={{ display: "flex", gap: 5, marginBottom: 4 }}>
                        {[1,2,3,4,5].map(n => (
                          <button key={n} onClick={() => setPiScore(n)}
                            style={{ width: 30, height: 30, borderRadius: 6, border: "1.5px solid rgba(200,168,80,0.5)", background: "rgba(200,168,80,0.1)", color: "#c8a850", fontFamily: "monospace", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                            {n}
                          </button>
                        ))}
                      </div>
                      <div style={{ fontFamily: "sans-serif", fontSize: 9, color: "#5a7fa0", marginTop: 2 }}>15% weight</div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontFamily: "monospace", fontSize: 46, fontWeight: 700, color: "#c8a850", lineHeight: 1 }}>{piScore}</div>
                      <button onClick={() => setPiScore(null)} style={{ fontFamily: "sans-serif", fontSize: 9, color: "#7aaac8", background: "none", border: "none", cursor: "pointer", marginTop: 3, textDecoration: "underline" }}>edit</button>
                      <div style={{ fontFamily: "sans-serif", fontSize: 10, color: "#5a7fa0" }}>15% weight</div>
                    </>
                  )}
                </div>

                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 24, fontWeight: 200, padding: "0 4px" }}>→</div>

                {/* Final score */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: piScore !== null && vCfg ? vCfg.bg : "rgba(255,255,255,0.04)", borderRadius: 12, padding: "14px 22px", border: piScore !== null && vCfg ? "2px solid " + vCfg.color : "1px solid rgba(255,255,255,0.1)", transition: "all 0.3s" }}>
                  <div style={{ fontFamily: "sans-serif", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: piScore !== null && vCfg ? vCfg.color : "#7aaac8", marginBottom: 4 }}>Final Score</div>
                  <div style={{ fontFamily: "monospace", fontSize: 46, fontWeight: 700, color: piScore !== null && vCfg ? vCfg.color : "#4a6a80", lineHeight: 1 }}>{adjustedTotal !== null ? adjustedTotal : "—"}</div>
                  <div style={{ fontFamily: "sans-serif", fontSize: 9, color: "#5a7fa0", marginTop: 3 }}>idea × 85% + PI × 15%</div>
                </div>

                <div style={{ width: 1, height: 80, background: "rgba(255,255,255,0.12)", flexShrink: 0 }} />

                {/* Verdict */}
                <div>
                  <div style={{ fontFamily: "sans-serif", fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: "#7aaac8", marginBottom: 8 }}>Pre-Selection Decision</div>
                  <div style={{ background: piScore !== null && vCfg ? vCfg.bg : "rgba(255,255,255,0.04)", border: "2px solid " + (piScore !== null && vCfg ? vCfg.color : "rgba(255,255,255,0.15)"), borderRadius: 10, padding: "12px 24px", display: "inline-block", transition: "all 0.3s" }}>
                    <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 22, color: piScore !== null && vCfg ? vCfg.color : "#4a6a80", letterSpacing: 2 }}>{piScore !== null ? finalVerdict : "PENDING PI"}</div>
                    <div style={{ fontFamily: "sans-serif", fontSize: 11, color: piScore !== null && vCfg ? vCfg.color : "#5a7a90", marginTop: 4 }}>{piScore !== null && vCfg ? vCfg.sub : "Enter PI score above to decide"}</div>
                    {piScore !== null && vCfg && <div style={{ fontFamily: "monospace", fontSize: 10, color: vCfg.color, marginTop: 3, opacity: 0.6 }}>{vCfg.threshold}</div>}
                  </div>
                  {piScore === null && (
                    <div style={{ fontFamily: "sans-serif", fontSize: 11, color: "#c8a850", marginTop: 8, lineHeight: 1.5 }}>
                      ↑ Rate the PI to finalize
                    </div>
                  )}
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
                  {(report.key_strengths || []).map((s, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, marginBottom: 7 }}>
                      <span style={{ color: "#00875a" }}>✓</span>
                      <span style={{ fontFamily: "sans-serif", fontSize: 13, color: "#1a4a35", lineHeight: 1.5 }}>{s}</span>
                    </div>
                  ))}
                </div>
                <div style={{ background: "#fdeef0", borderRadius: 8, padding: 18 }}>
                  <div style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#c0392b", marginBottom: 10 }}>Key Concerns</div>
                  {(report.key_concerns || []).map((c, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, marginBottom: 7 }}>
                      <span style={{ color: "#c0392b" }}>!</span>
                      <span style={{ fontFamily: "sans-serif", fontSize: 13, color: "#4a1a1a", lineHeight: 1.5 }}>{c}</span>
                    </div>
                  ))}
                </div>
              </div>
              {report.recommended_next_steps && (
                <div style={{ marginTop: 14, borderLeft: "3px solid #c8a850", paddingLeft: 14 }}>
                  <span style={{ fontFamily: "sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#b76e00" }}>Recommended Next Steps: </span>
                  <span style={{ fontFamily: "sans-serif", fontSize: 13, color: "#555" }}>{report.recommended_next_steps}</span>
                </div>
              )}
            </Card>

            {/* Scoring */}
            <Card>
              <ST>Criteria Scoring</ST>
              <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
                {[
                  { label: "1 — No evidence", color: "#c0392b" },
                  { label: "2 — Weak", color: "#d4691b" },
                  { label: "3 — Moderate", color: "#b76e00" },
                  { label: "4 — Strong", color: "#5a8a3c" },
                  { label: "5 — Exceptional", color: "#00875a" },
                ].map((s, i) => (
                  <span key={i} style={{ fontFamily: "sans-serif", fontSize: 10, background: "#f5f2ee", color: s.color, fontWeight: 600, padding: "3px 10px", borderRadius: 4, border: "1px solid #e8e3dc" }}>{s.label}</span>
                ))}
                <span style={{ fontFamily: "sans-serif", fontSize: 10, color: "#aaa", padding: "3px 0" }}>· Verdict thresholds: ELIGIBLE ≥ 3.5 · PENDING 2.5–3.4 · INELIGIBLE &lt; 2.5</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                {CRITERIA.map(c => {
                  const s = report.scores && report.scores[c.key];
                  if (!s) return null;
                  return (
                    <div key={c.key}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span>{c.icon}</span>
                        <span style={{ fontFamily: "sans-serif", fontWeight: 600, fontSize: 14 }}>{c.label}</span>
                        <span style={{ fontFamily: "monospace", fontSize: 10, color: "#bbb", background: "#f0ece6", padding: "2px 7px", borderRadius: 4 }}>{c.weight}</span>
                      </div>
                      <ScoreBar score={s.score} />
                      <div style={{ fontFamily: "sans-serif", fontSize: 13, color: "#6b6458", marginTop: 5, lineHeight: 1.55 }}>{s.rationale}</div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Clinical Landscape */}
            <Card>
              <ST>Clinical Landscape & Literature</ST>
              <div style={{ fontFamily: "sans-serif", fontSize: 14, lineHeight: 1.7, marginBottom: 14 }}>{report.clinical_landscape && report.clinical_landscape.problem_summary}</div>
              <div style={{ fontFamily: "sans-serif", fontSize: 13, color: "#555", lineHeight: 1.65, marginBottom: 18 }}>
                <strong>Standard of Care:</strong> {report.clinical_landscape && report.clinical_landscape.current_standard_of_care}
              </div>
              {report.clinical_landscape && (report.clinical_landscape.key_literature || []).length > 0 && (
                <>
                  <div style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#999", marginBottom: 10 }}>Key Literature</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                    {report.clinical_landscape.key_literature.map((l, i) => (
                      <div key={i} style={{ background: "#f5f2ee", borderRadius: 6, padding: "12px 14px" }}>
                        <div style={{ fontFamily: "monospace", fontSize: 11, color: "#0c2340", marginBottom: 4 }}>{l.citation}</div>
                        <div style={{ fontFamily: "sans-serif", fontSize: 13, color: "#444", marginBottom: l.source_url ? 8 : 0 }}>{l.finding}</div>
                        {l.source_url && <SourceLink url={l.source_url} title={l.source_url} />}
                      </div>
                    ))}
                  </div>
                </>
              )}
              {report.clinical_landscape && report.clinical_landscape.evidence_gaps && (
                <div style={{ borderLeft: "3px solid #c8a850", paddingLeft: 14 }}>
                  <div style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#b76e00", marginBottom: 6 }}>Evidence Gaps</div>
                  <div style={{ fontFamily: "sans-serif", fontSize: 13, color: "#555", lineHeight: 1.6 }}>{report.clinical_landscape.evidence_gaps}</div>
                </div>
              )}
            </Card>

            {/* Competitive */}
            <Card>
              <ST>Competitive Landscape</ST>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                {report.competitive_landscape && (report.competitive_landscape.existing_devices || []).map((d, i) => (
                  <div key={i} style={{ background: "#f5f2ee", borderRadius: 6, padding: "12px 14px" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontFamily: "monospace", fontSize: 10, background: "#e0dbd4", color: "#555", padding: "2px 8px", borderRadius: 3, whiteSpace: "nowrap" }}>{d.status}</span>
                      <span style={{ fontFamily: "sans-serif", fontWeight: 600, fontSize: 14 }}>{d.name}</span>
                    </div>
                    <div style={{ fontFamily: "sans-serif", fontSize: 13, color: "#666", marginBottom: d.source_url ? 8 : 0 }}>{d.limitation}</div>
                    {d.source_url && <SourceLink url={d.source_url} title={d.source_url} />}
                  </div>
                ))}
              </div>
              <div style={{ borderLeft: "3px solid #0c2340", paddingLeft: 14 }}>
                <div style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#0c2340", marginBottom: 6 }}>White Space Opportunity</div>
                <div style={{ fontFamily: "sans-serif", fontSize: 14, color: "#333", lineHeight: 1.65 }}>{report.competitive_landscape && report.competitive_landscape.white_space}</div>
              </div>
            </Card>

            {/* FTO */}
            <Card>
              <ST>Freedom to Operate (FTO) Snapshot</ST>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <span style={{ fontFamily: "sans-serif", fontSize: 13, fontWeight: 600 }}>FTO Risk:</span>
                <RiskBadge level={report.freedom_to_operate && report.freedom_to_operate.fto_risk} />
              </div>
              <div style={{ fontFamily: "sans-serif", fontSize: 14, lineHeight: 1.7, marginBottom: 14 }}>{report.freedom_to_operate && report.freedom_to_operate.landscape_summary}</div>
              {report.freedom_to_operate && (report.freedom_to_operate.key_patents || []).length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                  {report.freedom_to_operate.key_patents.map((p, i) => (
                    <div key={i} style={{ background: "#f5f2ee", borderRadius: 6, padding: "10px 14px" }}>
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: p.source_url ? 6 : 0 }}>
                        <span style={{ fontFamily: "monospace", fontSize: 11, color: "#0c2340" }}>{p.identifier}</span>
                        <span style={{ fontFamily: "sans-serif", fontSize: 13, color: "#555" }}>{p.relevance}</span>
                      </div>
                      {p.source_url && <SourceLink url={p.source_url} title={p.source_url} />}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ fontFamily: "sans-serif", fontSize: 13, color: "#666", lineHeight: 1.6, fontStyle: "italic" }}>{report.freedom_to_operate && report.freedom_to_operate.fto_commentary}</div>
            </Card>

            {/* Market */}
            <Card>
              <ST>Market & Epidemiology</ST>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
                <div style={{ background: "#f5f2ee", borderRadius: 8, padding: 16 }}>
                  <div style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#999", marginBottom: 6 }}>Annual US Cases</div>
                  <div style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700, color: "#0c2340" }}>{report.market_and_epidemiology && report.market_and_epidemiology.annual_us_cases}</div>
                </div>
                <div style={{ background: "#f5f2ee", borderRadius: 8, padding: 16 }}>
                  <div style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#999", marginBottom: 6 }}>Market Size Estimate</div>
                  <div style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700, color: "#0c2340" }}>{report.market_and_epidemiology && report.market_and_epidemiology.market_size_estimate}</div>
                </div>
              </div>
              <div style={{ fontFamily: "sans-serif", fontSize: 14, lineHeight: 1.7, marginBottom: 10 }}>{report.market_and_epidemiology && report.market_and_epidemiology.patient_population}</div>
              <div style={{ fontFamily: "sans-serif", fontSize: 13, color: "#666" }}>{report.market_and_epidemiology && report.market_and_epidemiology.global_opportunity}</div>
            </Card>

            {/* Regulatory */}
            <Card>
              <ST>Regulatory Analysis</ST>
              <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
                <div style={{ background: "#e3f0fc", color: "#0c4a8a", fontFamily: "monospace", fontWeight: 700, fontSize: 13, padding: "6px 16px", borderRadius: 6, letterSpacing: 1 }}>
                  {report.regulatory_analysis && report.regulatory_analysis.recommended_pathway}
                </div>
                <div style={{ fontFamily: "sans-serif", fontSize: 12, color: "#888" }}>
                  Timeline: <strong>{report.regulatory_analysis && report.regulatory_analysis.estimated_timeline}</strong>
                </div>
              </div>
              <div style={{ fontFamily: "sans-serif", fontSize: 14, lineHeight: 1.7, marginBottom: 14 }}>{report.regulatory_analysis && report.regulatory_analysis.pathway_rationale}</div>
              {report.regulatory_analysis && (report.regulatory_analysis.predicate_devices || []).length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#999", marginBottom: 8 }}>Predicate Devices</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {report.regulatory_analysis.predicate_devices.map((p, i) => (
                      <span key={i} style={{ fontFamily: "monospace", fontSize: 12, background: "#f5f2ee", padding: "4px 10px", borderRadius: 4 }}>{p}</span>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ fontFamily: "sans-serif", fontSize: 13, color: "#666", fontStyle: "italic", lineHeight: 1.6 }}>{report.regulatory_analysis && report.regulatory_analysis.key_regulatory_risks}</div>
            </Card>

            {/* Reimbursement */}
            <Card>
              <ST>Reimbursement Landscape</ST>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <span style={{ fontFamily: "sans-serif", fontSize: 13, fontWeight: 600 }}>Reimbursement Risk:</span>
                <RiskBadge level={report.reimbursement_landscape && report.reimbursement_landscape.reimbursement_risk} />
              </div>
              <div style={{ fontFamily: "sans-serif", fontSize: 14, lineHeight: 1.7, marginBottom: 14 }}>{report.reimbursement_landscape && report.reimbursement_landscape.payer_landscape}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {report.reimbursement_landscape && (report.reimbursement_landscape.relevant_cpt_codes || []).length > 0 && (
                  <div>
                    <div style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#999", marginBottom: 8 }}>CPT Codes</div>
                    {report.reimbursement_landscape.relevant_cpt_codes.map((c, i) => <div key={i} style={{ fontFamily: "monospace", fontSize: 12, background: "#f5f2ee", padding: "5px 10px", borderRadius: 4, marginBottom: 5 }}>{c}</div>)}
                  </div>
                )}
                {report.reimbursement_landscape && (report.reimbursement_landscape.relevant_drg_codes || []).length > 0 && (
                  <div>
                    <div style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#999", marginBottom: 8 }}>DRG Codes</div>
                    {report.reimbursement_landscape.relevant_drg_codes.map((c, i) => <div key={i} style={{ fontFamily: "monospace", fontSize: 12, background: "#f5f2ee", padding: "5px 10px", borderRadius: 4, marginBottom: 5 }}>{c}</div>)}
                  </div>
                )}
              </div>
            </Card>

            {/* Strategic Fit */}
            <Card>
              <ST>BCH Strategic Fit & Recommended Team</ST>
              <div style={{ fontFamily: "sans-serif", fontSize: 14, lineHeight: 1.7, marginBottom: 14 }}>{report.strategic_fit && report.strategic_fit.bch_capabilities}</div>
              <div style={{ fontFamily: "sans-serif", fontSize: 13, color: "#666", lineHeight: 1.6, marginBottom: 16 }}>{report.strategic_fit && report.strategic_fit.partnership_opportunities}</div>
              {report.strategic_fit && (report.strategic_fit.recommended_team || []).length > 0 && (
                <div>
                  <div style={{ fontFamily: "sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#999", marginBottom: 10 }}>Recommended Team Roles</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {report.strategic_fit.recommended_team.map((r, i) => (
                      <span key={i} style={{ background: "#e3f0fc", color: "#0c4a8a", fontFamily: "sans-serif", fontSize: 12, fontWeight: 600, padding: "5px 14px", borderRadius: 20 }}>{r}</span>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {/* PI Strength Card */}
            <Card style={{ border: piScore !== null ? "2px solid #c8a850" : "2px dashed #d4c89a" }}>
              <ST>Principal Investigator Strength Assessment</ST>
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontFamily: "sans-serif", fontSize: 13, color: "#6b6458", lineHeight: 1.7, marginBottom: 16 }}>
                    Rate the PI's credibility and readiness to lead this project to commercialization. This score carries <strong>15% weight</strong> in the final pre-selection decision. Score based on clinical track record, institutional support, and alignment between PI expertise and project needs.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      { score: 5, label: "Exceptional", desc: "National/international leader in this clinical area. Strong publication record, prior commercialization experience, clear institutional backing." },
                      { score: 4, label: "Strong",      desc: "Recognized expert in the field. Solid clinical experience, relevant publications, committed team, realistic timeline." },
                      { score: 3, label: "Moderate",    desc: "Competent clinician with relevant experience. Some gaps in commercialization know-how but addressable with support." },
                      { score: 2, label: "Weak",        desc: "Limited relevant experience. Unclear institutional commitment. Would require substantial mentorship to succeed." },
                      { score: 1, label: "Insufficient",desc: "No meaningful track record in this area. Project is idea-stage only with minimal PI engagement." },
                    ].map(row => (
                      <div key={row.score} onClick={() => setPiScore(row.score)}
                        style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 14px", borderRadius: 8, cursor: "pointer", background: piScore === row.score ? "#fff4e0" : "#f5f2ee", border: piScore === row.score ? "2px solid #c8a850" : "2px solid transparent", transition: "all 0.15s" }}>
                        <div style={{ width: 28, height: 28, borderRadius: 6, background: piScore === row.score ? "#c8a850" : "#e0dbd4", color: piScore === row.score ? "white" : "#888", fontFamily: "monospace", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{row.score}</div>
                        <div>
                          <span style={{ fontFamily: "sans-serif", fontWeight: 700, fontSize: 13, color: "#1a1814" }}>{row.label} — </span>
                          <span style={{ fontFamily: "sans-serif", fontSize: 13, color: "#555", lineHeight: 1.5 }}>{row.desc}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* Sources — always rendered, print-safe */}
            <SourcesPanel sources={report.sources || []} />

            {/* Footer */}
            <div style={{ fontFamily: "sans-serif", fontSize: 11, color: "#aaa", textAlign: "center", padding: "8px 0 24px" }}>
              This report was generated by the BCH Pediatric Venture Studio AI screening tool. All sources verified via live web search. Advisory only. · {date}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

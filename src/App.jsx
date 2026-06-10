import { useState, useRef } from "react";
import { generateAndDownload } from "./generateDocx";

const STEPS = ["Upload Scan", "Extract Data", "Review & Edit", "Download Report"];

const SEVERITY_COLORS = {
  Critical: { bg: "#FEE2E2", text: "#991B1B", dot: "#DC2626" },
  High:     { bg: "#FFEDD5", text: "#9A3412", dot: "#EA580C" },
  Medium:   { bg: "#FEF9C3", text: "#854D0E", dot: "#CA8A04" },
  Low:      { bg: "#DCFCE7", text: "#166534", dot: "#16A34A" },
  Info:     { bg: "#DBEAFE", text: "#1E40AF", dot: "#2563EB" },
};

function Badge({ severity }) {
  const c = SEVERITY_COLORS[severity] || SEVERITY_COLORS.Info;
  return (
    <span style={{ background: c.bg, color: c.text, padding: "2px 10px", borderRadius: 99, fontSize: 12, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.dot, display: "inline-block" }} />
      {severity}
    </span>
  );
}

function StepBar({ current }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 32 }}>
      {STEPS.map((s, i) => (
        <div key={s} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : "none" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 80 }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: 14,
              background: i < current ? "#2563EB" : i === current ? "#1D4ED8" : "#E5E7EB",
              color: i <= current ? "#fff" : "#9CA3AF",
              border: i === current ? "3px solid #BFDBFE" : "3px solid transparent",
              boxSizing: "border-box"
            }}>{i < current ? "✓" : i + 1}</div>
            <div style={{ fontSize: 11, marginTop: 4, color: i === current ? "#1D4ED8" : "#6B7280", fontWeight: i === current ? 600 : 400, whiteSpace: "nowrap" }}>{s}</div>
          </div>
          {i < STEPS.length - 1 && <div style={{ flex: 1, height: 2, background: i < current ? "#2563EB" : "#E5E7EB", margin: "0 4px", marginBottom: 20 }} />}
        </div>
      ))}
    </div>
  );
}

const EMPTY_DATA = {
  reportTitle: "Vulnerability Assessment Report",
  targetOrg: "", scanDate: "", assessor: "", scope: "", executiveSummary: "",
  vulnerabilities: []
};

function Field({ label, value, onChange, multiline, placeholder = "" }) {
  const base = { width: "100%", padding: "8px 10px", borderRadius: 7, border: "1.5px solid #D1D5DB", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", background: "#F9FAFB" };
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748B", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>
      {multiline
        ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} style={{ ...base, resize: "vertical" }} />
        : <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={base} />}
    </div>
  );
}

export default function App() {
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [data, setData] = useState(EMPTY_DATA);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const fileRef = useRef();

  function updateVuln(i, field, val) {
    setData(d => ({ ...d, vulnerabilities: d.vulnerabilities.map((v, j) => j === i ? { ...v, [field]: val } : v) }));
  }

  async function handleExtract() {
    if (!file) return;
    setLoading(true); setError(""); setLoadingMsg("AI is reading your scan report…");
    try {
      const base64 = await fileToBase64(file);
      const isPDF = file.type === "application/pdf";
      const mediaType = isPDF ? "application/pdf" : file.type;
      const contentType = isPDF ? "document" : "image";

      const msgContent = [
        { type: contentType, source: { type: "base64", media_type: mediaType, data: base64 } },
        { type: "text", text: "Extract all vulnerability data from this scan report. Return ONLY valid JSON, no markdown." }
      ];

      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          system: `You are a cybersecurity analyst. Extract all vulnerability data from the provided scan report. 
Return ONLY a valid JSON object with this exact structure (no markdown, no backticks, no explanation):
{
  "reportTitle": "string",
  "targetOrg": "string",
  "scanDate": "string",
  "assessor": "string",
  "scope": "string",
  "executiveSummary": "string",
  "vulnerabilities": [
    {
      "id": "string",
      "title": "string",
      "severity": "Critical|High|Medium|Low|Info",
      "cvssScore": "string",
      "affectedSystem": "string",
      "description": "string",
      "recommendation": "string"
    }
  ]
}`,
          messages: [{ role: "user", content: msgContent }]
        })
      });

      if (!resp.ok) throw new Error(`API error ${resp.status}`);
      const result = await resp.json();
      const raw = result.content?.map(c => c.text || "").join("") || "";
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setData({ ...EMPTY_DATA, ...parsed, vulnerabilities: parsed.vulnerabilities || [] });
      setStep(2);
    } catch (e) {
      setError("Could not parse the scan. Please check your file. (" + e.message + ")");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    setLoading(true); setError(""); setLoadingMsg("Building your Word document…");
    try {
      await generateAndDownload(data);
      setDone(true);
      setStep(3);
    } catch (e) {
      console.error(e);
      setError("Failed to generate report: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  const counts = {
    Critical: data.vulnerabilities.filter(v => v.severity === "Critical").length,
    High: data.vulnerabilities.filter(v => v.severity === "High").length,
    Medium: data.vulnerabilities.filter(v => v.severity === "Medium").length,
    Low: data.vulnerabilities.filter(v => v.severity === "Low").length,
    Info: data.vulnerabilities.filter(v => v.severity === "Info").length,
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#EFF6FF 0%,#F0F9FF 100%)", fontFamily: "'Inter',system-ui,sans-serif", padding: "24px 16px" }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#1E3A5F", color: "#fff", padding: "6px 18px", borderRadius: 99, fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
            🛡️ Vulnerability Report Automation
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: "#0F172A", margin: "6px 0 4px" }}>Scan → Word Report</h1>
          <p style={{ color: "#64748B", fontSize: 14 }}>Upload your vulnerability scan, AI extracts the data, download a professional Word report.</p>
        </div>

        <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 4px 24px rgba(0,0,0,0.07)", padding: "28px 32px" }}>
          <StepBar current={step} />

          {/* STEP 0 */}
          {step === 0 && (
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: "#1E3A5F", marginBottom: 6 }}>Upload Your Scan Report</h2>
              <p style={{ color: "#64748B", fontSize: 13, marginBottom: 18 }}>Supports PDF or image scans from Nessus, OpenVAS, Qualys, Burp Suite, Nikto, etc.</p>
              <div onClick={() => fileRef.current.click()} style={{ border: "2px dashed " + (file ? "#2563EB" : "#CBD5E1"), borderRadius: 12, padding: "36px 24px", textAlign: "center", cursor: "pointer", background: file ? "#EFF6FF" : "#F8FAFC" }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>{file ? "📄" : "⬆️"}</div>
                {file
                  ? <div><div style={{ fontWeight: 600, color: "#1E40AF" }}>{file.name}</div><div style={{ color: "#64748B", fontSize: 13, marginTop: 4 }}>{(file.size / 1024).toFixed(1)} KB · Click to change</div></div>
                  : <div><div style={{ fontWeight: 600, color: "#374151" }}>Drop your scan report here</div><div style={{ color: "#94A3B8", fontSize: 13, marginTop: 4 }}>PDF, PNG, or JPG</div></div>}
                <input ref={fileRef} type="file" accept=".pdf,image/*" style={{ display: "none" }} onChange={e => { setFile(e.target.files[0]); setError(""); }} />
              </div>
              <button onClick={() => setStep(1)} disabled={!file} style={{ marginTop: 18, width: "100%", padding: "12px", borderRadius: 10, border: "none", background: file ? "#1D4ED8" : "#CBD5E1", color: "#fff", fontWeight: 700, fontSize: 15, cursor: file ? "pointer" : "not-allowed" }}>
                Continue →
              </button>
            </div>
          )}

          {/* STEP 1 */}
          {step === 1 && (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <div style={{ fontSize: 48, marginBottom: 10 }}>🤖</div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1E3A5F", marginBottom: 8 }}>Ready to Extract</h2>
              <p style={{ color: "#64748B", fontSize: 14, marginBottom: 20 }}>Claude AI will extract CVEs, severity, CVSS scores, affected systems, and recommendations from your scan.</p>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 24 }}>
                {["CVE IDs", "Severity Levels", "CVSS Scores", "Affected Systems", "Remediation Steps"].map(t => (
                  <span key={t} style={{ background: "#EFF6FF", color: "#1D4ED8", padding: "4px 12px", borderRadius: 99, fontSize: 12, fontWeight: 500 }}>✓ {t}</span>
                ))}
              </div>
              {loading
                ? <div><div style={{ fontSize: 13, color: "#64748B", marginBottom: 12 }}>{loadingMsg}</div><div style={{ display: "flex", justifyContent: "center" }}><div style={{ width: 36, height: 36, border: "4px solid #DBEAFE", borderTopColor: "#2563EB", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /></div></div>
                : <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                    <button onClick={() => setStep(0)} style={{ padding: "10px 20px", borderRadius: 8, border: "1.5px solid #CBD5E1", background: "#fff", color: "#374151", fontWeight: 600, cursor: "pointer" }}>← Back</button>
                    <button onClick={handleExtract} style={{ padding: "10px 28px", borderRadius: 8, border: "none", background: "#1D4ED8", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>🔍 Extract with AI</button>
                  </div>}
              {error && <div style={{ marginTop: 12, color: "#DC2626", background: "#FEE2E2", padding: "10px 14px", borderRadius: 8, fontSize: 13 }}>{error}</div>}
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
                <div>
                  <h2 style={{ fontSize: 17, fontWeight: 700, color: "#1E3A5F", marginBottom: 4 }}>Review & Edit</h2>
                  <p style={{ color: "#64748B", fontSize: 13 }}>Verify the extracted data before generating.</p>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {Object.entries(counts).filter(([, c]) => c > 0).map(([sev, cnt]) => (
                    <span key={sev} style={{ background: SEVERITY_COLORS[sev].bg, color: SEVERITY_COLORS[sev].text, padding: "3px 10px", borderRadius: 99, fontSize: 12, fontWeight: 700 }}>{cnt} {sev}</span>
                  ))}
                </div>
              </div>

              <div style={{ background: "#F8FAFC", borderRadius: 10, padding: 16, marginBottom: 16, border: "1px solid #E2E8F0" }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: "#64748B", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>📋 Report Metadata</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
                  <Field label="Report Title" value={data.reportTitle} onChange={v => setData(d => ({ ...d, reportTitle: v }))} />
                  <Field label="Target Organization" value={data.targetOrg} onChange={v => setData(d => ({ ...d, targetOrg: v }))} placeholder="Acme Corp" />
                  <Field label="Scan Date" value={data.scanDate} onChange={v => setData(d => ({ ...d, scanDate: v }))} />
                  <Field label="Assessor / Tool" value={data.assessor} onChange={v => setData(d => ({ ...d, assessor: v }))} />
                </div>
                <Field label="Scope" value={data.scope} onChange={v => setData(d => ({ ...d, scope: v }))} placeholder="192.168.1.0/24" />
                <Field label="Executive Summary" value={data.executiveSummary} onChange={v => setData(d => ({ ...d, executiveSummary: v }))} multiline />
              </div>

              <div style={{ fontWeight: 700, fontSize: 12, color: "#64748B", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>🔓 Vulnerabilities ({data.vulnerabilities.length})</div>

              {data.vulnerabilities.map((v, i) => {
                const c = SEVERITY_COLORS[v.severity] || SEVERITY_COLORS.Info;
                return (
                  <div key={i} style={{ border: `1.5px solid #E2E8F0`, borderLeft: `4px solid ${c.dot}`, borderRadius: 10, padding: "14px 16px", marginBottom: 12, background: "#FAFAFA" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input value={v.id} onChange={e => updateVuln(i, "id", e.target.value)} placeholder="CVE-2024-XXXX"
                          style={{ fontWeight: 700, fontSize: 13, border: "1px solid #E2E8F0", borderRadius: 6, padding: "3px 8px", width: 150, background: "#fff" }} />
                        <select value={v.severity} onChange={e => updateVuln(i, "severity", e.target.value)}
                          style={{ border: "1px solid #E2E8F0", borderRadius: 6, padding: "3px 8px", fontSize: 13, background: "#fff" }}>
                          {Object.keys(SEVERITY_COLORS).map(s => <option key={s}>{s}</option>)}
                        </select>
                        <Badge severity={v.severity} />
                      </div>
                      <button onClick={() => setData(d => ({ ...d, vulnerabilities: d.vulnerabilities.filter((_, j) => j !== i) }))}
                        style={{ background: "#FEE2E2", color: "#DC2626", border: "none", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>✕</button>
                    </div>
                    <input value={v.title} onChange={e => updateVuln(i, "title", e.target.value)} placeholder="Vulnerability title"
                      style={{ width: "100%", fontWeight: 600, fontSize: 14, border: "1.5px solid #E2E8F0", borderRadius: 7, padding: "6px 10px", marginBottom: 8, boxSizing: "border-box", background: "#fff" }} />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                      <input value={v.affectedSystem} onChange={e => updateVuln(i, "affectedSystem", e.target.value)} placeholder="Affected system / IP"
                        style={{ border: "1px solid #E2E8F0", borderRadius: 6, padding: "6px 10px", fontSize: 13, background: "#fff" }} />
                      <input value={v.cvssScore || ""} onChange={e => updateVuln(i, "cvssScore", e.target.value)} placeholder="CVSS Score e.g. 9.8"
                        style={{ border: "1px solid #E2E8F0", borderRadius: 6, padding: "6px 10px", fontSize: 13, background: "#fff" }} />
                    </div>
                    <textarea value={v.description} onChange={e => updateVuln(i, "description", e.target.value)} placeholder="Description" rows={2}
                      style={{ width: "100%", border: "1px solid #E2E8F0", borderRadius: 6, padding: "6px 10px", fontSize: 13, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", background: "#fff", marginBottom: 6 }} />
                    <textarea value={v.recommendation} onChange={e => updateVuln(i, "recommendation", e.target.value)} placeholder="Recommendation / fix" rows={2}
                      style={{ width: "100%", border: "1px solid #E2E8F0", borderRadius: 6, padding: "6px 10px", fontSize: 13, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", background: "#fff" }} />
                  </div>
                );
              })}

              <button onClick={() => setData(d => ({ ...d, vulnerabilities: [...d.vulnerabilities, { id: "", title: "", severity: "Medium", cvssScore: "", affectedSystem: "", description: "", recommendation: "" }] }))}
                style={{ width: "100%", padding: "10px", borderRadius: 8, border: "2px dashed #CBD5E1", background: "#F8FAFC", color: "#64748B", fontWeight: 600, cursor: "pointer", fontSize: 14, marginBottom: 16 }}>
                + Add Vulnerability
              </button>

              {error && <div style={{ color: "#DC2626", background: "#FEE2E2", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setStep(1)} style={{ padding: "10px 20px", borderRadius: 8, border: "1.5px solid #CBD5E1", background: "#fff", color: "#374151", fontWeight: 600, cursor: "pointer" }}>← Back</button>
                <button onClick={handleGenerate} disabled={loading}
                  style={{ flex: 1, padding: "12px", borderRadius: 10, border: "none", background: loading ? "#CBD5E1" : "#1D4ED8", color: "#fff", fontWeight: 700, fontSize: 15, cursor: loading ? "not-allowed" : "pointer" }}>
                  {loading ? loadingMsg : "📄 Generate Word Report"}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E3A5F", marginBottom: 8 }}>Report Downloaded!</h2>
              <p style={{ color: "#64748B", fontSize: 14, marginBottom: 24 }}>
                <strong>{data.reportTitle}</strong><br />
                {data.targetOrg && <span>{data.targetOrg} · </span>}
                {data.vulnerabilities.length} vulnerabilities documented
              </p>
              <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap", marginBottom: 28 }}>
                {Object.entries(counts).filter(([, c]) => c > 0).map(([sev, cnt]) => (
                  <div key={sev} style={{ background: SEVERITY_COLORS[sev].bg, color: SEVERITY_COLORS[sev].text, padding: "8px 18px", borderRadius: 10, fontWeight: 700 }}>
                    <div style={{ fontSize: 22 }}>{cnt}</div><div style={{ fontSize: 12 }}>{sev}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => generateAndDownload(data)}
                style={{ padding: "12px 32px", borderRadius: 12, border: "none", background: "#1D4ED8", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", marginBottom: 12 }}>
                ⬇️ Download Again
              </button>
              <div>
                <button onClick={() => { setStep(0); setFile(null); setData(EMPTY_DATA); setDone(false); setError(""); }}
                  style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 13, textDecoration: "underline" }}>
                  Start New Report
                </button>
              </div>
            </div>
          )}
        </div>
        <div style={{ textAlign: "center", marginTop: 14, fontSize: 12, color: "#94A3B8" }}>Powered by Claude AI · Data processed securely, not stored</div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } * { box-sizing: border-box; }`}</style>
    </div>
  );
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = () => rej(new Error("File read failed"));
    r.readAsDataURL(file);
  });
}

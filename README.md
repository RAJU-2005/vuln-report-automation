# 🛡️ Vulnerability Report Automation

Automatically convert vulnerability scan reports into professional Word documents using Claude AI.

## Features
- 📤 Upload PDF or image scans (Nessus, OpenVAS, Qualys, Burp Suite, Nikto, etc.)
- 🤖 AI extracts: CVEs, severity levels, CVSS scores, affected systems, recommendations
- ✏️ Review and edit all extracted data before generating
- 📄 Downloads a professional .docx with cover page, summary tables, and detailed findings

## Live Demo
> https://YOUR_USERNAME.github.io/vuln-report-automation/

## Setup

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages

1. Push this repo to GitHub
2. Go to **Settings → Pages → Source → GitHub Actions**
3. The workflow auto-deploys on every push to `main`

> ⚠️ This app uses the Anthropic API directly from the browser. It requires the API to allow browser-based requests (CORS must be enabled for your use case).

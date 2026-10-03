# Starts the producer memory (NMAFC, the organisers' neuromorphic memory) on http://127.0.0.1:8765.
# Uses the Gemini key from this project's .env through Google's OpenAI-compatible API (no OpenAI key needed).
# One-time setup (already done on Kaif's laptop): NMAFC installed in ..\..\nmafc-svc\.venv
#   python -m venv nmafc-svc\.venv ; git clone https://github.com/blok-hamster/nmafc nmafc-svc\src
#   nmafc-svc\.venv\Scripts\python -m pip install -e "nmafc-svc\src[web,cli,llm]"
$root = Split-Path -Parent $PSScriptRoot
$svc = Join-Path (Split-Path -Parent $root) "nmafc-svc"
$key = ((Get-Content (Join-Path $root ".env") | Where-Object { $_ -match '^GEMINI_API_KEY=' }) -replace '^GEMINI_API_KEY=', '').Trim().Trim('"')
if (-not $key) { Write-Host "Put GEMINI_API_KEY in .env first."; exit 1 }
$env:OPENAI_API_KEY = $key
$env:OPENAI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
$env:NMAFC_LLM_PROVIDER_MODEL = "openai/gemini-flash-lite-latest"   # Gemini Flash-Lite does memory extraction (keeps Gemma free for the producer; 3.8-flash free tier is only 20/day)
$env:NMAFC_EMBEDDING_PROVIDER_MODEL = "openai/gemini-embedding-001"
$env:NMAFC_EMBEDDING_DIM = "3072"   # skips NMAFC's dimension probe, which breaks on Windows
Set-Location $svc
Get-Process nmafc-web -ErrorAction SilentlyContinue | Stop-Process -ErrorAction SilentlyContinue
Start-Process -FilePath ".\.venv\Scripts\nmafc-web.exe" -ArgumentList "--port","8765","--host","127.0.0.1" -WindowStyle Hidden `
  -RedirectStandardOutput "$env:TEMP\nmafc-out.txt" -RedirectStandardError "$env:TEMP\nmafc-err.txt"
Write-Host "Producer memory (NMAFC) starting on http://127.0.0.1:8765 - dashboard + /docs there too."

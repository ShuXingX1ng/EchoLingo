"""
EchoLingo FastAPI Backend

Python backend for the EchoLingo PTE Academic practice platform.
"""

from pathlib import Path
from dotenv import load_dotenv

# Load environment variables before any service modules are imported
load_dotenv(dotenv_path=Path(__file__).parent / ".env", override=True)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import tts, pronunciation, pte_stimulus, pte_feedback, word_lookup

# Create FastAPI app
app = FastAPI(
    title="EchoLingo API",
    description="Backend API for the EchoLingo PTE Academic practice platform",
    version="1.0.0",
)

# Configure CORS
# Allow frontend domain and localhost for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "https://echolingo.vercel.app",
    ],
    # Also allow any LAN IP (192.168.x.x, 10.x.x.x, 172.16-31.x.x) on any port — covers
    # dev access via local network IP (e.g. http://192.168.110.101:3000).
    allow_origin_regex=r"http://(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(tts.router, prefix="/api", tags=["tts"])
app.include_router(pronunciation.router, prefix="/api", tags=["pronunciation"])
app.include_router(pte_stimulus.router, prefix="/api", tags=["pte"])
app.include_router(pte_feedback.router, prefix="/api", tags=["pte"])
app.include_router(word_lookup.router, prefix="/api", tags=["word-lookup"])


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "echolingo-api"}


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "EchoLingo API",
        "version": "1.0.0",
        "docs": "/docs",
    }

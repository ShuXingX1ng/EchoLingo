"""
EchoLingo FastAPI Backend

Python backend for EchoLingo IELTS speaking practice platform.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from routers import examiner, feedback, tts, pronunciation, pte_stimulus, pte_feedback

# Load environment variables
load_dotenv()

# Create FastAPI app
app = FastAPI(
    title="EchoLingo API",
    description="Backend API for EchoLingo IELTS speaking practice platform",
    version="1.0.0",
)

# Configure CORS
# Allow frontend domain and localhost for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Next.js dev server
        "http://localhost:3001",  # Alternative dev port
        "https://echolingo.vercel.app",  # Production (update with actual domain)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(examiner.router, prefix="/api", tags=["examiner"])
app.include_router(feedback.router, prefix="/api", tags=["feedback"])
app.include_router(tts.router, prefix="/api", tags=["tts"])
app.include_router(pronunciation.router, prefix="/api", tags=["pronunciation"])
app.include_router(pte_stimulus.router, prefix="/api", tags=["pte"])
app.include_router(pte_feedback.router, prefix="/api", tags=["pte"])


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

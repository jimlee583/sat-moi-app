"""FastAPI application entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import moi, slew

app = FastAPI(
    title="Satellite Moment of Inertia Aggregator",
    version="1.1.0",
    description=(
        "Aggregate a satellite's moment-of-inertia tensor from a base SV tensor "
        "and an arbitrary number of deployables (parallel-axis theorem), "
        "and compute rest-to-rest eigenaxis slew times for a 4-wheel pyramid RWA."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://sat-moi-app.web.app",
        "https://sat-moi-app.firebaseapp.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(moi.router)
app.include_router(slew.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

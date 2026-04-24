"""FastAPI application entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import moi

app = FastAPI(
    title="Satellite Moment of Inertia Aggregator",
    version="1.0.0",
    description=(
        "Aggregate a satellite's moment-of-inertia tensor from a base SV tensor "
        "and an arbitrary number of deployables (parallel-axis theorem), "
        "returning the total tensor plus principal moments and axes."
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


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

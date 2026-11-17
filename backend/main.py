from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from . import models
from .database import engine
from .routers import auth, documents, history, images

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Collaborative Editor API (Secured)")
app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(history.router)
app.include_router(images.router)


@app.get("/", tags=["Root"])
def read_root():
    return RedirectResponse(url="/docs")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

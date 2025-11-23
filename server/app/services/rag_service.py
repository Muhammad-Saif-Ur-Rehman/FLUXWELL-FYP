# app/services/rag_service.py
import os
import time
import uuid
import json
from typing import List, Dict, Any, Optional, Tuple
from gradio_client import Client as GradioClient
from pinecone import Pinecone
import numpy as np
from dotenv import load_dotenv
# Optional: logging
import logging
logger = logging.getLogger("rag_service")
logger.setLevel(logging.INFO)

load_dotenv()
# ---------- CONFIG (ENV) ----------
HF_TEXT_SPACE = os.getenv("HF_TEXT_SPACE")
HF_IMAGE_SPACE = os.getenv("HF_IMAGE_SPACE")
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
PINECONE_INDEX = os.getenv("PINECONE_INDEX", "fluxwell-fitness-kb")
PINECONE_NAMESPACES = os.getenv("PINECONE_NAMESPACES", "fitness,nutrition").split(",")
EMBED_BATCH = int(os.getenv("EMBED_BATCH", "32"))
TOP_K = int(os.getenv("RAG_TOP_K", "6"))

# Groq client will be used by the chat layer; we don't initialize it here.
# If you want to use Groq for image / audio ops, use groq sdk in fluxie_chat or separate module.

if not PINECONE_API_KEY:
    raise RuntimeError("Missing PINECONE_API_KEY env var")

# ---------- Initialize HF space clients ----------
# These are Gradio Spaces you created and made public
_text_client = None
_image_client = None

if HF_TEXT_SPACE:
    try:
        _text_client = GradioClient(HF_TEXT_SPACE)
        logger.info(f"HF Text embedding client initialized: {HF_TEXT_SPACE}")
    except Exception as e:
        logger.warning(f"Failed to initialize HF text client: {e}")
else:
    logger.warning("HF_TEXT_SPACE not configured - text embeddings will fail")

if HF_IMAGE_SPACE:
    try:
        _image_client = GradioClient(HF_IMAGE_SPACE)
        logger.info(f"HF Image embedding client initialized: {HF_IMAGE_SPACE}")
    except Exception as e:
        logger.warning(f"Failed to initialize HF image client: {e}")
else:
    logger.warning("HF_IMAGE_SPACE not configured - image embeddings will fail")

# ---------- Initialize Pinecone client ----------
_pc = Pinecone(api_key=PINECONE_API_KEY)
_index = _pc.Index(PINECONE_INDEX)

# ---------- Parser / helpers ----------
def _find_vectors_in_space_resp(resp: Any) -> Optional[List[List[float]]]:
    """
    Try to find vectors in many shapes returned by Spaces (robust).
    """
    # if directly list-of-vectors (nested)
    if isinstance(resp, list) and resp and isinstance(resp[0], list) and isinstance(resp[0][0], (float, int)):
        return resp
    
    # if flat list of floats (single embedding) - wrap in list
    if isinstance(resp, list) and resp and isinstance(resp[0], (float, int)):
        return [resp]
    
    # if dict with keys
    if isinstance(resp, dict):
        for candidate_key in ("data", "embeddings", "result", "output"):
            if candidate_key in resp:
                val = resp[candidate_key]
                # Check for nested list first
                if isinstance(val, list) and val and isinstance(val[0], list):
                    return val
                # Check for flat list of floats
                elif isinstance(val, list) and val and isinstance(val[0], (float, int)):
                    return [val]
        
        # recursive search
        def _search(o):
            if isinstance(o, list):
                if o and isinstance(o[0], list) and isinstance(o[0][0], (float, int)):
                    return o
                elif o and isinstance(o[0], (float, int)):
                    return [o]  # wrap flat list
                for i in o:
                    r = _search(i)
                    if r: return r
            elif isinstance(o, dict):
                for v in o.values():
                    r = _search(v)
                    if r: return r
            return None
        return _search(resp)
    return None

# ---------- Embedding wrappers ----------
def embed_texts(texts: List[str]) -> List[List[float]]:
    """
    Embed a list of texts using your HF text-embed Space.
    This expects a public space with api endpoint '/embed_text' that accepts list of strings.
    """
    if not texts:
        return []
    
    if _text_client is None:
        raise RuntimeError("HF text embedding client not initialized. Check HF_TEXT_SPACE configuration.")
    
    try:
        # many spaces accept (list_of_texts) as the single arg
        try:
            resp = _text_client.predict(texts, api_name="/embed_text")
        except TypeError:
            # some spaces accept keyword 'text'
            resp = _text_client.predict(text=texts, api_name="/embed_text")
    except Exception as e:
        logger.exception("HF text space call failed")
        raise

    vecs = _find_vectors_in_space_resp(resp)
    if vecs is None:
        raise RuntimeError(f"Unable to parse embedding response from HF text space. Resp preview: {str(resp)[:400]}")
    # ensure list-of-lists shape
    return [list(map(float, v)) for v in vecs]

def embed_image_bytes(image_bytes: bytes) -> List[float]:
    """
    Embed an image using the HF image embed space. This space must implement '/embed_image'
    that accepts an image file (we provide via gradio_client's file handling).
    """
    if _image_client is None:
        raise RuntimeError("HF image embedding client not initialized. Check HF_IMAGE_SPACE configuration.")
    
    # Use gradio_client.handle_file to wrap raw bytes
    from gradio_client import handle_file
    tmp_handle = handle_file(image_bytes)
    try:
        resp = _image_client.predict(image=tmp_handle, api_name="/embed_image")
    except Exception as e:
        logger.exception("HF image space call failed")
        raise
    vecs = _find_vectors_in_space_resp(resp)
    if not vecs:
        raise RuntimeError("No vectors returned from image space")
    return list(map(float, vecs[0]))

# ---------- Pinecone query ----------
def query_pinecone_vector(vec: List[float], top_k: int = TOP_K, namespace: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Query Pinecone index with a vector. Returns list of matches with metadata and score.
    """
    try:
        # Pinecone v5 query signature
        resp = _index.query(
            vector=vec,
            top_k=top_k,
            namespace=namespace or None,
            include_metadata=True,
        )
        # Normalize matches
        if isinstance(resp, dict):
            results = resp.get("matches", [])
        else:
            try:
                results = getattr(resp, "matches", [])
            except Exception:
                results = []
        # normalize
        out = []
        for m in results:
            # match may have .id, .score, .metadata (various shapes)
            mid = m.get("id") if isinstance(m, dict) else getattr(m, "id", None)
            score = m.get("score") if isinstance(m, dict) else getattr(m, "score", None)
            meta = m.get("metadata") if isinstance(m, dict) else getattr(m, "metadata", None)
            out.append({"id": mid, "score": float(score) if score is not None else None, "metadata": meta})
        return out
    except Exception as e:
        logger.exception("Pinecone query failed")
        return []

# ---------- Retrieval pipeline ----------
def retrieve(query: str, top_k: int = TOP_K, namespaces: Optional[List[str]] = None, min_score: float = 0.05) -> List[Dict[str, Any]]:
    """
    Given a textual query, embed it and search across configured namespaces.
    Returns deduplicated list of candidate passages sorted by score.
    Each item: {'id','score','metadata'}
    """
    namespaces = namespaces or PINECONE_NAMESPACES
    # 1) embed query
    vec = embed_texts([query])[0]
    results: List[Tuple[Dict[str, Any], str]] = []  # (match, namespace)
    for ns in namespaces:
        matches = query_pinecone_vector(vec, top_k=top_k, namespace=ns)
        for m in matches:
            # attach namespace info
            mm = dict(m)
            mm["_namespace"] = ns
            results.append((mm, ns))
    # flatten & dedupe by text_snippet (metadata)
    dedup = {}
    for m, ns in results:
        meta = m.get("metadata") or {}
        text_snip = (meta.get("text_snippet") or meta.get("text") or "")[:400]
        key = text_snip.strip().lower()
        # use score to keep best
        if key:
            prev = dedup.get(key)
            if not prev or (m.get("score") and prev.get("score", 0) < m.get("score")):
                dedup[key] = m
    out = list(dedup.values())
    # filter by min_score if present
    out = [o for o in out if o.get("score") is None or o.get("score") >= min_score]
    # sort by score desc (None -> 0)
    out.sort(key=lambda x: x.get("score") or 0.0, reverse=True)
    return out[:top_k]

# ---------- Utilities for building prompt context ----------
def build_context(passages: List[Dict[str, Any]], char_limit: int = 3000) -> str:
    """
    Build a textual context block from retrieved passages to give to LLM.
    Returns combined text with provenance metadata.
    """
    blocks = []
    cur_len = 0
    for p in passages:
        meta = p.get("metadata") or {}
        text = meta.get("text_snippet") or meta.get("text") or ""
        source = meta.get("source") or p.get("_namespace") or "kb"
        # small provenance header
        header = f"[source:{source} score:{p.get('score'):.3f}]"
        piece = f"{header}\n{text}\n"
        if cur_len + len(piece) > char_limit:
            break
        blocks.append(piece)
        cur_len += len(piece)
    if not blocks:
        return ""
    return "\n---\n".join(blocks)

# ---------- Image / Audio helpers (stubs, optional) ----------
def retrieve_for_image(image_bytes: bytes, top_k: int = TOP_K) -> List[Dict[str, Any]]:
    """
    Embed image, then query pinecone for similar items. Works only if you stored image embeddings
    in the index (or text embeddings that are comparable). If you didn't store image vectors,
    consider storing them under a dedicated namespace.
    """
    vec = embed_image_bytes(image_bytes)
    results = []
    for ns in PINECONE_NAMESPACES:
        m = query_pinecone_vector(vec, top_k=top_k, namespace=ns)
        for r in m:
            rr = dict(r)
            rr["_namespace"] = ns
            results.append(rr)
    # dedupe + sort similar to text retrieval
    # ... re-use logic
    dedup = {}
    for m in results:
        meta = m.get("metadata") or {}
        text_snip = (meta.get("text_snippet") or "")[:400]
        key = text_snip.strip().lower()
        if key:
            prev = dedup.get(key)
            if not prev or (m.get("score") and prev.get("score", 0) < m.get("score")):
                dedup[key] = m
    out = list(dedup.values())
    out.sort(key=lambda x: x.get("score") or 0.0, reverse=True)
    return out[:top_k]

def transcribe_audio_stub(audio_bytes: bytes) -> str:
    """
    You should implement a transcription call to your STT provider (Groq/Whisper or another).
    Here we provide a stub. Implement using groq SDK or external whisper API.
    """
    # Example (pseudo):
    # from groq import Groq
    # groq = Groq(api_key=...)
    # resp = groq.audio.transcriptions.create(file=audio_bytes, model="whisper-large-v3")
    # return resp.text
    raise NotImplementedError("Implement transcription using Groq or other STT provider")

# ---------- Exports ----------
__all__ = [
    "embed_texts",
    "embed_image_bytes",
    "query_pinecone_vector",
    "retrieve",
    "build_context",
    "retrieve_for_image",
    "transcribe_audio_stub",
]

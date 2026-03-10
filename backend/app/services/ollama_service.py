"""Optional Ollama API integration for image analysis."""
import httpx
import base64
from app.config import settings


async def analyze_image(image_bytes: bytes) -> str | None:
    """
    Send image to Ollama vision model for optional quality analysis.
    Returns a description string or None if disabled/unavailable.
    """
    if not settings.ollama_enabled:
        return None

    try:
        image_b64 = base64.b64encode(image_bytes).decode("utf-8")
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{settings.ollama_url}/api/generate",
                json={
                    "model": settings.ollama_model,
                    "prompt": (
                        "Describe briefly what you see on this product packaging image. "
                        "Is the background cleanly removed? Is the perspective straight?"
                    ),
                    "images": [image_b64],
                    "stream": False,
                },
            )
            if response.status_code == 200:
                return response.json().get("response", "")
    except Exception:
        pass
    return None


async def check_ollama_connection() -> dict:
    """Check if Ollama is reachable and model is available."""
    if not settings.ollama_enabled:
        return {"enabled": False, "reachable": False, "model": settings.ollama_model}

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{settings.ollama_url}/api/tags")
            if response.status_code == 200:
                models = response.json().get("models", [])
                model_names = [m.get("name", "") for m in models]
                model_available = any(settings.ollama_model in m for m in model_names)
                return {
                    "enabled": True,
                    "reachable": True,
                    "model": settings.ollama_model,
                    "model_available": model_available,
                    "available_models": model_names,
                }
    except Exception as e:
        return {"enabled": True, "reachable": False, "error": str(e), "model": settings.ollama_model}
    return {"enabled": True, "reachable": False, "model": settings.ollama_model}

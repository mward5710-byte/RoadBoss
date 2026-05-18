# /backend/services/llm/litellm_adapter.py
import time
from typing import Any, Dict, Optional
import logging
import litellm
from litellm import errors as ll_errors
import telemetry  # replace with your telemetry module

logger = logging.getLogger(__name__)

def normalize_response(resp: Any) -> Dict:
    return {
        "id": getattr(resp, "id", None),
        "choices": getattr(resp, "choices", []) or [],
        "usage": getattr(resp, "usage", {}) or {},
        "finish_reason": getattr(resp, "finish_reason", None),
    }

def max_tokens_for_model(model_name: str) -> int:
    val = litellm.get_max_tokens(model_name)
    if isinstance(val, dict):
        return int(val.get("max_tokens", 0))
    return int(val)

class RoadBossLLMError(Exception):
    pass

class RoadBossTransientError(RoadBossLLMError):
    pass

def map_exception(exc: Exception) -> Exception:
    if isinstance(exc, ll_errors.BadRequestError):
        return ValueError(str(exc))
    if isinstance(exc, ll_errors.APIStatusError):
        return RoadBossTransientError(str(exc))
    if isinstance(exc, ll_errors.APIConnectionError):
        return ConnectionError(str(exc))
    return RoadBossLLMError(str(exc))

def call_with_telemetry_and_retry(fn, *args, model: Optional[str]=None, provider: Optional[str]=None, **kwargs):
    attempts = 0
    backoff = 0.5
    while True:
        attempts += 1
        start = time.time()
        try:
            resp = fn(*args, **kwargs)
            latency_ms = int((time.time() - start) * 1000)
            usage = getattr(resp, "usage", {}) or {}
            telemetry.record_llm_call(
                provider=provider or "litellm",
                model=model or "unknown",
                tokens_in=usage.get("prompt_tokens"),
                tokens_out=usage.get("completion_tokens"),
                latency_ms=latency_ms,
                request_id=getattr(resp, "id", None),
            )
            return normalize_response(resp)
        except Exception as e:
            mapped = map_exception(e)
            if isinstance(mapped, RoadBossTransientError) and attempts < 4:
                logger.warning("Transient LLM error, retrying attempt %d: %s", attempts, mapped)
                time.sleep(backoff)
                backoff *= 2
                continue
            raise mapped

import os
import json
import boto3
import re
import logging
import urllib.parse
import random
from botocore.exceptions import ClientError
from constants import load_from_env, REFERENCE_URLS

# --- Optional OpenSearch imports (via your layer) ---
try:
    from opensearchpy import OpenSearch, RequestsHttpConnection, AWSV4SignerAuth
    _OPENSEARCH_AVAILABLE = True
except Exception:
    _OPENSEARCH_AVAILABLE = False


cfg = load_from_env()

# ---------- Logging ----------
logger = logging.getLogger()
logger.setLevel(logging.INFO)
logger.info(f"Using model/profile id: {cfg.INFERENCE_PROFILE_ID or cfg.LLM_MODEL_FALLBACK_ID}")
logger.info(
    f"Using KB ID: {cfg.KNOWLEDGE_BASE_ID or '(none)'} | "
    f"Bucket: {cfg.S3_BUCKET_NAME or '(none)'} | "
    f"OS endpoint: {cfg.OPENSEARCH_ENDPOINT or '(none)'}"
)

# ---------- AWS clients ----------
brt = boto3.client("bedrock-runtime", region_name=cfg.REGION)
agent_rt = boto3.client("bedrock-agent-runtime", region_name=cfg.REGION)
ws = boto3.client("apigatewaymanagementapi", endpoint_url=cfg.WEBSOCKET_CALLBACK_URL) if cfg.WEBSOCKET_CALLBACK_URL else None
s3 = boto3.client("s3") if cfg.S3_BUCKET_NAME else None

MODEL_ID = cfg.INFERENCE_PROFILE_ID or cfg.LLM_MODEL_FALLBACK_ID

# ---------- Runtime JSON KBs ----------
_RUNTIME_KB = None
_PERSONAL_KB = None
_RUNTIME_LAST_ETAG = None
_PERSONAL_LAST_ETAG = None
_CONFIG_LOADED = False


def _get_env(name, default=""):
    return getattr(cfg, name, None) or os.environ.get(name, default)


def _get_s3_object_text(key):
    """Read a small JSON file (runtime/personal) from S3."""
    if not s3 or not _get_env("S3_BUCKET_NAME") or not key:
        return "", None
    try:
        obj = s3.get_object(Bucket=_get_env("S3_BUCKET_NAME"), Key=key)
        body = obj["Body"].read().decode("utf-8")
        etag = (obj.get("ETag") or "").strip('"')
        return body, (etag or None)
    except Exception as e:
        logger.error(f"Failed to read S3 object {key}: {e}")
        return "", None


def _load_runtime_kbs(force=False):
    """Cold-start loader with ETag caching."""
    global _RUNTIME_KB, _PERSONAL_KB, _RUNTIME_LAST_ETAG, _PERSONAL_LAST_ETAG
    rk_key = _get_env("RUNTIME_KB_KEY")  # e.g., runtime/HIV_DDM_Chatbot_KB.json
    if rk_key:
        txt, etag = _get_s3_object_text(rk_key)
        if txt and (force or etag != _RUNTIME_LAST_ETAG or _RUNTIME_KB is None):
            _RUNTIME_KB = json.loads(txt)
            _RUNTIME_LAST_ETAG = etag
            logger.info(f"Loaded RUNTIME_KB key={rk_key} version={(_RUNTIME_KB.get('meta') or {}).get('version')}")
    pk_key = _get_env("PERSONAL_KB_KEY")  # e.g., runtime/personal_kb.json
    if pk_key:
        txt, etag = _get_s3_object_text(pk_key)
        if txt and (force or etag != _PERSONAL_LAST_ETAG or _PERSONAL_KB is None):
            _PERSONAL_KB = json.loads(txt)
            _PERSONAL_LAST_ETAG = etag
            logger.info(f"Loaded PERSONAL_KB key={pk_key} version={(_PERSONAL_KB.get('meta') or {}).get('version')}")


def _ensure_config_loaded():
    global _CONFIG_LOADED
    if not _CONFIG_LOADED:
        _load_runtime_kbs(force=True)
        _CONFIG_LOADED = True


# ---------- History normalization ----------
def _normalize_history_items(history_raw) -> list[dict]:
    out = []
    for it in (history_raw or []):
        try:
            if (it.get("type") or "").upper() != "TEXT":
                continue
            role_src = (it.get("sentBy") or "").upper()
            text = (it.get("message") or "").strip()
            if not text:
                continue
            if role_src == "USER":
                out.append({"role": "user", "content": [{"text": text}]})
            elif role_src == "BOT":
                out.append({"role": "assistant", "content": [{"text": text}]})
        except Exception:
            continue
    return out


# ---------- Personal & Runtime matching ----------
def _norm(s: str) -> str:
    return (s or "").lower().strip()


def _match_personal(prompt: str):
    if not _PERSONAL_KB:
        return None
    q = _norm(prompt)
    for item in _PERSONAL_KB.get("qna", []):
        if _norm(item.get("question_exact")) == q:
            return item
        for p in item.get("patterns", []) or []:
            if p and _norm(p) in q:
                return item
    return None


def _match_runtime(prompt: str):
    if not _RUNTIME_KB:
        return None
    q = _norm(prompt)
    for item in _RUNTIME_KB.get("qna", []):
        if _norm(item.get("question_exact")) == q:
            return item
        for p in item.get("patterns", []) or []:
            if p and _norm(p) in q:
                return item
    return None


def _get_source_meta(source_code: str) -> dict | None:
    try:
        return (_RUNTIME_KB or {}).get("sources", {}).get(source_code)
    except Exception:
        return None


# ---------- URL & Markdown helpers ----------
def _md_link(url: str, label: str | None = None) -> str:
    try:
        host = urllib.parse.urlparse(url).netloc or url
    except Exception:
        host = url
    return f"[{label or host}]({url})"


def _title_for_url(url: str) -> str:
    """Produce a readable title/host label for a URL."""
    try:
        p = urllib.parse.urlparse(url)
        host = (p.netloc or "").lower()
        path_last = (p.path.rstrip("/").split("/")[-1] if p.path else "").replace("-", " ").strip()
    except Exception:
        host, path_last = "", ""

    domain_map = {
        "aidsinfo.unaids.org": "UNAIDS AIDSinfo",
        "who.int": "World Health Organization (WHO)",
        "www.who.int": "World Health Organization (WHO)",
        "prepwatch.org": "PrEPWatch",
        "phia.icap.columbia.edu": "ICAP PHIA",
        "icap.columbia.edu": "ICAP at Columbia University",
    }
    if host in domain_map:
        return domain_map[host]
    if path_last and "." not in path_last:
        return path_last.title()
    if host:
        parts = host.split(".")
        public_suffix_2nd = {"co", "ac", "go", "or", "gov", "edu"}
        if len(parts) >= 3 and parts[-2] in public_suffix_2nd:
            return ".".join(parts[-3:])
        if len(parts) > 2:
            return ".".join(parts[-2:])
        return host
    return url


# ---------- URL detection & linkification ----------
_ANY_URL_RE = re.compile(r"https?://[^\s)>\]]+", re.IGNORECASE)
_BARE_URL_RE = re.compile(
    r"(?<!\]\()(https?://[^\s<>\[\]{}()'\"`]+)(?=$|\s|[>),.;:!?])",
    re.IGNORECASE,
)

def _linkify_bare_urls(text: str) -> str:
    if not text:
        return text

    def _repl(m: re.Match) -> str:
        url = m.group(1)
        try:
            return _md_link(url, _title_for_url(url))
        except Exception:
            return _md_link(url)

    return _BARE_URL_RE.sub(_repl, text)


# ---------- EMPHASIZE ONLY STATS/NUMBERS (outside links) ----------
_LINK_BLOCK_RE = re.compile(r"\[[^\]]+\]\([^)]+\)")

# percentages like 2%, 12.5%, 1,234.5%
_PERCENT_RE = re.compile(r"\b\d{1,3}(?:,\d{3})*(?:\.\d+)?%")

# chains like 95-95-95 or 2000–2023 (2 or more numbers separated by - or –)
_CHAIN_RE = re.compile(
    r"\b(\d{1,4}(?:,\d{3})*(?:\.\d+)?)"
    r"((?:\s*[–-]\s*\d{1,4}(?:,\d{3})*(?:\.\d+)?){1,})\b"
)

# standalone numbers (ints/decimals with optional commas)
_NUMBER_RE = re.compile(r"\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\b")

def _wrap_bold(s: str) -> str:
    return f"**{s}**"

def _emphasize_stats(text: str) -> str:
    """
    Bold only numbers/stats:
      - Percentages (e.g., 72%, 1.2%)
      - Number chains (95-95-95, 2000–2023) → **95**-**95**-**95**
      - Standalone numbers (1,234, 1.2)
    Never modify inside [label](url). Avoid double bold.
    """
    if not text:
        return text

    parts = _LINK_BLOCK_RE.split(text)
    links = _LINK_BLOCK_RE.findall(text)
    out = []

    def process(seg: str) -> str:
        # 1) bold number chains safely by rebuilding the chain
        def repl_chain(m: re.Match) -> str:
            first = m.group(1)
            rest = m.group(2)
            # Split rest by separators, preserving separators
            pieces = re.split(r"([–-])", rest)
            # pieces starts with separator or number depending on split; normalize
            rebuilt = [_wrap_bold(first)]
            i = 0
            while i < len(pieces):
                token = pieces[i]
                if token in ("-", "–"):
                    # next should be number (possibly with surrounding spaces removed)
                    num_raw = pieces[i+1] if i+1 < len(pieces) else ""
                    num_clean = num_raw.strip()
                    rebuilt.append(token)
                    if num_clean:
                        rebuilt.append(_wrap_bold(num_clean))
                    i += 2
                else:
                    i += 1
            return "".join(rebuilt)

        seg = _CHAIN_RE.sub(repl_chain, seg)

        # 2) bold percentages
        seg = _PERCENT_RE.sub(lambda m: _wrap_bold(m.group(0)), seg)

        # 3) bold standalone numbers (skip ones already bolded)
        tmp = []
        cursor = 0
        for m in _NUMBER_RE.finditer(seg):
            start, end = m.start(), m.end()
            # guard: don't bold if immediately inside/adjacent to **
            before = seg[max(0, start-2):start]
            after = seg[end:end+2]
            if "**" in before or "**" in after:
                tmp.append(seg[cursor:end])
                cursor = end
                continue
            tmp.append(seg[cursor:start])
            tmp.append(_wrap_bold(m.group(0)))
            cursor = end
        tmp.append(seg[cursor:])
        return "".join(tmp)

    for i, seg in enumerate(parts):
        out.append(process(seg))
        if i < len(links):
            out.append(links[i])

    return "".join(out)


# ---------- Suggested reference picking ----------
def _tokenize(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def _url_tokens(u: str) -> set[str]:
    try:
        p = urllib.parse.urlparse(u)
        host_parts = p.netloc.lower().split(".")
        path_parts = re.split(r"[^a-z0-9]+", p.path.lower())
        return {t for t in host_parts + path_parts if t}
    except Exception:
        return set()


def _pick_reference_url(prompt: str) -> str | None:
    ref_list = REFERENCE_URLS if (REFERENCE_URLS and isinstance(REFERENCE_URLS, (list, tuple))) else [
        "https://aidsinfo.unaids.org/",
        "https://www.who.int/data/gho",
        "https://phia.icap.columbia.edu/",
    ]
    if not ref_list:
        return None

    q = _tokenize(prompt)
    prefers_unaids = any(t in q for t in {"prevalence", "estimate", "estimates", "hiv", "incidence", "ghana"})

    best_url, best_score = None, -1
    for u in ref_list:
        toks = _url_tokens(u)
        score = sum(1 for t in toks if t in q)
        if "unaids" in toks or "aidsinfo" in toks:
            score += (5 if prefers_unaids else 3)
        if "who" in toks:
            score += 2
        if "icap" in toks or "phia" in toks:
            score += 2
        if score > best_score:
            best_score, best_url = score, u
    return best_url or ref_list[0]


# ---------- OpenSearch (optional COUNT support) ----------
_os = None
if _OPENSEARCH_AVAILABLE and cfg.OPENSEARCH_ENDPOINT:
    try:
        sess = boto3.Session()
        creds = sess.get_credentials()
        service = "aoss" if ".aoss." in cfg.OPENSEARCH_ENDPOINT else "es"
        auth = AWSV4SignerAuth(creds, cfg.REGION, service)
        host = cfg.OPENSEARCH_ENDPOINT.replace("https://", "")
        _os = OpenSearch(
            hosts=[{"host": host, "port": 443}],
            http_auth=auth,
            use_ssl=True,
            verify_certs=True,
            connection_class=RequestsHttpConnection,
            timeout=30,
            pool_maxsize=20,
        )
        _ = _os.ping()
        logger.info("OpenSearch client initialized.")
    except Exception as e:
        logger.error(f"OpenSearch init failed: {e}")
        _os = None
elif not _OPENSEARCH_AVAILABLE and cfg.OPENSEARCH_ENDPOINT:
    logger.warning("OpenSearch layer not available; COUNT disabled.")

_COUNT_STARTERS = (
    "how many papers",
    "count papers",
    "number of papers",
    "how many documents",
    "count documents",
    "list papers containing",
    "list documents containing",
    "count documents mentioning",
    "count documents about",
)

def _looks_like_count(q: str) -> bool:
    ql = _norm(q)
    if any(ql.startswith(s) for s in _COUNT_STARTERS):
        return True
    return ("how many" in ql and ("mention" in ql or "contain" in ql)) or ql.startswith("list ")


def _extract_keyword(q: str) -> str | None:
    m = re.search(r'"([^"]+)"', q) or re.search(r"'([^']+)'", q)
    if m:
        kw = m.group(1).strip()
        return kw if kw else None
    ql = q.lower()
    for trigger in ["mention ", "containing ", "contain ", "about "]:
        if trigger in ql:
            start = ql.index(trigger) + len(trigger)
            tail = ql[start:].strip()
            token = tail.split("?")[0].split(",")[0].strip()
            token = " ".join(token.split()[:5]).strip('.,!?\";\'')
            if token:
                return token
    return None


# ---------- Source utilities ----------
def _clean_filename(s3_uri_or_url: str) -> str:
    src = s3_uri_or_url or ""
    if not src:
        return "Unknown source"
    try:
        if src.startswith("s3://"):
            part = src.split("/", 3)[-1]
        elif src.startswith("https://") or src.startswith("http://"):
            from urllib.parse import urlparse, unquote
            parsed = urlparse(src)
            part = parsed.path.lstrip("/")
            return (unquote(part.split("/")[-1]) or "Unknown source")
        else:
            part = src
        from urllib.parse import unquote
        return (unquote(part.split("/")[-1]) or "Unknown source")
    except Exception:
        return src.split("/")[-1] if "/" in src else src


def _doc_url_from_s3_uri(s3_uri: str) -> str:
    if not s3_uri or not s3_uri.startswith("s3://"):
        return s3_uri or ""
    try:
        parts = s3_uri[5:].split("/", 1)
        if len(parts) != 2:
            return s3_uri
        bucket, key = parts[0], parts[1]
        if s3 and cfg.S3_BUCKET_NAME and bucket == cfg.S3_BUCKET_NAME:
            try:
                return s3.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": cfg.S3_BUCKET_NAME, "Key": key, "ResponseContentDisposition": "inline"},
                    ExpiresIn=3600,
                )
            except Exception as e:
                logger.warning(f"Presign failed for {s3_uri}: {e}")
                return f"https://{bucket}.s3.amazonaws.com/{key}"
        else:
            return s3_uri
    except Exception:
        return s3_uri


def _score_value(v):
    if isinstance(v, (int, float)):
        return float(v)
    try:
        if v is None:
            return float("-inf")
        return float(v)
    except Exception:
        return float("-inf")


def _dedupe_sources_best(items: list[dict]) -> list[dict]:
    best_by_key: dict[str, dict] = {}
    order: list[str] = []
    for it in items or []:
        url = (it.get("url") or "").strip()
        label = (it.get("label") or _clean_filename(url) or url).strip()
        key = label.lower()
        cur_best = best_by_key.get(key)
        if not cur_best:
            best_by_key[key] = it
            order.append(key)
            continue
        s_new = _score_value(it.get("score"))
        s_old = _score_value(cur_best.get("score"))
        take_new = False
        if s_new > s_old:
            take_new = True
        elif s_new == s_old:
            has_page_new = "page" in it and it["page"] is not None
            has_page_old = "page" in cur_best and cur_best["page"] is not None
            if has_page_new and not has_page_old:
                take_new = True
            elif has_page_new == has_page_old:
                https_new = (it.get("url") or "").startswith("https://")
                https_old = (cur_best.get("url") or "").startswith("https://")
                if https_new and not https_old:
                    take_new = True
        if take_new:
            best_by_key[key] = it
    return [best_by_key[k] for k in order]


# ---------- Bedrock KB retrieval ----------
def _kb_retrieve(prompt: str, kb_id: str, k: int = 10) -> tuple[str, list[dict]]:
    if not kb_id:
        return "", []
    try:
        resp = agent_rt.retrieve(
            knowledgeBaseId=kb_id,
            retrievalQuery={"text": prompt},
            retrievalConfiguration={"vectorSearchConfiguration": {"numberOfResults": k}},
        )
        results = resp.get("retrievalResults") or []
        if not results:
            return "", []
        snippets: list[str] = []
        sources_raw: list[dict] = []
        for r in results:
            txt = (r.get("content") or {}).get("text", "")
            if txt:
                snippets.append(txt)
            loc = (r.get("location") or {}).get("s3Location") or {}
            s3_uri = loc.get("uri")
            score = r.get("score")
            page = (r.get("metadata") or {}).get("x-amz-bedrock-kb-document-page-number")
            url = s3_uri
            if s3_uri and cfg.S3_BUCKET_NAME and s3 and s3_uri.startswith(f"s3://{cfg.S3_BUCKET_NAME}/"):
                try:
                    key = s3_uri.split(f"s3://{cfg.S3_BUCKET_NAME}/", 1)[1]
                    url = s3.generate_presigned_url(
                        "get_object",
                        Params={"Bucket": cfg.S3_BUCKET_NAME, "Key": key, "ResponseContentDisposition": "inline"},
                        ExpiresIn=3600,
                    )
                except Exception as e:
                    logger.warning(f"Presign failed for {s3_uri}: {e}")
            src: dict = {"url": url}
            if page is not None:
                src["page"] = page
            if isinstance(score, (int, float)):
                src["score"] = float(score)
            if url:
                src["label"] = _clean_filename(url)
            sources_raw.append(src)
        deduped = _dedupe_sources_best(sources_raw)
        return ("\n\n".join(snippets).strip(), deduped[:2])
    except ClientError as e:
        logger.error(f"KB retrieve ClientError: {e}")
        return "", []
    except Exception as e:
        logger.error(f"KB retrieve unexpected error: {e}")
        return "", []


# ---------- Snippets for reason generation ----------
def _basename_from_url(u: str) -> str:
    try:
        p = urllib.parse.urlparse(u)
        name = (p.path or "").split("/")[-1]
        name = urllib.parse.unquote(name or "")
        name = name.split("?")[0].split("#")[0]
        return name
    except Exception:
        return u or ""


def _collect_doc_snippets(prompt: str, k: int = 20) -> dict:
    out = {}
    kb_id = cfg.KNOWLEDGE_BASE_ID
    if not kb_id:
        return out
    try:
        resp = agent_rt.retrieve(
            knowledgeBaseId=kb_id,
            retrievalQuery={"text": prompt},
            retrievalConfiguration={"vectorSearchConfiguration": {"numberOfResults": k}},
        )
        results = resp.get("retrievalResults") or []
        for r in results:
            txt = (r.get("content") or {}).get("text") or ""
            loc = (r.get("location") or {}).get("s3Location") or {}
            s3_uri = loc.get("uri") or ""
            if not s3_uri or not txt:
                continue
            url = s3_uri
            if s3_uri.startswith("s3://") and s3 and cfg.S3_BUCKET_NAME and s3_uri.startswith(f"s3://{cfg.S3_BUCKET_NAME}/"):
                try:
                    key = s3_uri.split(f"s3://{cfg.S3_BUCKET_NAME}/", 1)[1]
                    url = s3.generate_presigned_url(
                        "get_object",
                        Params={"Bucket": cfg.S3_BUCKET_NAME, "Key": key, "ResponseContentDisposition": "inline"},
                        ExpiresIn=3600,
                    )
                except Exception as e:
                    logger.warning(f"Presign failed for {s3_uri}: {e}")
            key = _basename_from_url(s3_uri).lower()
            if key in out:
                continue
            out[key] = {"snippet": txt, "url": url, "label": _clean_filename(s3_uri)}
        return out
    except Exception as e:
        logger.warning(f"_collect_doc_snippets error: {e}")
        return out


# ---------- Model helpers ----------
def _extract_text_from_converse(resp) -> str:
    try:
        parts = (resp.get("output") or {}).get("message", {}).get("content", [])
        return "".join(p.get("text", "") for p in parts if isinstance(p, dict) and "text" in p)
    except Exception:
        return ""


def _model_complete_text(messages, system=None) -> str:
    try:
        kwargs = {"modelId": MODEL_ID, "messages": messages}
        if system:
            kwargs["system"] = [{"text": system}] if isinstance(system, str) else system
        resp = brt.converse(**kwargs)
        text = _extract_text_from_converse(resp)
        if text:
            return text
    except Exception as e:
        logger.warning(f"converse failed, falling back to stream: {e}")
    try:
        resp = brt.converse_stream(modelId=MODEL_ID, messages=messages, system=([{"text": system}] if system else None))
        stream = resp.get("stream")
        acc = []
        for ev in stream:
            if "contentBlockDelta" in ev:
                delta = (ev["contentBlockDelta"].get("delta") or {}).get("text")
                if delta:
                    acc.append(delta)
            elif "messageStop" in ev:
                break
        return "".join(acc)
    except Exception as e:
        logger.error(f"converse_stream failed: {e}")
        return ""


def _safe_json_from_text(txt: str) -> dict:
    try:
        start = txt.find("{")
        end = txt.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(txt[start:end+1])
    except Exception:
        pass
    return {}


def _gen_relevance_reasons_via_model(user_prompt: str, doc_snips: dict) -> dict:
    if not doc_snips:
        return {}
    docs_arr = []
    for k, v in doc_snips.items():
        snip = (v.get("snippet") or "").strip()
        if not snip:
            continue
        if len(snip) > 900:
            snip = snip[:900] + "…"
        docs_arr.append({"key": k, "snippet": snip, "label": v.get("label") or k})
    if not docs_arr:
        return {}
    system_text = (
        "You write one-sentence reasons why each document is relevant to the user's question. "
        "Base the reason ONLY on the provided snippet text; don't invent facts. "
        "Be specific (e.g., 'covers Nigeria ART and PrEP guidance, 2020 national guideline'). "
        "Return pure JSON mapping each 'key' to a single reason string. No extra commentary."
    )
    user_text = (
        "User question:\n"
        f"{user_prompt}\n\n"
        "Docs:\n" + json.dumps({"docs": docs_arr}, ensure_ascii=False)
    )
    messages = [{"role": "user", "content": [{"text": user_text}]}]
    txt = _model_complete_text(messages, system=system_text)
    obj = _safe_json_from_text(txt)
    if "reasons" in obj and isinstance(obj["reasons"], dict):
        return {k: (v or "").strip() for k, v in obj["reasons"].items()}
    return {k: (v or "").strip() for k, v in obj.items() if isinstance(v, str)}


# --- Lead-in generators for the “Sources at a glance” block ---
def _gen_sources_leadin_via_model(user_prompt: str) -> str:
    system_text = (
        "Write a short, friendly, ONE-LINE STATEMENT that introduces additional resources "
        "the user might want to check. Avoid emojis and salesy tone. 6–14 words. "
        "Plain text only. Do NOT end with a question mark."
    )
    user_text = (
        f"User question:\n{user_prompt}\n\n"
        "Return only the single statement line (e.g., 'Here are a few additional resources you might find useful.')."
    )
    messages = [{"role": "user", "content": [{"text": user_text}]}]
    out = (_model_complete_text(messages, system=system_text) or "").strip()
    out = re.sub(r"[\r\n]+", " ", out).strip()
    if not out:
        out = "Here are a few additional resources you might find useful."
    if len(out) > 140:
        out = out[:140].rstrip() + "…"
    if out.endswith("?"):
        out = out.rstrip("?").rstrip()
    if not out.endswith("."):
        out += "."
    return out


def _random_sources_leadin() -> str:
    options = [
        "I also pulled a few official sources you can explore.",
        "Here are additional resources I grabbed in case you want more detail.",
        "These are a few more resources I think could help.",
        "I collected some extra sources that may be useful.",
        "You might find these additional official resources helpful.",
        "I added a few more resources you can check out.",
        "These references could help if you want to dive deeper.",
        "I gathered some more sources in case they’re useful.",
        "Here are a few extra resources worth a look.",
        "These additional resources might answer follow-up questions you have.",
        "I included more resources that may inform planning.",
        "You can also review these official sources for more context.",
    ]
    return random.choice(options)


def _pick_sources_leadin(user_prompt: str) -> str:
    toks = set(re.findall(r"[a-z0-9\-]+", _norm(user_prompt)))
    has_ng = "nigeria" in toks or "ng" in toks
    has_prep = any(t in toks for t in ("prep", "pre-exposure", "preexposure"))
    is_rollout_budget = any(t in toks for t in ("rollout", "budget", "planning", "cost", "costing"))
    if has_ng and has_prep and is_rollout_budget:
        return _random_sources_leadin()
    try:
        return _gen_sources_leadin_via_model(user_prompt)
    except Exception as e:
        logger.warning(f"Lead-in model fallback due to error: {e}")
        return _random_sources_leadin()


# ---------- Varied, context-aware follow-up ----------
def _pick_follow_up(user_prompt: str, *, has_ref_site: bool, has_sources: bool, mode: str = "talk") -> str:
    """
    Returns a short, varied follow-up line tailored to the context.
    - has_ref_site: we suggested a specific site/tool link
    - has_sources: we attached sources/snippets
    - mode: "summary" (PDF/doc summarization flow) or "talk" (normal Q&A)
    Avoids phrasing like 'pull/extract numbers'; uses 'concise summary of the data' instead.
    """
    q = (_norm(user_prompt) or "")
    wants_how = any(t in q for t in ["how do i", "how to", "navigate", "where do i find", "use the site"])
    wants_numbers = any(t in q for t in ["prevalence", "incidence", "rate", "estimate", "trend", "number", "count", "data", "stats"])

    lines_site = [
        "Want a quick tour of the site, or a concise summary of the data?",
        "Prefer a navigation guide to that tool, or a concise data brief?",
        "Should I show you how to use the site, or give a concise summary of the data?",
        "Would a walkthrough of the site help, or a concise summary of the data?",
        "Do you want a step-through of the site, or a concise data overview?",
        "Shall I explain the site’s key features, or provide a concise summary of the data?",
    ]
    lines_summary = [
        "Want a quick summary or a step-by-step walkthrough?",
        "Prefer a concise brief or a deeper guided walkthrough?",
        "Would you like a short summary or an in-depth explanation?",
        "Should I keep it brief, or walk you through it step by step?",
        "Want a high-level summary or a detailed walkthrough?",
        "Prefer a concise recap or a structured, step-by-step guide?",
    ]
    lines_data = [
        "Should I summarize the data, or focus on explaining the trends?",
        "Want just the headline figures, or the context behind them?",
        "Prefer the key numbers, or what they mean for decisions?",
        "Do you want the topline stats, or a deeper interpretation?",
        "Shall I give a concise summary of the data, or unpack the drivers?",
        "Would you like the main figures, or an explanation of the implications?",
    ]

    if has_ref_site and (wants_how or not wants_numbers):
        return random.choice(lines_site)
    if wants_numbers:
        return random.choice(lines_data)

    if mode == "summary":
        return random.choice(lines_summary)
    if has_sources:
        return random.choice(lines_summary)
    return "Want a quick summary or a step-by-step walkthrough?"


# ---------- URL detection (history) ----------
def _extract_first_url_from_history(history_raw) -> str | None:
    for it in reversed(history_raw or []):
        try:
            if (it.get("type") or "").upper() != "TEXT":
                continue
            if (it.get("sentBy") or "").upper() != "BOT":
                continue
            msg = (it.get("message") or "")
            m = _ANY_URL_RE.search(msg)
            if m:
                return m.group(0)
        except Exception:
            continue
    return None


# ---------- Summarization (PDF) ----------
def _kb_retrieve_for_doc(prompt: str, doc_url_hint: str, k: int = 20) -> tuple[str, list[dict]]:
    all_text, all_sources = _kb_retrieve(prompt, cfg.KNOWLEDGE_BASE_ID, k)
    if not (all_text or all_sources):
        return "", []
    hint = _basename_from_url(doc_url_hint)
    bias_prompt = f"{hint} {prompt}".strip()
    text2, sources2 = _kb_retrieve(bias_prompt, cfg.KNOWLEDGE_BASE_ID, k)
    preferred_sources = [s for s in (sources2 or []) if _basename_from_url(s.get('url') or "").lower() == hint.lower()]
    if preferred_sources:
        return text2, preferred_sources
    filtered_sources = [s for s in (all_sources or []) if _basename_from_url(s.get('url') or "").lower() == hint.lower()]
    return (all_text if filtered_sources else all_text), (filtered_sources or all_sources)


def _stream_summary_from_chunks(connection_id: str, prompt: str, doc_url: str, history_messages: list[dict] | None = None):
    kb_text, kb_sources = _kb_retrieve_for_doc(prompt, doc_url, k=20)
    if not kb_text:
        _end_with_error(connection_id, "I couldn’t retrieve that document’s text from the knowledge base.", 404)
        return

    user_text = (
        "You will summarize an official PDF. Use ONLY the provided snippets; do not invent facts. "
        "Write a clear, paragraph-style summary (3–6 sentences) in plain English. "
        "Do NOT include a title, headings, or bullet points—just narrative prose. "
        "If something is unclear, say so briefly.\n\n"
        f"<doc_url>{doc_url}</doc_url>\n"
        "<knowledge_snippets>\n"
        f"{kb_text}\n"
        "</knowledge_snippets>\n\n"
        f"User request: {prompt}"
    )
    messages: list[dict] = []
    if history_messages:
        messages.extend(history_messages)
    messages.append({"role": "user", "content": [{"text": user_text}]})
    system = [{"text": (cfg.SYSTEM_PROMPT or "") + "\nBe accurate and concise."}] if cfg.SYSTEM_PROMPT else [{"text": "Be accurate and concise."}]

    try:
        resp = brt.converse_stream(modelId=MODEL_ID, messages=messages, system=system)
    except ClientError as e:
        logger.error(f"Bedrock ClientError (summary): {e}")
        _end_with_error(connection_id, f"Model error: {e.response.get('Error',{}).get('Code','Unknown')}", 500)
        return

    stream = resp.get("stream")
    if not stream:
        _end_with_error(connection_id, "Model stream not available.", 500)
        return

    # --- streaming with inline linkification + stat emphasis ---
    pending = ""
    TAIL = 200  # keep a larger tail so we don't split numbers/percentages across chunks
    for ev in stream:
        if "contentBlockDelta" in ev:
            delta = (ev["contentBlockDelta"].get("delta") or {}).get("text") or ""
            pending += delta
            if len(pending) > 600 or "\n" in delta:
                safe = pending[:-TAIL]
                pending = pending[-TAIL:]
                if safe:
                    safe = _linkify_bare_urls(safe)
                    safe = _emphasize_stats(safe)
                    _send_ws(connection_id, {"type": "delta", "statusCode": 200, "format": "markdown", "text": safe})
        elif "messageStop" in ev:
            break
        elif "internalServerException" in ev or "modelStreamErrorException" in ev \
             or "throttlingException" in ev or "validationException" in ev:
            err = ev.get("internalServerException") or ev.get("modelStreamErrorException") \
                or ev.get("throttlingException") or ev.get("validationException")
            logger.error(f"Stream error (summary): {err}")
            _end_with_error(connection_id, "Model streaming error.", 500)
            return

    if pending:
        tail = _linkify_bare_urls(pending)
        tail = _emphasize_stats(tail)
        _send_ws(connection_id, {"type": "delta", "statusCode": 200, "format": "markdown", "text": tail})

    try:
        follow_up = _pick_follow_up(prompt, has_ref_site=False, has_sources=bool(kb_sources), mode="summary")
        _send_ws(connection_id, {"type": "delta", "statusCode": 200, "format": "markdown", "text": f"\n\n{follow_up}\n"})
    except Exception as e:
        logger.warning(f"Failed to append follow-up after summary: {e}")

    _send_ws(connection_id, {"type": "end", "statusCode": 200})


# ---------- WebSocket helpers ----------
def _send_ws(connection_id: str, payload: dict):
    if not ws:
        logger.error("WebSocket client not configured (URL env missing).")
    else:
        try:
            ws.post_to_connection(ConnectionId=connection_id, Data=json.dumps(payload))
        except ClientError as e:
            logger.error(f"WebSocket post_to_connection error: {e}")


def _end_with_error(connection_id: str, message: str, code: int = 500):
    _send_ws(connection_id, {"type": "error", "statusCode": code, "text": message})
    _send_ws(connection_id, {"type": "end", "statusCode": code})


# ---------- Model talk ----------
_HIV_TOKENS = {
    "hiv",
    "aids",
    "prep",
    "pre-exposure",
    "prophylaxis",
    "incidence",
    "prevalence",
    "who",
    "unaids",
    "scorecards",
    "gpc",
    "statcompiler",
    "dhis2",
    "phia",
    "agyw",
    "key",
    "populations",
    "psat",
    "shipp",
}

def _should_use_kb(prompt: str) -> bool:
    toks = set(re.findall(r"[a-z0-9\-]+", _norm(prompt)))
    return any(t in toks for t in _HIV_TOKENS)


def _runtime_relevant_resources(prompt: str, top_n: int = 4) -> list[dict]:
    resources = (_RUNTIME_KB or {}).get("resources", [])
    if not resources:
        return []
    q_tokens = set(re.findall(r"[a-z0-9\-]+", _norm(prompt)))
    scored = []
    for r in resources:
        text = " ".join([
            r.get("name", ""),
            r.get("summary", ""),
            " ".join(r.get("when_to_use", []) or []),
            " ".join(r.get("match_terms", []) or []),
            r.get("category", "")
        ]).lower()
        r_tokens = set(re.findall(r"[a-z0-9\-]+", text))
        overlap = len(q_tokens.intersection(r_tokens))
        if "agyw" in q_tokens and "agyw" in r_tokens:
            overlap += 2
        if "district" in q_tokens or "subnational" in q_tokens:
            if "sub" in r_tokens or "district" in r_tokens:
                overlap += 1
        if "prep" in q_tokens and "prep" in r_tokens:
            overlap += 2
        if "testing" in q_tokens and "statcompiler" in r.get("name","").lower():
            overlap += 1
        if overlap > 0:
            scored.append((overlap, r))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [r for _, r in scored[:max(1, top_n)]]


def _build_runtime_context(prompt: str) -> str:
    try:
        rules = "\n".join((_RUNTIME_KB or {}).get("style", {}).get("answer_rules", [])[:3])
        picks = _runtime_relevant_resources(prompt, top_n=4)
        lines = []
        for r in picks:
            name = r.get("name", "Resource")
            url = r.get("url", "")
            summary = r.get("summary", "")
            use = "; ".join(r.get("when_to_use", [])[:2]) if r.get("when_to_use") else ""
            caveat = "; ".join(r.get("caveats", [])[:1]) if r.get("caveats") else ""
            bits = [summary]
            if use:
                bits.append(f"When to use: {use}")
            if caveat:
                bits.append(f"Caveat: {caveat}")
            joined = " ".join([b for b in bits if b]).strip()
            if url:
                lines.append(f"- {name} — {joined} (URL: {url})")
            else:
                lines.append(f"- {name} — {joined}")
        rules_block = f"<answer_rules>\n{rules}\n</answer_rules>\n" if rules else ""
        picks_block = "\n".join(lines) if lines else ""
        if not (rules_block or picks_block):
            return ""
        return f"{rules_block}<runtime_resource_map>\n{picks_block}\n</runtime_resource_map>"
    except Exception:
        return ""


def _talk_with_optional_kb(connection_id: str, prompt: str, history_messages: list[dict] | None = None):
    use_kb = _should_use_kb(prompt)
    ref_url = None
    if use_kb:
        try:
            ref_url = _pick_reference_url(prompt)
            if ref_url:
                _ = _title_for_url(ref_url)
        except Exception:
            ref_url = None

    runtime_ctx = _build_runtime_context(prompt) if use_kb else ""
    kb_text, kb_sources = ("", [])
    if use_kb:
        kb_text, kb_sources = _kb_retrieve(prompt, cfg.KNOWLEDGE_BASE_ID)

    if runtime_ctx or kb_text:
        user_text = (
            "Use the following runtime routing map and brief bios to choose the right data source/tool. "
            "If helpful, consult the provided excerpts. "
            "Do not mention internal tools. "
            "CRITICAL FORMAT: Start with one plain-English sentence answering the question. "
            "Do NOT begin with a URL, a label (e.g., 'UNAIDS AIDSinfo'), or a list. "
            "Only after that sentence, you may add brief details. "
            "Do not include raw URLs in the body—tools may attach sources separately.\n"
            f"{runtime_ctx}\n"
            f"<doc_excerpts>\n{kb_text}\n</doc_excerpts>\n\n"
            f"User question: {prompt}"
        )
    else:
        user_text = (
            "Answer helpfully and accurately. If information is missing, say what would help.\n\n"
            f"User question: {prompt}"
        )

    messages: list[dict] = []
    if history_messages:
        messages.extend(history_messages)
    messages.append({"role": "user", "content": [{"text": user_text}]})
    system = [{"text": cfg.SYSTEM_PROMPT}] if cfg.SYSTEM_PROMPT else None

    sent_parts: list[str] = []
    pending = ""
    TAIL = 200

    try:
        resp = brt.converse_stream(modelId=MODEL_ID, messages=messages, system=system)
    except ClientError as e:
        logger.error(f"Bedrock ClientError: {e}")
        _end_with_error(connection_id, f"Model error: {e.response.get('Error',{}).get('Code','Unknown')}", 500)
        return

    stream = resp.get("stream")
    if not stream:
        _end_with_error(connection_id, "Model stream not available.", 500)
        return

    for ev in stream:
        if "contentBlockDelta" in ev:
            delta = (ev["contentBlockDelta"].get("delta") or {}).get("text") or ""
            pending += delta
            if len(pending) > 600 or "\n" in delta:
                safe = pending[:-TAIL]
                pending = pending[-TAIL:]
                if safe:
                    safe = _linkify_bare_urls(safe)
                    safe = _emphasize_stats(safe)
                    sent_parts.append(safe)
                    _send_ws(connection_id, {"type": "delta", "statusCode": 200, "format": "markdown", "text": safe})

        elif "messageStop" in ev:
            break
        elif "internalServerException" in ev or "modelStreamErrorException" in ev \
             or "throttlingException" in ev or "validationException" in ev:
            err = ev.get("internalServerException") or ev.get("modelStreamErrorException") \
                or ev.get("throttlingException") or ev.get("validationException")
            logger.error(f"Stream error: {err}")
            _end_with_error(connection_id, "Model streaming error.", 500)
            return

    if pending:
        tail = _linkify_bare_urls(pending)
        tail = _emphasize_stats(tail)
        sent_parts.append(tail)
        _send_ws(connection_id, {"type": "delta", "statusCode": 200, "format": "markdown", "text": tail})

    full_summary = "".join(sent_parts)

    try:
        if ref_url:
            ref_domain = urllib.parse.urlparse(ref_url).netloc.lower()
            already_contains_ref = ref_url in (full_summary or "")
            already_linked_same_domain = bool(re.search(
                r"\]\(\s*https?://[^)]*" + re.escape(ref_domain) + r"[^)]*\)",
                full_summary or "",
                flags=re.IGNORECASE
            ))
            if not (already_contains_ref or already_linked_same_domain):
                if ref_domain.endswith("aidsinfo.unaids.org"):
                    prefix = "\n\nFor the most current official prevalence statistics, see "
                    link_md = _md_link(ref_url, "UNAIDS AIDSinfo")
                else:
                    prefix = "\n\nYou can also check the official source here: "
                    link_md = _md_link(ref_url, _title_for_url(ref_url))
                _send_ws(connection_id, {
                    "type": "delta",
                    "statusCode": 200,
                    "format": "markdown",
                    "text": prefix + link_md + "\n"
                })
    except Exception as e:
        logger.warning(f"Inline suggested reference append error: {e}")

    sources_to_send = []
    if use_kb and kb_sources:
        sources_to_send.extend(kb_sources)
    if use_kb and ref_url and not sources_to_send:
        sources_to_send.append({"url": ref_url, "label": _title_for_url(ref_url)})
    sources_to_send = _dedupe_sources_best(sources_to_send)

    if sources_to_send:
        doc_snips_all = _collect_doc_snippets(prompt, k=20) if use_kb else {}
        want_keys = set()
        for s in sources_to_send:
            url = (s.get("url") or "").strip()
            if url:
                want_keys.add(_basename_from_url(url).lower())
        doc_snips = {k: v for k, v in doc_snips_all.items() if k in want_keys}
        reasons = _gen_relevance_reasons_via_model(prompt, doc_snips) if doc_snips else {}

        inline_lines = []
        for s in (sources_to_send or []):
            url = (s.get("url") or "").strip()
            base_label = (s.get("label") or _title_for_url(url) or "Source").strip()
            key = _basename_from_url(url).lower() if url else base_label.lower()
            reason = (reasons.get(key) or "").strip()
            if url:
                if reason:
                    inline_lines.append(f"- {_md_link(url, base_label + ' ⬈')} - {reason}")
                else:
                    inline_lines.append(f"- relevant to the question — {_md_link(url, base_label)}")

        if inline_lines:
            try:
                lead_in = _pick_sources_leadin(prompt)
            except Exception as e:
                logger.warning(f"Lead-in generation failed, using random fallback: {e}")
                lead_in = _random_sources_leadin()

            follow_up = _pick_follow_up(prompt, has_ref_site=bool(ref_url), has_sources=True, mode="talk")
            sources_block = (
                "\n\n&nbsp;\n\n\n"
                f"_{lead_in}_\n" +
                "\n".join(inline_lines) +
                f"\n\n{follow_up}\n"
            )
            _send_ws(connection_id, {
                "type": "delta",
                "statusCode": 200,
                "format": "markdown",
                "text": sources_block
            })

    _send_ws(connection_id, {"type": "end", "statusCode": 200})


# ---------- Handler ----------
def _os_count_keyword(keyword: str):
    return "Document counting is not implemented in this build.", "", 0


def lambda_handler(event, _context):
    try:
        connection_id = event.get("connectionId")
        prompt = (event.get("prompt") or "").strip()

        if not connection_id:
            return {"statusCode": 400, "body": "Missing connectionId"}

        if not prompt:
            _end_with_error(connection_id, "Please provide a prompt.", 400)
            return {"statusCode": 400, "body": "Empty prompt"}

        try:
            logger.info(f"START event meta: has_connection_id={bool(connection_id)}, prompt_len={len(prompt)}")
        except Exception:
            pass

        _ensure_config_loaded()

        # 1) Personal intercepts
        phit = _match_personal(prompt)
        if phit:
            answer = phit.get("answer_template") or "Got it."
            _send_ws(connection_id, {"type": "delta", "statusCode": 200, "format": "markdown", "text": answer})
            _send_ws(connection_id, {"type": "end", "statusCode": 200})
            return {"statusCode": 200, "body": "PERSONAL_KB_OK"}

        # 2) Runtime routing: link-only
        rhit = _match_runtime(prompt)
        if rhit and rhit.get("link_only"):
            url = (rhit.get("source_url") or "").strip()
            name = (rhit.get("primary_source") or "Link").strip()
            text = f"{rhit.get('answer_text') or 'Here’s the best source:'}\n\n[{name}]({url})" if url else (rhit.get('answer_text') or 'Here’s the best source.')
            _send_ws(connection_id, {"type": "delta", "statusCode": 200, "format": "markdown", "text": text})
            _send_ws(connection_id, {"type": "end", "statusCode": 200})
            return {"statusCode": 200, "body": "RUNTIME_LINK_ONLY_OK"}

        # 2.5) Summarization flow
        if any(t in (prompt or "").lower() for t in (
            "summarize", "summary of", "sum up", "tl;dr", "key findings", "key points",
            "what are the findings", "what are the main points"
        )):
            history_raw = event.get("history") or []
            history_msgs = _normalize_history_items(history_raw)
            first_url = _extract_first_url_from_history(history_raw)
            if not first_url:
                _end_with_error(connection_id, "I couldn’t find a prior link to summarize. Please paste the link or ask again after I share one.", 400)
                return {"statusCode": 400, "body": "No prior link in history"}
            _stream_summary_from_chunks(connection_id, prompt, first_url, history_messages=history_msgs)
            return {"statusCode": 200, "body": "SUMMARY_OK"}

        # 3) COUNT flow
        if _looks_like_count(prompt):
            if not (_os and cfg.OPENSEARCH_INDEX and cfg.OPENSEARCH_TEXT_FIELD and cfg.OPENSEARCH_DOC_ID_FIELD and cfg.OPENSEARCH_PAGE_FIELD):
                _end_with_error(connection_id, "Document counting is not configured.", 501)
                return {"statusCode": 501, "body": "COUNT not configured"}
            keyword = _extract_keyword(prompt)
            if not keyword:
                _end_with_error(connection_id, "I couldn't find the keyword to count. Try: how many papers mention \"cats\"?", 400)
                return {"statusCode": 400, "body": "No keyword extracted"}
            try:
                summary, details_md, _ = _os_count_keyword(keyword=keyword)
                _send_ws(connection_id, {"type": "delta", "statusCode": 200, "format": "markdown", "text": summary + "\n\n" + details_md})
                _send_ws(connection_id, {"type": "end", "statusCode": 200})
                return {"statusCode": 200, "body": "COUNT OK"}
            except Exception as e:
                logger.error(f"COUNT error: {e}", exc_info=True)
                _end_with_error(connection_id, "There was a problem counting documents.", 500)
                return {"statusCode": 500, "body": "COUNT error"}

        # 4) Normal talk
        history_raw = event.get("history") or []
        history_msgs = _normalize_history_items(history_raw)
        try:
            logger.info(f"History received: items={len(history_raw)}, used_text_turns={len(history_msgs)}")
        except Exception:
            pass

        _talk_with_optional_kb(connection_id, prompt, history_messages=history_msgs)
        return {"statusCode": 200, "body": "OK"}

    except Exception as e:
        logger.error(f"Fatal handler error: {e}", exc_info=True)
        cid = event.get("connectionId")
        if cid:
            _end_with_error(cid, "Internal error.", 500)
        return {"statusCode": 500, "body": "Internal error"}
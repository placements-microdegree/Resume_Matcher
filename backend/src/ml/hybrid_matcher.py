#!/usr/bin/env python3
import json
import math
import os
import re
import sys
from collections import Counter

STOPWORDS = {
    'a','an','and','any','are','as','at','be','but','by','for','from','have','if','in','into','is','it','of',
    'on','or','our','the','their','them','this','to','we','will','with','you'
}
GENERIC_TERMS = {
    'ability','candidate','collaboration','communication','deliver','developer','engineering','engineer','experience',
    'good','great','knowledge','looking','must','need','preferred','required','responsible','role','skills','solutions',
    'strong','team','using','work','working','years'
}

EMBEDDING_MODEL_NAME = os.getenv('EMBEDDING_MODEL_NAME', 'sentence-transformers/all-MiniLM-L6-v2')
RERANK_MODEL_NAME = os.getenv('RERANK_MODEL_NAME', 'cross-encoder/ms-marco-MiniLM-L-6-v2')

_EMBEDDER = None
_RERANKER = None
_NLP = None
_RAPIDFUZZ = None


def clamp(value, low=0.0, high=100.0):
    return max(low, min(high, float(value)))


def to_rounded(value):
    return round(float(value or 0.0), 1)


def normalize(text):
    return str(text or '').lower()


def normalize_spaces(text):
    return re.sub(r'\s+', ' ', normalize(text).replace('\r', ' ').replace('\n', ' ')).strip()


def normalize_term(raw):
    value = normalize(raw).strip()
    value = re.sub(r'[()]', ' ', value)
    value = re.sub(r'\s+', ' ', value).strip()

    mapping = {
        'node.js': 'nodejs',
        'node js': 'nodejs',
        'next.js': 'nextjs',
        'next js': 'nextjs',
        'react.js': 'react',
        'react js': 'react',
        'c#': 'csharp',
        'c sharp': 'csharp',
        'c++': 'cplusplus',
        'c plus plus': 'cplusplus',
        '.net': 'dotnet',
        'dot net': 'dotnet',
        'ci/cd': 'cicd',
        'ci cd': 'cicd',
        'cicd pipeline': 'cicd',
        'vpcs': 'vpc',
        'google cloud': 'gcp',
        'microsoft azure': 'azure',
    }
    return mapping.get(value, value)


def tokenize(text):
    value = normalize(text)
    value = (
        value.replace('node.js', 'nodejs')
        .replace('next.js', 'nextjs')
        .replace('react.js', 'react')
        .replace('ci/cd', 'cicd')
        .replace('c++', 'cplusplus')
        .replace('c#', 'csharp')
    )
    tokens = re.split(r'[^a-z0-9#+/-]+', value)
    out = []
    for token in tokens:
        term = normalize_term(token)
        if term:
            out.append(term)
    return out


def unique_terms(values):
    seen = set()
    out = []
    for value in values or []:
        term = normalize_term(value)
        if not term or term in seen:
            continue
        seen.add(term)
        out.append(term)
    return out


def extract_significant_tokens(text, max_items=16):
    counts = Counter()
    for token in tokenize(text):
        if len(token) < 3:
            continue
        if token in STOPWORDS or token in GENERIC_TERMS:
            continue
        if re.fullmatch(r'\d+', token):
            continue
        counts[token] += 1

    ranked = sorted(counts.items(), key=lambda item: (-item[1], -len(item[0]), item[0]))
    return [item[0] for item in ranked[:max_items]]


def term_token_variants(term):
    value = normalize_term(term)
    if not value:
        return []

    variants = []
    variants.append([part for part in value.split(' ') if part] if ' ' in value else [value])
    if '/' in value:
        variants.append([part for part in value.split('/') if part])

    extra = {
        'nodejs': [['node', 'js']],
        'nextjs': [['next', 'js']],
        'react': [['reactjs']],
        'azure': [['microsoft', 'azure']],
        'gcp': [['google', 'cloud']],
        'csharp': [['c#'], ['c', 'sharp']],
        'cplusplus': [['c++'], ['cpp'], ['c', 'plus', 'plus']],
        'dotnet': [['.net'], ['dot', 'net']],
        'cicd': [['ci', 'cd'], ['ci/cd']],
        'vpc': [['vpcs']],
    }
    variants.extend(extra.get(value, []))

    deduped = []
    seen = set()
    for variant in variants:
        key = ' '.join(variant)
        if not key or key in seen:
            continue
        seen.add(key)
        deduped.append(variant)
    return deduped


def has_term(token_set, token_string, term):
    for variant in term_token_variants(term):
        if len(variant) == 1:
            if variant[0] in token_set:
                return True
            continue
        if f" {' '.join(variant)} " in token_string:
            return True
    return False


def score_experience(required_experience, experience_used):
    minimum = float(required_experience or 0.0)
    if minimum <= 0:
        return 100.0
    if experience_used is None or not math.isfinite(float(experience_used)):
        return 20.0
    years = float(experience_used)
    if years >= minimum:
        return 100.0
    ratio = max(0.0, min(1.0, years / minimum))
    return 20.0 + ratio * 80.0


def apply_experience_score_cap(score, required_experience, experience_used):
    minimum = float(required_experience or 0.0)
    if minimum <= 0:
        return float(score or 0.0)

    next_score = float(score or 0.0)
    if experience_used is None or not math.isfinite(float(experience_used)):
        return min(next_score, 59.9)

    years = float(experience_used)
    if years >= minimum:
        return next_score

    ratio = years / minimum
    if ratio < 0.5:
        return min(next_score, 44.9)
    return min(next_score, 74.9)


def bucket_for_score(score):
    if score >= 75:
        return 'high'
    if score >= 45:
        return 'medium'
    return 'low'


def format_experience_note(required_experience, experience_used):
    minimum = float(required_experience or 0.0)
    if minimum <= 0:
        return None
    if experience_used is None or not math.isfinite(float(experience_used)):
        return f'Resume does not clearly show the {minimum:g}+ years requested.'

    years = float(experience_used)
    if years >= minimum:
        return f'Experience clears the {minimum:g}+ year requirement.'
    return f'Resume shows about {years:g} years against the {minimum:g}+ year target.'

def build_summary(bucket, matched_requirements, missing_requirements, experience_note):
    top_matches = (matched_requirements or [])[:3]
    top_gaps = (missing_requirements or [])[:2]

    if bucket == 'high':
        headline = (
            f"Strong overlap on {', '.join(top_matches)}."
            if top_matches
            else 'Strong overall alignment with the job description.'
        )
        return f'{headline} {experience_note}'.strip() if experience_note else headline

    if bucket == 'medium':
        headline = (
            f"Partial match with {', '.join(top_matches)}."
            if top_matches
            else 'Partial overlap with the job description.'
        )
        gap = f" Biggest gaps: {', '.join(top_gaps)}." if top_gaps else ''
        text = f'{headline}{gap}'
        if experience_note:
            text = f'{text} {experience_note}'
        return text.strip()

    headline = (
        f"Limited overlap so far. Missing visible evidence for {', '.join(top_gaps)}."
        if top_gaps
        else 'Limited overlap with the requested role.'
    )
    return f'{headline} {experience_note}'.strip() if experience_note else headline


def build_improvement_suggestions(matched_requirements, missing_requirements, required_experience, experience_used):
    suggestions = []

    if missing_requirements:
        suggestions.append(
            'Add clear evidence for ' + ', '.join(missing_requirements[:3]) + ' if you have that experience.'
        )

    if matched_requirements:
        suggestions.append(
            'Move ' + ', '.join(matched_requirements[:3]) + ' closer to the resume summary or latest project bullets.'
        )

    minimum = float(required_experience or 0.0)
    if minimum > 0 and (experience_used is None or not math.isfinite(float(experience_used))):
        suggestions.append('Make total relevant experience easier to verify by showing dates more clearly.')
    elif minimum > 0 and float(experience_used) < minimum:
        suggestions.append(
            'Group related work together so the recruiter can quickly see relevant experience depth.'
        )

    suggestions.append('Quantify impact with metrics so the strongest matching skills feel more credible.')
    return suggestions[:4]


def build_improvement_message(file_name, bucket, match, matching_summary, missing_requirements, improvement_suggestions):
    lines = [
        f"Resume: {file_name or 'Candidate'}",
        f"Current match: {round(float(match or 0.0))}% ({(bucket or 'low').upper()})",
    ]

    if matching_summary:
        lines.append(f'Summary: {matching_summary}')
    if missing_requirements:
        lines.append('Missing or weak areas: ' + ', '.join(missing_requirements))

    if improvement_suggestions:
        lines.append('Suggested improvements:')
        for suggestion in improvement_suggestions:
            lines.append(f'- {suggestion}')

    return '\n'.join(lines)


def extract_experience_from_explicit_years(text):
    explicit_re = re.compile(r'(\d{1,2}(?:\.\d{1,2})?)\s*\+?\s*(?:years?|yrs?)\b')
    values = [float(m.group(1)) for m in explicit_re.finditer(text or '')]
    return max(values) if values else None


def parse_month_year(value):
    text = str(value or '').strip().lower()
    if not text:
        return None

    if re.search(r'(present|current|now)', text):
        now = __import__('datetime').datetime.now()
        return now.year, now.month - 1

    mm = re.fullmatch(r'(\d{1,2})/(\d{4})', text)
    if mm:
        month = int(mm.group(1))
        year = int(mm.group(2))
        if 1 <= month <= 12:
            return year, month - 1
        return None

    months = {
        'jan': 0, 'january': 0, 'feb': 1, 'february': 1, 'mar': 2, 'march': 2,
        'apr': 3, 'april': 3, 'may': 4, 'jun': 5, 'june': 5, 'jul': 6, 'july': 6,
        'aug': 7, 'august': 7, 'sep': 8, 'sept': 8, 'september': 8, 'oct': 9,
        'october': 9, 'nov': 10, 'november': 10, 'dec': 11, 'december': 11,
    }
    my = re.fullmatch(r'([a-z]{3,9})\s+(\d{4})', text)
    if my:
        month = months.get(my.group(1))
        return (int(my.group(2)), month) if month is not None else None

    yyyy = re.fullmatch(r'(\d{4})', text)
    if yyyy:
        return int(yyyy.group(1)), 0

    return None


def normalize_range_bounds(raw_start, raw_end, start_obj, end_obj):
    start = start_obj[0] * 12 + start_obj[1]
    end = end_obj[0] * 12 + end_obj[1]

    if re.fullmatch(r'\d{4}', str(raw_end).strip()):
        end = int(raw_end) * 12 + 11
    if re.fullmatch(r'\d{4}', str(raw_start).strip()):
        start = int(raw_start) * 12

    if end < start:
        start, end = end, start
    if end - start > 12 * 80:
        return None
    return start, end


def merge_month_ranges(ranges):
    if not ranges:
        return []
    ranges = sorted(ranges, key=lambda item: item[0])
    merged = []
    for start, end in ranges:
        if not merged:
            merged.append([start, end])
            continue
        prev = merged[-1]
        if start <= prev[1] + 1:
            prev[1] = max(prev[1], end)
        else:
            merged.append([start, end])
    return merged


def extract_experience_from_date_ranges(text):
    token = (
        r'(?:present|current|now|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|'
        r'jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|'
        r'dec(?:ember)?)\s+\d{4}|\d{1,2}/\d{4}|\d{4})'
    )
    pattern = re.compile(rf'({token})\s*(?:-|\\u2013|\\u2014|to)\s*({token})')

    ranges = []
    for m in pattern.finditer(normalize(text)):
        start_obj = parse_month_year(m.group(1))
        end_obj = parse_month_year(m.group(2))
        if not start_obj or not end_obj:
            continue
        normalized = normalize_range_bounds(m.group(1), m.group(2), start_obj, end_obj)
        if normalized:
            ranges.append(normalized)

    if not ranges:
        return None

    months = 0
    for start, end in merge_month_ranges(ranges):
        months += end - start + 1

    years = months / 12.0
    if not math.isfinite(years) or years <= 0:
        return None
    return round(years, 1)


def extract_experience_years(text):
    value = normalize(text)
    explicit = extract_experience_from_explicit_years(value)
    date_range = extract_experience_from_date_ranges(value)

    if explicit is None and date_range is None:
        return None
    if explicit is None:
        return date_range
    if date_range is None:
        return explicit
    return max(explicit, date_range)


def chunk_text(text, max_words=120, overlap_words=24, max_chunks=20):
    words = str(text or '').split()
    if not words:
        return []
    if len(words) <= max_words:
        return [' '.join(words)]

    chunks = []
    start = 0
    while start < len(words) and len(chunks) < max_chunks:
        end = min(len(words), start + max_words)
        chunk = ' '.join(words[start:end]).strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(words):
            break
        start = max(0, end - overlap_words)
    return chunks


def cosine_similarity_from_normalized(v1, v2):
    return float(sum(float(a) * float(b) for a, b in zip(v1, v2)))


def sigmoid(value):
    value = max(-40.0, min(40.0, float(value)))
    return 1.0 / (1.0 + math.exp(-value))

def require_dependencies():
    try:
        import sentence_transformers  # noqa: F401
    except Exception:
        return 'Missing python dependency: sentence-transformers. Install with: pip install -r backend/requirements.txt'

    try:
        import rapidfuzz  # noqa: F401
    except Exception:
        return 'Missing python dependency: rapidfuzz. Install with: pip install -r backend/requirements.txt'

    try:
        import spacy  # noqa: F401
    except Exception:
        return 'Missing python dependency: spacy. Install with: pip install -r backend/requirements.txt'

    return None


def load_spacy_model():
    global _NLP
    if _NLP is not None:
        return _NLP

    import spacy

    try:
        _NLP = spacy.load('en_core_web_sm')
    except Exception:
        _NLP = spacy.blank('en')
        if 'sentencizer' not in _NLP.pipe_names:
            _NLP.add_pipe('sentencizer')
    return _NLP


def load_models():
    global _EMBEDDER, _RERANKER, _RAPIDFUZZ
    if _EMBEDDER is not None and _RERANKER is not None and _RAPIDFUZZ is not None:
        return _EMBEDDER, _RERANKER, _RAPIDFUZZ

    from rapidfuzz import fuzz, process
    from sentence_transformers import CrossEncoder, SentenceTransformer

    _EMBEDDER = SentenceTransformer(EMBEDDING_MODEL_NAME)
    _RERANKER = CrossEncoder(RERANK_MODEL_NAME)
    _RAPIDFUZZ = {'fuzz': fuzz, 'process': process}
    return _EMBEDDER, _RERANKER, _RAPIDFUZZ


def extract_spacy_phrases(text, nlp, max_items=220):
    if not text:
        return []

    doc = nlp(str(text)[:30000])
    phrases = []

    for ent in getattr(doc, 'ents', []):
        value = normalize_spaces(ent.text)
        if value and 2 <= len(value) <= 80:
            phrases.append(value)

    try:
        for chunk in doc.noun_chunks:
            value = normalize_spaces(chunk.text)
            if value and 2 <= len(value) <= 80:
                phrases.append(value)
    except Exception:
        pass

    seen = set()
    deduped = []
    for phrase in phrases:
        if phrase in seen:
            continue
        seen.add(phrase)
        deduped.append(phrase)
        if len(deduped) >= max_items:
            break
    return deduped


def build_candidate_phrases(resume_text, nlp):
    tokens = tokenize(resume_text)
    filtered = [
        token
        for token in tokens
        if len(token) >= 2 and token not in STOPWORDS and token not in GENERIC_TERMS
    ]

    phrases = set(filtered[:450])
    bound = min(len(filtered), 320)
    for i in range(bound):
        if i + 1 < bound:
            phrases.add(f'{filtered[i]} {filtered[i + 1]}')
        if i + 2 < bound:
            phrases.add(f'{filtered[i]} {filtered[i + 1]} {filtered[i + 2]}')
        if len(phrases) > 1200:
            break

    for phrase in extract_spacy_phrases(resume_text, nlp, max_items=180):
        normalized_phrase = normalize_term(phrase)
        if normalized_phrase:
            phrases.add(normalized_phrase)
        if len(phrases) > 1400:
            break

    return list(phrases)


def term_match_score(term, token_set, token_string, candidate_phrases, fuzzy_tools):
    normalized_term = normalize_term(term)
    if not normalized_term:
        return 0.0

    if has_term(token_set, token_string, normalized_term):
        return 1.0

    process = fuzzy_tools['process']
    fuzz = fuzzy_tools['fuzz']
    best = process.extractOne(
        normalized_term,
        candidate_phrases,
        scorer=fuzz.token_set_ratio,
        score_cutoff=55,
    )
    if not best:
        return 0.0

    score = float(best[1])
    if score >= 92:
        return 1.0
    if score >= 84:
        return 0.9
    if score >= 75:
        return 0.75
    if score >= 67:
        return 0.6
    return 0.0


def compute_keyword_signal(must_terms, optional_terms, resume_text, candidate_phrases, fuzzy_tools):
    resume_tokens = tokenize(resume_text)
    token_set = set(resume_tokens)
    token_string = f" {' '.join(resume_tokens)} "

    must_scores = {}
    optional_scores = {}

    for term in must_terms:
        must_scores[term] = term_match_score(term, token_set, token_string, candidate_phrases, fuzzy_tools)

    for term in optional_terms:
        optional_scores[term] = term_match_score(term, token_set, token_string, candidate_phrases, fuzzy_tools)

    must_avg = (sum(must_scores.values()) / len(must_scores) * 100.0) if must_scores else 100.0
    optional_avg = (sum(optional_scores.values()) / len(optional_scores) * 100.0) if optional_scores else 0.0

    if must_scores:
        keyword_signal = must_avg * 0.8 + optional_avg * 0.2
    elif optional_scores:
        keyword_signal = optional_avg
    else:
        keyword_signal = 0.0

    return clamp(keyword_signal), must_scores, optional_scores


def compute_entity_signal(job_description, candidate_phrases, fuzzy_tools, nlp):
    job_phrases = [
        normalize_term(value)
        for value in extract_spacy_phrases(job_description, nlp, max_items=80)
    ]
    job_phrases = [value for value in job_phrases if value]
    if not job_phrases:
        return 0.0

    resume_phrase_set = set(candidate_phrases)
    process = fuzzy_tools['process']
    fuzz = fuzzy_tools['fuzz']
    matched = 0.0

    for phrase in job_phrases:
        if phrase in resume_phrase_set:
            matched += 1.0
            continue

        best = process.extractOne(phrase, candidate_phrases, scorer=fuzz.token_set_ratio, score_cutoff=70)
        if not best:
            continue

        score = float(best[1])
        if score >= 90:
            matched += 1.0
        elif score >= 82:
            matched += 0.8
        elif score >= 75:
            matched += 0.55

    return clamp((matched / len(job_phrases)) * 100.0)


def compute_semantic_signal(job_vector, resume_chunks, embedder):
    if not resume_chunks:
        return 0.0, []

    chunk_vectors = embedder.encode(
        resume_chunks,
        convert_to_numpy=True,
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    similarities = [
        max(0.0, cosine_similarity_from_normalized(job_vector, vector))
        for vector in chunk_vectors
    ]
    if not similarities:
        return 0.0, []

    top = sorted(similarities, reverse=True)[:3]
    score = (max(similarities) * 0.65 + (sum(top) / len(top)) * 0.35) * 100.0
    return clamp(score), similarities


def compute_rerank_signal(job_description, resume_chunks, reranker):
    if not resume_chunks:
        return 0.0, []

    pairs = [(job_description, chunk) for chunk in resume_chunks]
    raw_scores = reranker.predict(pairs)
    probabilities = []
    for value in raw_scores:
        score = float(value)
        if score < 0.0 or score > 1.0:
            score = sigmoid(score)
        probabilities.append(clamp(score * 100.0))

    if not probabilities:
        return 0.0, []

    top = sorted(probabilities, reverse=True)[:3]
    score = max(probabilities) * 0.7 + (sum(top) / len(top)) * 0.3
    return clamp(score), probabilities


def extract_evidence_highlights(resume_chunks, semantic_similarities, rerank_scores, max_items=3):
    if not resume_chunks:
        return []

    combined = []
    for idx, chunk in enumerate(resume_chunks):
        semantic = semantic_similarities[idx] * 100.0 if idx < len(semantic_similarities) else 0.0
        rerank = rerank_scores[idx] if idx < len(rerank_scores) else 0.0
        combined.append((idx, semantic * 0.45 + rerank * 0.55))

    combined.sort(key=lambda item: item[1], reverse=True)
    highlights = []
    for idx, _ in combined[: max_items * 2]:
        text = normalize_spaces(resume_chunks[idx])
        if not text:
            continue
        snippet = text[:220].rstrip()
        if len(text) > 220:
            snippet += '...'
        if snippet in highlights:
            continue
        highlights.append(snippet)
        if len(highlights) >= max_items:
            break
    return highlights

def infer_recommendation(bucket, final_score):
    if bucket == 'high':
        return 'Strong shortlist candidate.'
    if bucket == 'medium':
        if final_score >= 60:
            return 'Worth recruiter review with moderate alignment.'
        return 'Potential fit but requires deeper manual screening.'
    return 'Low overlap for this JD right now.'


def build_match_result(
    file_name,
    resume_text,
    experience_override,
    required_experience,
    must_terms,
    optional_terms,
    job_description,
    job_vector,
    embedder,
    reranker,
    fuzzy_tools,
    nlp,
):
    candidate_phrases = build_candidate_phrases(resume_text, nlp)

    keyword_score, must_scores, optional_scores = compute_keyword_signal(
        must_terms, optional_terms, resume_text, candidate_phrases, fuzzy_tools
    )
    entity_score = compute_entity_signal(job_description, candidate_phrases, fuzzy_tools, nlp)

    resume_chunks = chunk_text(resume_text)
    semantic_score, semantic_similarities = compute_semantic_signal(job_vector, resume_chunks, embedder)
    rerank_score, rerank_scores = compute_rerank_signal(job_description, resume_chunks, reranker)

    requirement_score = clamp(keyword_score * 0.75 + entity_score * 0.25)
    semantic_combo = clamp(semantic_score * 0.55 + rerank_score * 0.45)

    experience_found = extract_experience_years(resume_text)
    override = None
    if experience_override is not None:
        try:
            parsed_override = float(experience_override)
            if math.isfinite(parsed_override):
                override = parsed_override
        except Exception:
            override = None

    experience_used = override if override is not None else experience_found
    experience_score = score_experience(required_experience, experience_used)

    raw_score = clamp(semantic_combo * 0.6 + requirement_score * 0.25 + experience_score * 0.15)
    final_score = apply_experience_score_cap(raw_score, required_experience, experience_used)
    bucket = bucket_for_score(final_score)

    matched_must = [term for term, score in must_scores.items() if score >= 0.75]
    missing_must = [term for term, score in must_scores.items() if score < 0.6]
    matched_optional = [term for term, score in optional_scores.items() if score >= 0.75]
    missing_optional = [term for term, score in optional_scores.items() if score < 0.6]

    matched_requirements = unique_terms(matched_must + matched_optional)[:8]
    missing_requirements = unique_terms(missing_must + missing_optional)[:8]

    experience_note = format_experience_note(required_experience, experience_used)
    improvement_suggestions = build_improvement_suggestions(
        matched_requirements,
        missing_requirements,
        required_experience,
        experience_used,
    )
    matching_summary = build_summary(
        bucket,
        matched_requirements,
        missing_requirements,
        experience_note,
    )
    improvement_message = build_improvement_message(
        file_name,
        bucket,
        final_score,
        matching_summary,
        missing_requirements,
        improvement_suggestions,
    )

    evidence = extract_evidence_highlights(resume_chunks, semantic_similarities, rerank_scores, max_items=3)

    return {
        'fileName': file_name,
        'match': to_rounded(final_score),
        'bucket': bucket,
        'recommendation': infer_recommendation(bucket, final_score),
        'matchedRequirements': matched_requirements,
        'missingRequirements': missing_requirements,
        'improvementSuggestions': improvement_suggestions,
        'improvementMessage': improvement_message,
        'matchingSummary': matching_summary,
        'generatedResponse': matching_summary,
        'evidenceHighlights': evidence,
        'experienceFound': experience_found,
        'experienceOverride': override,
        'experienceUsed': experience_used,
        'scoreBreakdown': {
            'semanticScore': to_rounded(semantic_score),
            'rerankScore': to_rounded(rerank_score),
            'keywordScore': to_rounded(keyword_score),
            'entityScore': to_rounded(entity_score),
            'requirementScore': to_rounded(requirement_score),
            'experienceScore': to_rounded(experience_score),
        },
        'analysisProvider': 'hybrid-ml',
        'analysisModel': f'{EMBEDDING_MODEL_NAME} + {RERANK_MODEL_NAME}',
        'analysisCached': False,
    }


def run(payload):
    dependency_error = require_dependencies()
    if dependency_error:
        return {'ok': False, 'kind': 'dependency_error', 'error': dependency_error}

    try:
        embedder, reranker, fuzzy_tools = load_models()
        nlp = load_spacy_model()
    except Exception as exc:
        return {'ok': False, 'kind': 'model_load_error', 'error': f'Failed to load ML models: {exc}'}

    job_description = str(payload.get('jobDescription') or '').strip()
    if not job_description:
        return {'ok': False, 'kind': 'validation_error', 'error': 'jobDescription is required'}

    required_experience = float(payload.get('requiredExperience') or 0.0)
    job_profile = payload.get('jobProfile') or {}
    resumes = payload.get('resumes') or []

    must_terms = unique_terms(job_profile.get('mustHaveKeywords') or [])
    optional_terms = unique_terms(job_profile.get('niceToHaveKeywords') or [])
    fallback_terms = unique_terms(job_profile.get('fallbackKeywords') or [])

    if not must_terms and fallback_terms:
        must_terms = fallback_terms[:8]
    if not must_terms and not optional_terms:
        must_terms = extract_significant_tokens(job_description, max_items=10)

    try:
        job_vector = embedder.encode(
            [job_description],
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        )[0]
    except Exception as exc:
        return {'ok': False, 'kind': 'embedding_error', 'error': f'Failed to compute job embedding: {exc}'}

    results = []
    for item in resumes:
        file_name = str((item or {}).get('fileName') or '').strip() or 'Candidate'
        resume_text = str((item or {}).get('text') or '')
        experience_override = (item or {}).get('experienceOverride')

        try:
            result = build_match_result(
                file_name=file_name,
                resume_text=resume_text,
                experience_override=experience_override,
                required_experience=required_experience,
                must_terms=must_terms,
                optional_terms=optional_terms,
                job_description=job_description,
                job_vector=job_vector,
                embedder=embedder,
                reranker=reranker,
                fuzzy_tools=fuzzy_tools,
                nlp=nlp,
            )
        except Exception as exc:
            return {'ok': False, 'kind': 'resume_processing_error', 'error': f'Failed to score {file_name}: {exc}'}

        results.append(result)

    return {
        'ok': True,
        'results': results,
        'meta': {
            'matcher': 'hybrid-ml-v1',
            'embeddingModel': EMBEDDING_MODEL_NAME,
            'rerankModel': RERANK_MODEL_NAME,
        },
    }


def print_json(data):
    sys.stdout.write(json.dumps(data))
    sys.stdout.flush()


def main():
    if '--ping' in sys.argv:
        print_json({'ok': True, 'python': sys.version.split()[0]})
        return 0

    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {}
    except Exception as exc:
        print_json({'ok': False, 'kind': 'invalid_json', 'error': str(exc)})
        return 0

    result = run(payload)
    print_json(result)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())


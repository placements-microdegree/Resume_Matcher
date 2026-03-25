# Hybrid Matcher Setup

Install Python dependencies:

```bash
pip install -r backend/requirements.txt
```

Optional but recommended for better phrase extraction:

```bash
python -m spacy download en_core_web_sm
```

On first hybrid run, embedding and reranker model weights are downloaded from
Hugging Face and cached locally.

Runtime note:
- Node wrapper defaults to offline cache mode (`HYBRID_HF_OFFLINE=1`) to avoid
  slow network retries in restricted environments.
- Set `HYBRID_HF_OFFLINE=0` if you want the backend to fetch/update models online.

The backend route `POST /api/resumes/match` will try this hybrid engine first and
automatically fall back to the rules-based matcher when dependencies or models are unavailable.

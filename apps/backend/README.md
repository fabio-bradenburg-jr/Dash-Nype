# FastAPI Backend

## Demo credentials

- `admin@nype.demo` / `admin123`
- `operator@nype.demo` / `operator123`

## Run

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

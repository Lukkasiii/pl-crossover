# Build context is the repo root (see docker-compose.yml) -- api/app imports
# nothing outside api/, but the image also needs data/pl.db to serve real data.
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY api/ api/
COPY data/pl.db data/pl.db

EXPOSE 8000
CMD ["uvicorn", "api.app.main:app", "--host", "0.0.0.0", "--port", "8000"]

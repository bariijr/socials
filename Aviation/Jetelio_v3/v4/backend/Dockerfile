# syntax=docker/dockerfile:1
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1
WORKDIR /app

FROM base AS builder
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential libpq-dev gdal-bin libgdal-dev \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --upgrade pip \
    && /opt/venv/bin/pip install -r requirements.txt

FROM builder AS test
# tesseract-ocr (task #109) — its own apt layer, separate from builder's
# gdal/build-essential layer, so integration tests can exercise real OCR
# without invalidating the slower compile-toolchain layer.
RUN apt-get update && apt-get install -y --no-install-recommends \
        tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*
COPY requirements-dev.txt .
RUN /opt/venv/bin/pip install -r requirements-dev.txt
ENV PATH="/opt/venv/bin:$PATH"
COPY . .
CMD ["pytest", "-q"]

FROM base AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 gdal-bin tesseract-ocr curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 1001 appgroup \
    && useradd -u 1001 -g appgroup -m -s /usr/sbin/nologin appuser
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY . .
RUN chown -R appuser:appgroup /app && chmod +x /app/docker-entrypoint.sh
USER appuser
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=20s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')" || exit 1
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

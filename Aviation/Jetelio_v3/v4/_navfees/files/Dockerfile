# Jetelio Navigation Fee Calculator - Production Docker Image

FROM python:3.11-slim

LABEL maintainer="Insider Tech Sol"
LABEL description="Jetelio v4 Navigation Fee Calculator Service"

# Install system dependencies (including GEOS for Shapely)
RUN apt-get update && apt-get install -y \
    libgeos-dev \
    libgeos-3.11.1 \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements first (for better caching)
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir \
    -r requirements.txt \
    gunicorn \
    uvicorn[standard]

# Copy application code
COPY app/ ./app/
COPY main.py .

# Create non-root user for security
RUN useradd -m -u 1000 jetelio && \
    mkdir -p /app/logs /app/data && \
    chown -R jetelio:jetelio /app

USER jetelio

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Default environment
ENV API_HOST=0.0.0.0
ENV API_PORT=8000
ENV LOG_LEVEL=INFO

EXPOSE 8000

# Run with Gunicorn for production
CMD ["gunicorn", \
     "-w", "4", \
     "-k", "uvicorn.workers.UvicornWorker", \
     "-b", "0.0.0.0:8000", \
     "--access-logfile", "-", \
     "--error-logfile", "-", \
     "--log-level", "info", \
     "main:app"]

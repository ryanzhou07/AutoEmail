FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

WORKDIR /app

COPY requirements.txt ./
RUN python -m pip install --no-cache-dir --disable-pip-version-check -r requirements.txt

RUN addgroup --system app && adduser --system --ingroup app app

COPY --chown=app:app . ./backend

USER app

EXPOSE 8080

CMD ["sh", "-c", "exec python -m uvicorn backend.main:app --host 0.0.0.0 --port \"${PORT:-8080}\""]

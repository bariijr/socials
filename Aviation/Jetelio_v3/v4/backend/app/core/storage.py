"""S3/MinIO-compatible object storage for aircraft (and future trip)
documents. boto3 is synchronous — every call here runs in a worker thread
via asyncio.to_thread so the event loop is never blocked.

Downloads are proxied through the API (see app.api.routers.aircraft_documents)
rather than handed out as presigned URLs: the S3_ENDPOINT_URL used
server-to-server is the internal docker-network hostname ("minio:9000"),
which a browser outside that network can't resolve — a presigned URL built
from it would simply fail to load.
"""

import asyncio
import functools
import uuid

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError

from app.config import get_settings


@functools.lru_cache
def _client():
    settings = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        config=BotoConfig(signature_version="s3v4"),
    )


def _bucket() -> str:
    return get_settings().s3_bucket_documents


async def ensure_bucket_exists() -> None:
    """Idempotent — matches app.services.settings_service.ensure_seeded's
    call-at-startup pattern. MinIO has no bucket-creation init step in
    docker-compose, so the app owns this.
    """

    def _ensure() -> None:
        client = _client()
        bucket = _bucket()
        try:
            client.head_bucket(Bucket=bucket)
        except ClientError:
            client.create_bucket(Bucket=bucket)

    await asyncio.to_thread(_ensure)


def build_key(*, aircraft_id: str, filename: str) -> str:
    safe_name = filename.replace("/", "_").replace("\\", "_")
    return f"aircraft/{aircraft_id}/{uuid.uuid4().hex}_{safe_name}"


def build_entity_key(*, entity_prefix: str, entity_id: str, filename: str) -> str:
    """Same shape as build_key, generalized beyond aircraft — used by
    app.services.document_service for Person/Party documents (task #89).
    build_key is left untouched rather than generalized in place, so
    existing aircraft document keys/behavior can't be affected by this.
    """
    safe_name = filename.replace("/", "_").replace("\\", "_")
    return f"{entity_prefix}/{entity_id}/{uuid.uuid4().hex}_{safe_name}"


async def upload_file(key: str, content: bytes, content_type: str | None) -> None:
    def _upload() -> None:
        _client().put_object(
            Bucket=_bucket(), Key=key, Body=content, ContentType=content_type or "application/octet-stream"
        )

    await asyncio.to_thread(_upload)


async def download_file(key: str) -> bytes:
    def _download() -> bytes:
        response = _client().get_object(Bucket=_bucket(), Key=key)
        return response["Body"].read()

    return await asyncio.to_thread(_download)


async def delete_file(key: str) -> None:
    def _delete() -> None:
        _client().delete_object(Bucket=_bucket(), Key=key)

    await asyncio.to_thread(_delete)

# ADR 0002: Storage Backend Abstraction

## Status
Accepted

## Context
The 课记开发文档 lists three storage options: local disk, MinIO, and Alibaba Cloud OSS. The current implementation uses only local disk with `FileResponse` to serve video files. Future deployments may need object storage.

## Decision
Keep local disk for the current phase, but design an abstract storage backend interface that allows swapping implementations.

## Rationale
- Local disk is sufficient for development and single-server deployment
- The `GET /api/videos/{id}/media` endpoint already acts as a single choke point for video access — swapping the underlying storage only requires changing this one endpoint (from `FileResponse` to an HTTP redirect to a pre-signed URL)
- Abstracting storage behind a `StorageBackend` protocol (with `save()`, `get_url()`, `delete()`) isolates the rest of the codebase from storage decisions

## Consequences
- A `StorageBackend` interface should be created before adding object storage support
- The current `video_utils.py` (ffmpeg wrappers) and `pipeline.py` (file path construction) are coupled to local filesystem paths — these will need refactoring when the storage backend changes
- The `FileResponse` in `api/video.py` should eventually be replaced with a redirect to a backend-generated URL

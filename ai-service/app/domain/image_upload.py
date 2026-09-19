"""
---------------------------------------------
[Feature]: 진단용 이미지 데이터 URL 검증 (순수 함수)

[Description]
- 멀티파트 파일 업로드 대신 base64 데이터 URL(JSON 필드)로 받으므로, 형식과
  크기를 여기서 먼저 거른다. python-multipart 없이 이 한 함수가 트러스트 바운더리다.

[Usage]
```python
validate_image_data_url("data:image/png;base64,AAAA")  # -> None (문제 없음)
```
---
"""

#: base64라 원본 바이트의 ~1.37배. 10MB 사진까지 통과시키는 넉넉한 상한.
MAX_IMAGE_DATA_URL_CHARS = 15_000_000

_ALLOWED_PREFIXES = (
    "data:image/jpeg;base64,",
    "data:image/png;base64,",
    "data:image/webp;base64,",
)


def validate_image_data_url(data_url: str) -> str | None:
    """문제 없으면 None, 있으면 사용자에게 보여줄 오류 메시지."""
    if not data_url.startswith(_ALLOWED_PREFIXES):
        return "jpeg·png·webp 형식의 이미지만 업로드할 수 있습니다."
    if len(data_url) > MAX_IMAGE_DATA_URL_CHARS:
        return "이미지 용량이 너무 큽니다."
    return None

from app.domain.image_upload import validate_image_data_url


def test_valid_jpeg_data_url_passes():
    assert validate_image_data_url("data:image/jpeg;base64,AAAA") is None


def test_non_image_data_url_rejected():
    assert validate_image_data_url("data:text/plain;base64,AAAA") is not None


def test_plain_base64_without_prefix_rejected():
    assert validate_image_data_url("AAAA") is not None


def test_oversized_data_url_rejected():
    oversized = "data:image/png;base64," + "A" * 15_000_000
    assert validate_image_data_url(oversized) is not None

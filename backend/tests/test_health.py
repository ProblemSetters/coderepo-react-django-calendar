from tests.support import ApiClient


def test_reports_the_database_as_connected():
    response = ApiClient().get("/api/v1/health")

    assert response.status_code == 200
    assert response.json()["data"] == {"status": "ok", "database": "connected"}

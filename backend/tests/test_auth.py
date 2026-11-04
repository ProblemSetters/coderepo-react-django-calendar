from tests.support import PASSWORD, ApiClient, error_code, sign_in, sign_in_workspace


def test_signs_in_with_the_right_password_and_refuses_a_wrong_one(people):
    signed_in = ApiClient().post("/api/v1/auth/login", {"email": people.alex.email, "password": PASSWORD})
    refused = ApiClient().post("/api/v1/auth/login", {"email": people.alex.email, "password": "not-the-password"})

    assert signed_in.status_code == 200
    assert signed_in.json()["data"]["account"]["email"] == people.alex.email
    assert isinstance(signed_in.json()["data"]["token"], str)
    assert refused.status_code == 401
    assert error_code(refused) == "INVALID_CREDENTIALS"


def test_refuses_a_request_with_no_token_or_a_bad_token(people):
    no_token = ApiClient().get("/api/v1/calendars")
    bad_token = ApiClient("not-a-real-token").get("/api/v1/calendars")

    assert no_token.status_code == 401
    assert error_code(no_token) == "AUTH_REQUIRED"
    assert bad_token.status_code == 401
    assert error_code(bad_token) == "INVALID_TOKEN"


def test_needs_a_profile_before_it_reads_any_calendar_data(people):
    workspace_token = sign_in_workspace(people.alex)

    response = ApiClient(workspace_token).get("/api/v1/calendars")

    assert response.status_code == 401
    assert error_code(response) == "PROFILE_REQUIRED"


def test_switches_only_to_a_profile_the_account_may_use(people):
    workspace = ApiClient(sign_in_workspace(people.alex))

    profiles = workspace.get("/api/v1/profiles")
    own = workspace.post("/api/v1/auth/switch-profile", {"profileId": str(people.alex.id)})
    someone_else = workspace.post("/api/v1/auth/switch-profile", {"profileId": str(people.jordan.id)})
    calendars = ApiClient(own.json()["data"]["token"]).get("/api/v1/calendars")

    assert [profile["name"] for profile in profiles.json()["data"]] == ["Alex Morgan"]
    assert own.status_code == 200
    assert calendars.status_code == 200
    assert someone_else.status_code == 403
    assert error_code(someone_else) == "PROFILE_FORBIDDEN"


def test_returns_the_signed_in_account_and_signs_out(people):
    token = ApiClient(sign_in(people.alex))

    session = token.get("/api/v1/auth/session")
    signed_out = token.post("/api/v1/auth/logout")

    assert session.status_code == 200
    assert session.json()["data"]["account"]["email"] == people.alex.email
    assert signed_out.status_code == 204

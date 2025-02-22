import pytest
import requests
import time


HOST_PREFIX = "http://127.0.0.1:30870"
API_PREFIX = HOST_PREFIX + "/api"

ADMIN_USERNAME = "admin@example.com"
ADMIN_PW = "PASSW0RD!"

VIEWER_USERNAME = "viewer@example.com"
VIEWER_PW = "viewerPASSW0RD!"

CRAWLER_USERNAME = "crawler@example.com"
CRAWLER_PW = "crawlerPASSWORD!"

_admin_config_id = None
_crawler_config_id = None


@pytest.fixture(scope="session")
def admin_auth_headers():
    while True:
        r = requests.post(
            f"{API_PREFIX}/auth/jwt/login",
            data={
                "username": ADMIN_USERNAME,
                "password": ADMIN_PW,
                "grant_type": "password",
            },
        )
        data = r.json()
        try:
            return {"Authorization": f"Bearer {data['access_token']}"}
        except:
            print("Waiting for admin_auth_headers")
            time.sleep(5)


@pytest.fixture(scope="session")
def admin_aid(admin_auth_headers):
    while True:
        r = requests.get(f"{API_PREFIX}/archives", headers=admin_auth_headers)
        data = r.json()
        try:
            return data["archives"][0]["id"]
        except:
            print("Waiting for admin_aid")
            time.sleep(5)


@pytest.fixture(scope="session")
def admin_crawl_id(admin_auth_headers, admin_aid):
    # Start crawl.
    crawl_data = {
        "runNow": True,
        "name": "Admin Test Crawl",
        "config": {"seeds": ["https://webrecorder.net/"], "limit": 1},
    }
    r = requests.post(
        f"{API_PREFIX}/archives/{admin_aid}/crawlconfigs/",
        headers=admin_auth_headers,
        json=crawl_data,
    )
    data = r.json()

    global _admin_config_id
    _admin_config_id = data["added"]

    crawl_id = data["run_now_job"]
    # Wait for it to complete and then return crawl ID
    while True:
        r = requests.get(
            f"{API_PREFIX}/archives/{admin_aid}/crawls/{crawl_id}/replay.json",
            headers=admin_auth_headers,
        )
        data = r.json()
        if data["state"] == "complete":
            return crawl_id
        time.sleep(5)


@pytest.fixture(scope="session")
def admin_config_id(admin_crawl_id):
    return _admin_config_id


@pytest.fixture(scope="session")
def viewer_auth_headers(admin_auth_headers, admin_aid):
    requests.post(
        f"{API_PREFIX}/archives/{admin_aid}/add-user",
        json={
            "email": VIEWER_USERNAME,
            "password": VIEWER_PW,
            "name": "newviewer",
            "role": 10,
        },
        headers=admin_auth_headers,
    )
    r = requests.post(
        f"{API_PREFIX}/auth/jwt/login",
        data={
            "username": VIEWER_USERNAME,
            "password": VIEWER_PW,
            "grant_type": "password",
        },
    )
    data = r.json()
    access_token = data.get("access_token")
    return {"Authorization": f"Bearer {access_token}"}


@pytest.fixture(scope="session")
def crawler_auth_headers(admin_auth_headers, admin_aid):
    requests.post(
        f"{API_PREFIX}/archives/{admin_aid}/add-user",
        json={
            "email": CRAWLER_USERNAME,
            "password": CRAWLER_PW,
            "name": "new-crawler",
            "role": 20,
        },
        headers=admin_auth_headers,
    )
    r = requests.post(
        f"{API_PREFIX}/auth/jwt/login",
        data={
            "username": CRAWLER_USERNAME,
            "password": CRAWLER_PW,
            "grant_type": "password",
        },
    )
    data = r.json()
    access_token = data.get("access_token")
    return {"Authorization": f"Bearer {access_token}"}


@pytest.fixture(scope="session")
def crawler_userid(crawler_auth_headers):
    r = requests.get(f"{API_PREFIX}/users/me", headers=crawler_auth_headers)
    return r.json()["id"]


@pytest.fixture(scope="session")
def crawler_crawl_id(crawler_auth_headers, admin_aid):
    # Start crawl.
    crawl_data = {
        "runNow": True,
        "name": "Crawler User Test Crawl",
        "config": {"seeds": ["https://webrecorder.net/"], "limit": 1},
    }
    r = requests.post(
        f"{API_PREFIX}/archives/{admin_aid}/crawlconfigs/",
        headers=crawler_auth_headers,
        json=crawl_data,
    )
    data = r.json()

    global _crawler_config_id
    _crawler_config_id = data["added"]

    crawl_id = data["run_now_job"]
    # Wait for it to complete and then return crawl ID
    while True:
        r = requests.get(
            f"{API_PREFIX}/archives/{admin_aid}/crawls/{crawl_id}/replay.json",
            headers=crawler_auth_headers,
        )
        data = r.json()
        if data["state"] == "complete":
            return crawl_id
        time.sleep(5)


@pytest.fixture(scope="session")
def crawler_config_id(crawler_crawl_id):
    return _crawler_config_id

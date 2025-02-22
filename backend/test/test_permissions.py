import requests

from .conftest import API_PREFIX


def test_admin_get_archive_crawls(admin_auth_headers, admin_aid, admin_crawl_id):
    r = requests.get(
        f"{API_PREFIX}/archives/{admin_aid}/crawls", headers=admin_auth_headers
    )
    data = r.json()
    crawls = data["crawls"]
    crawl_ids = []
    assert len(crawls) > 0
    for crawl in crawls:
        assert crawl["aid"] == admin_aid
        crawl_ids.append(crawl["id"])
    assert admin_crawl_id in crawl_ids


def test_viewer_get_archive_crawls(viewer_auth_headers, admin_aid, admin_crawl_id):
    r = requests.get(
        f"{API_PREFIX}/archives/{admin_aid}/crawls", headers=viewer_auth_headers
    )
    data = r.json()
    crawls = data["crawls"]
    crawl_ids = []
    assert len(crawls) > 0
    for crawl in crawls:
        assert crawl["aid"] == admin_aid
        crawl_ids.append(crawl["id"])
    assert admin_crawl_id in crawl_ids


def test_viewer_get_crawl(viewer_auth_headers, admin_aid, admin_crawl_id):
    r = requests.get(
        f"{API_PREFIX}/archives/{admin_aid}/crawls/{admin_crawl_id}",
        headers=viewer_auth_headers,
    )
    data = r.json()
    assert data["id"] == admin_crawl_id
    assert data["aid"] == admin_aid


def test_viewer_get_crawl_replay(viewer_auth_headers, admin_aid, admin_crawl_id):
    r = requests.get(
        f"{API_PREFIX}/archives/{admin_aid}/crawls/{admin_crawl_id}/replay.json",
        headers=viewer_auth_headers,
    )
    data = r.json()
    assert data["id"] == admin_crawl_id
    assert data["aid"] == admin_aid
    assert data["resources"]

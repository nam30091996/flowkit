"""Randomized browser headers to avoid detection."""
import random
import time
from agent.config import USER_AGENTS, CHROME_VERSIONS, BROWSER_VALIDATIONS, CLIENT_DATA


def random_headers() -> dict:
    """Generate randomized browser-like headers for Google Flow API."""
    validation = random.choice(BROWSER_VALIDATIONS)
    client_data = random.choice(CLIENT_DATA)

    # Lock to Windows since the user is on Windows to avoid session mismatch
    platform, mobile = '"Windows"', "?0"
    ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    chrome_ver = '"Google Chrome";v="120", "Chromium";v="120"'

    return {
        "accept": "*/*",
        "accept-language": "en-US,en;q=0.9",
        "content-type": "text/plain;charset=UTF-8",
        "origin": "https://labs.google",
        "priority": "u=1, i",
        "referer": "https://labs.google/",
        "sec-ch-ua": f'"Not;A=Brand";v="99", {chrome_ver}',
        "sec-ch-ua-mobile": mobile,
        "sec-ch-ua-platform": platform,
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "cross-site",
        "user-agent": ua,
        "x-browser-channel": "stable",
        "x-browser-copyright": "Copyright 2025 Google LLC. All rights reserved.",
        "x-browser-validation": validation,
        "x-browser-year": "2025",
        "x-client-data": client_data,
    }

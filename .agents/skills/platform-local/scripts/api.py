#!/usr/bin/env python3
"""本地后端调用助手：自动用测试 admin 登录，再调用接口。

命令行：
  api.py check                                  健康检查
  api.py call <服务> <命令> ['<json>']           调 /service/<服务>/<命令>，自动补 UserID
  api.py post <路径> ['<json>']                  调任意 POST 接口，如 /misc/money/book/list

代码里复用：
  sys.path.insert(0, '<本目录>'); from api import Client
  c = Client(); c.call('todone', 'getDirTree')

环境变量：PLATFORM_API（默认 http://127.0.0.1:8080）、PLATFORM_USER（默认 admin）、
PLATFORM_PWD（默认读 backend/test/base_setting.toml 的 admin_pwd）。
"""
from __future__ import annotations

import http.cookiejar
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
BASE = os.environ.get('PLATFORM_API', 'http://127.0.0.1:8080').rstrip('/')


def _password() -> str:
    if os.environ.get('PLATFORM_PWD'):
        return os.environ['PLATFORM_PWD']
    text = (ROOT / 'backend/test/base_setting.toml').read_text(encoding='utf-8')
    m = re.search(r'^admin_pwd\s*=\s*"([^"]*)"', text, re.M)
    if not m:
        raise SystemExit('base_setting.toml 里没有 admin_pwd')
    return m.group(1)


class Client:
    def __init__(self, user: str | None = None, login: bool = True):
        self.user = user or os.environ.get('PLATFORM_USER', 'admin')
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        if login:
            r = self.post('/login', {'username': self.user, 'password': _password()})
            if r.get('code') != 0:
                raise SystemExit(f'登录失败：{r}')

    def post(self, path: str, body: dict | None = None) -> dict:
        req = urllib.request.Request(BASE + path, json.dumps(body or {}).encode(), {'Content-Type': 'application/json'})
        return json.loads(self.opener.open(req, timeout=60).read() or b'{}')

    def call(self, service: str, cmd: str, body: dict | None = None, check: bool = True):
        """调用 RPC 服务；默认在 code != 0 时抛错，返回 data。"""
        r = self.post(f'/service/{service}/{cmd}', {'UserID': self.user, **(body or {})})
        if check and r.get('code') != 0:
            raise RuntimeError(f'{service}/{cmd} 失败：{r}')
        return r.get('data') if check else r


def main(argv: list[str]) -> None:
    if not argv or argv[0] in ('-h', '--help'):
        print(__doc__)
        return
    op = argv[0]
    if op == 'check':
        try:
            print(json.dumps(Client(login=False).post('/check'), ensure_ascii=False))
        except OSError as e:
            raise SystemExit(f'后端没在运行（{BASE}）：{e}')
        return
    c = Client()
    if op == 'call' and len(argv) >= 3:
        body = json.loads(argv[3]) if len(argv) > 3 else {}
        print(json.dumps(c.call(argv[1], argv[2], body, check=False), ensure_ascii=False, indent=2))
    elif op == 'post' and len(argv) >= 2:
        body = json.loads(argv[2]) if len(argv) > 2 else {}
        print(json.dumps(c.post(argv[1], body), ensure_ascii=False, indent=2))
    else:
        print(__doc__)


if __name__ == '__main__':
    main(sys.argv[1:])

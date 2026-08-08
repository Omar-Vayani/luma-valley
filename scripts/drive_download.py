#!/usr/bin/env python3
"""Download a whole Drive folder's files (media) into a local dir."""
import json
import os
import sys
import urllib.request

TOKEN = json.load(open('/root/.hermes/google_token.json')).get('access_token') or json.load(open('/root/.hermes/google_token.json')).get('token')


def api(url):
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {TOKEN}'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def download(folder_id, dest_dir):
    os.makedirs(dest_dir, exist_ok=True)
    page = None
    while True:
        url = f'https://www.googleapis.com/drive/v3/files?q=%27{folder_id}%27+in+parents&pageSize=200'
        if page:
            url += f'&pageToken={page}'
        d = api(url)
        for f in d.get('files', []):
            if f.get('mimeType') == 'application/vnd.google-apps.folder':
                continue
            fname = f['name']
            out = os.path.join(dest_dir, fname)
            if os.path.exists(out) and os.path.getsize(out) > 0:
                print(f'skip  {fname}')
                continue
            media = f'https://www.googleapis.com/drive/v3/files/{f["id"]}?alt=media'
            req = urllib.request.Request(media, headers={'Authorization': f'Bearer {TOKEN}'})
            try:
                with urllib.request.urlopen(req, timeout=120) as r, open(out, 'wb') as fh:
                    fh.write(r.read())
                print(f'ok    {fname} ({os.path.getsize(out)/1024:.0f}KB)')
            except Exception as e:
                print(f'FAIL  {fname}: {e}')
        page = d.get('nextPageToken')
        if not page:
            break


if __name__ == '__main__':
    download(sys.argv[1], sys.argv[2])
    print('DONE')

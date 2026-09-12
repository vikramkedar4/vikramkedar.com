# vikramkedar.com

Vikram Kedar's personal site: who he is, the series he makes, and a front door
to the video archive at acesandbabes.com. One static HTML file, no build step.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | The whole site: markup and styles in one file |
| `assets/*.jpg` | Poster frames for the featured pieces (copies from the Command Center repo) |
| `CNAME` | Custom domain for GitHub Pages (`vikramkedar.com`); GitHub manages it, don't delete |
| `.nojekyll` | Tells GitHub Pages to serve files as-is |

## Editing

Open `index.html`. The sections are marked: hero, featured (three pieces),
series (one card per series), how it works, now. The "Now" list and the
numbers in the hero are the parts that go stale; update them when the archive
changes. Commit and push `main`; GitHub Pages republishes within a minute.

## Hosting

- **Site:** GitHub Pages from `main`, root folder, custom domain `vikramkedar.com`
  (set 2026-09-10; GitHub keeps the `CNAME` file in the repo for it). The github.io
  URL redirects here.
- **Domain:** GoDaddy. DNS was pointed at GitHub Pages on 2026-09-10 with these records:

| Type | Name | Value |
| --- | --- | --- |
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | vikramkedar4.github.io |

The GoDaddy "WebsiteBuilder Site" `A` record was removed the same day and the
`www` CNAME was pointed at `vikramkedar4.github.io`. Leave `_dmarc`,
`_domainconnect`, `pay`, `NS` and `SOA` alone.

## The www certificate, and how to actually force a reissue

The first certificate was minted while the `www` CNAME still pointed at the apex
instead of `vikramkedar4.github.io`, so it covered `vikramkedar.com` only and
`https://www.vikramkedar.com` failed. Fixing the DNS did not fix the certificate.

**What does not work** (learned the hard way on 2026-09-12, three attempts):
removing the custom domain and re-adding *the same value*. Even with an
eight-minute gap, GitHub reuses the existing certificate for that domain and
never issues a new request. The API reports `state: approved` the whole time
and `domains` never changes.

**What does work:** set the custom domain to a *different* value, then back.
Changing it to `www.vikramkedar.com` forces a genuine new request, and setting
it back to the apex leaves a queued request covering both names:

```
R=repos/vikramkedar4/vikramkedar.com/pages
gh api -X PUT $R -F https_enforced=false
echo '{"cname": "www.vikramkedar.com"}' | gh api -X PUT $R --input -   # forces a new request
sleep 60
echo '{"cname": "vikramkedar.com"}'     | gh api -X PUT $R --input -   # back to apex canonical
gh api $R --jq '.https_certificate'     # expect state new/authorization_pending, both domains
# once state is "approved" and both domains are listed:
gh api -X PUT $R -F https_enforced=true
```

**Do not leave it pointed at `www` while you wait.** In that configuration the
apex 301s to `www`, and until the new certificate lands *neither* hostname works
over HTTPS. Revert to the apex immediately; the old apex certificate keeps
serving and the new two-domain request stays queued behind it.

Provisioning is not instant. `new` and `authorization_pending` are normal and
can sit for an hour or more; GitHub documents up to 24 hours. Polling does not
speed it up. Check with the command above, not in a loop.

## Local preview

```
python3 -m http.server 8081
```

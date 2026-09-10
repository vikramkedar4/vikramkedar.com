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

The GoDaddy "WebsiteBuilder Site" `A` record was removed the same day. The
`www` CNAME currently points at `vikramkedar.com.` instead of
`vikramkedar4.github.io`; that works (it chains to the A records) but the
github.io target is the recommended form. Leave `_dmarc`, `_domainconnect`,
`pay`, `NS` and `SOA` alone.

## Local preview

```
python3 -m http.server 8081
```

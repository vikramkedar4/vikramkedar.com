# vikramkedar.com

Vikram Kedar's personal site: who he is, the series he makes, and a front door
to the video archive at acesandbabes.com. One static HTML file, no build step.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | The whole site: markup and styles in one file |
| `assets/*.jpg` | Poster frames for the featured pieces (copies from the Command Center repo) |
| `CNAME` | Not present yet. GitHub adds it when the custom domain is set, after DNS moves |
| `.nojekyll` | Tells GitHub Pages to serve files as-is |

## Editing

Open `index.html`. The sections are marked: hero, featured (three pieces),
series (one card per series), how it works, now. The "Now" list and the
numbers in the hero are the parts that go stale; update them when the archive
changes. Commit and push `main`; GitHub Pages republishes within a minute.

## Hosting

- **Site:** GitHub Pages from `main`, root folder. Until DNS moves it lives at
  https://vikramkedar4.github.io/vikramkedar.com/. Once the GoDaddy records below
  are in place, set the custom domain (`gh api -X PUT repos/vikramkedar4/vikramkedar.com/pages -f cname=vikramkedar.com`,
  or Settings → Pages → Custom domain) and tick Enforce HTTPS when the certificate is issued.
- **Domain:** GoDaddy. DNS must point at GitHub Pages:

| Type | Name | Value |
| --- | --- | --- |
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | vikramkedar4.github.io |

Remove the two GoDaddy website-builder `A` records for `@` (76.223.105.230 and
13.248.243.5) when adding these, and leave the `_dmarc` TXT record alone.
Until DNS changes, the same site is reachable at https://vikramkedar4.github.io/vikramkedar.com/.

## Local preview

```
python3 -m http.server 8081
```

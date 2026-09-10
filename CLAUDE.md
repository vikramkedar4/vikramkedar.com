# CLAUDE.md — vikramkedar.com

Vikram Kedar's personal site. One static `index.html` (styles inline), a few
poster jpgs in `assets/`, and GitHub Pages config. Built 2026-09-10 from the
workspace index in `~/Claude/CLAUDE.md`; it describes the series in the
sibling projects and links every card into the Command Center
(`~/Claude/AcesandBabes`, live at acesandbabes.com) with `#p=` and `#v=`
deep links.

## Rules

- Keep it one file, no framework, no build. Fonts from Google Fonts, same
  pair as the Command Center (Playfair Display + DM Sans), same gold.
- Light and dark both matter: tokens are on `:root` and redefined under
  `prefers-color-scheme: dark`. Never hard-code a color outside the tokens.
- Nothing personal beyond name and city. No email on the page unless Vikram
  asks for it (contact goes through GitHub).
- Numbers in the hero (videos, series, minutes, latest) mirror the Command
  Center stats; update both when videos are added.
- Links into the archive use the Command Center's ids: `#v=<file name
  without .mp4>` for a video, `#p=<project name, URL-encoded>` for a filter.
  Check `videos/videos.js` in the AcesandBabes repo for the current names.

## Hosting

GitHub repo `vikramkedar4/vikramkedar.com`, GitHub Pages from `main` (root),
custom domain `vikramkedar.com` (live since 2026-09-10; the `CNAME` file is
GitHub's, keep it). DNS at GoDaddy points at GitHub's four A records; the
table is in README.md. GoDaddy's website builder ("Launching Soon" page) was
the previous site and must stay unpublished.

## Test

Serve the folder (`python3 -m http.server 8081`), check both color schemes,
400px and desktop widths, no horizontal scroll, every link resolves.

# Pushing this repository to rexautistikonlabs/scientificlab

The standalone CONTINUUM history is ready and verified. It could not be pushed from the
session that produced it: the git proxy only injects credentials for repositories in the
session's authorized set, and `rexautistikonlabs/scientificlab` was not in it.

Two ways to finish. The remote is empty, so no force and no merge is needed either way.

## A · From a Claude Code session

Add `rexautistikonlabs/scientificlab` to the session's repository sources, then:

    cd /home/user/scientificlab
    git push -u origin main

## B · From your own machine

Take `continuum-standalone.bundle` (248 kB, contains all six commits), then:

    git clone continuum-standalone.bundle scientificlab
    cd scientificlab
    git remote set-url origin https://github.com/rexautistikonlabs/scientificlab.git
    git push -u origin main

## Verify after pushing

    npm ci
    npm run build      # → dist/, ~236 kB gzipped
    npm run preview    # http://localhost:4180

In the browser console, `CONTINUUM.api.signature()` must return
`{ count: 1740, hash: '238ca549' }`. If it does not, the identity layer has drifted and
saved projects and external datasets will not resolve against it.

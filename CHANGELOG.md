# CHANGELOG

## v0.2.0

### changed

#### web / core / docs

<!-- rellog:entry:start -->
<!-- rellog:body:start -->

remove `versionResolver` config; latest-install behavior is now decided by whether `archive.nameTemplate` contains `{version}` (no more `VERSION` release asset needed)

<!-- rellog:body:end -->

Refs:

- https://github.com/tooppoo/installerer/issues/111
<!-- rellog:entry:end -->

## v0.1.1

### fixed

#### core

<!-- rellog:entry:start -->
<!-- rellog:body:start -->

fix `chmod` not work on BSD

<!-- rellog:body:end -->
<!-- rellog:entry:end -->

### added

#### web / cli / core

<!-- rellog:entry:start -->
<!-- rellog:body:start -->

add `standard install example` for installer to `installerer --help` and web ui

<!-- rellog:body:end -->
<!-- rellog:entry:end -->

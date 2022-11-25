// Configure default behaviors similar to npm defaults
// Patterns that are always ignored
export const alwaysIgnore = ["node_modules"]
// Patterns that are always included
export const alwaysInclude = [
  "package.json",
  "README",
  "CHANGELOG",
  "LICENSE",
  "LICENCE",
]
// Patterns that are ignored by default if no ignore file is specified
export const defaultIgnore = [
  ".*.swp",
  "._*",
  ".DS_Store",
  ".git",
  ".hg",
  ".npmrc",
  ".lock-wscript",
  ".svn",
  ".wafpickle-*",
  "config.gypi",
  "CVS",
  "npm-debug.log",
]

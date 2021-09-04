// Configure default behaviors similar to npm defaults
module.exports = {
  // Patterns that are always ignored
  alwaysIgnore: ["node_modules"],
  // Patterns that are always included
  alwaysInclude: ["package.json", "README", "CHANGELOG", "LICENSE", "LICENCE"],
  // Patterns that are ignored by default if no ignore file is specified
  defaultIgnore: [
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
  ],
}

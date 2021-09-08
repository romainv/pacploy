const command = {
  command: "zip [dir]",
  describe: "Create a zip archive of a package",
  builder: (yargs) => {
    yargs
      .positional("dir", {
        describe: "Path to the package to zip",
        type: "string",
        default: process.cwd(),
      })
      .option("bundle-dir", {
        type: "string",
        describe: "The parent folder under which to add bundled dependencies",
        default: "node_modules",
      })
      .option("zip-to", {
        alias: "to",
        type: "string",
        describe: [
          "The destination path of the zip file.",
          "If omitted, will generate a name based on the package dir",
        ].join(" "),
      })
      .option("format", {
        type: "string",
        describe: "The archive format to use ('zip' or 'tar')",
        default: "zip",
      })
  },
}

export default command

const command = {
  command: "zip [dir]",
  describe: "Creates a zip archive from a package",
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
      })
      .option("zip-to", {
        type: "string",
        describe: [
          "The destination path of the zip file.",
          "If omitted, will generated one from the package dir",
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

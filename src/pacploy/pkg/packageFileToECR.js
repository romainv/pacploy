import { call } from "../throttle.js"
import Docker from "dockerode"
import zip from "../zip/index.js"
import { findUp } from "find-up"
import { basename, dirname } from "path"
import tmp from "tmp"
import isDir from "./isDir.js"
import getArchiveBasename from "../zip/getArchiveBasename.js"
import { URL } from "url"
import { ECRClient, GetAuthorizationTokenCommand } from "@aws-sdk/client-ecr"
import { readFileSync, existsSync } from "fs"
import credentialDefaultProvider from "../credentialDefaultProvider.js"

const docker = new Docker()

/**
 * Package a docker image to ECR if necessary
 * @param {import('./File.js').default} file The file to package
 * @param {Object} params Additional function parameters
 * @param {String} params.region The repository's region
 * @param {String} params.deployEcr An ECR repo URI to package docker images
 * @param {Boolean} [params.forceUpload=false] If true, will re-upload
 * file even if it was not updated since last upload
 * @return {Promise<Object>} The image URI and upload status
 */
export default async function packageFileToECR(
  file,
  { region, deployEcr, forceUpload = false },
) {
  // Retrieve parameters, if any
  // Resolve root directory relative to the config file
  const packagePath = await findUp([".pacployrc", "package.json"], {
    // Use file.path directly if it is a directory, otherwise dirname causes to
    // start searching from one level up
    cwd: isDir(file.path) ? file.path : dirname(file.path),
  })
  const { dockerBuild = {} } = existsSync(packagePath)
    ? JSON.parse(readFileSync(packagePath, "utf-8") || "{}")
    : {}
  // Replace references to env variables in build args
  if (typeof dockerBuild.buildargs === "object") {
    // If any build arguments were specified
    for (const [argName, argValue] of Object.entries(dockerBuild.buildargs)) {
      // Match all variable references ('${VAR}') in the current argument
      const matches = [...argValue.matchAll(/\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g)]
      // Replace all the references by their value in process.env
      let newArgValue = argValue
      for (const [ref, varName] of matches)
        newArgValue = newArgValue.replace(ref, process.env[varName] || "")
      // Update the buildargs parameters
      dockerBuild.buildargs[argName] = newArgValue
    }
  }
  // Generate a base image tag to identify it consistently across runs
  // We use a tag as a way to manage multiple images (not just multiple
  // versions of the same image) within a single Docker repository
  const imageName = `${deployEcr}:${await getArchiveBasename(file.path)}`
  // Build an archive with the image context
  if (isDir(file.path))
    // If file points to a directory, create a tarball from it
    file.path = await zip({
      zipTo: `${tmp.tmpNameSync()}.tar`,
      dir: file.path,
      format: "tar",
    })
  else if (!/.*\.(tgz$)|(tar$)|(tar\.gz$)/i.test(file.path))
    // If file points to a dockerfile (assumes any file which is not a tarball
    // is a dockerfile), create an archive with this file at the root
    file.path = await zip({
      zipTo: tmp.tmpNameSync(),
      files: new Map([[file.path, basename(file.path)]]),
      format: "tar",
    })
  // Build the image
  const buildStream = await docker.buildImage(
    file.path,
    Object.assign({ t: imageName, nocache: forceUpload }, dockerBuild),
  )
  await waitFor(buildStream)
  // Push the image to the repository (this will only push layers that have
  // been updated)
  const image = docker.getImage(imageName)
  let pushStream = await image.push({
    authconfig: await getToken(region),
  })
  const logs = await waitFor(pushStream)
  // Retrieve the image digest from the latest log entry
  const {
    aux: { Digest: hash },
  } = logs[logs.length - 1]
  // Retrieve update status (assumes nothing was updated if the last layer
  // already existed)
  const { status: statusMsg } = logs[logs.length - 3]
  const status = forceUpload
    ? "forced"
    : statusMsg === "Layer already exists"
      ? "exists"
      : "updated"
  // Return the image location and package status
  return {
    // We refer to the image by its hash so that CloudFormation can detect
    // changes (using just the image name appended by 'latest' for instance
    // wouldn't suffice to trigger an update)
    location: `${deployEcr}@${hash}`,
    status,
    hash,
  }
}

/*
 * Retrieve the auth parameters to authenticate calls to ECR
 * @param {String} region The AWS region
 * @return {Object} The auth parameters
 */
async function getToken(region) {
  const ecr = new ECRClient({
    apiVersion: "2015-09-21",
    region,
    credentialDefaultProvider,
  })
  const { authorizationData: [{ authorizationToken, proxyEndpoint }] = [] } =
    await call(
      ecr,
      ecr.send,
      // FIXME: We use a dummy registryId as the SDK throws an error if
      // registryIds is not passed (it tries to read properties of undefined).
      // A future update may make passing registryIds optional again, as it
      // seems that the permissions are not impacted
      new GetAuthorizationTokenCommand({ registryIds: ["000000000000"] }),
    )
  const [username, password] = Buffer.from(authorizationToken, "base64")
    .toString()
    .split(":")
  return {
    username,
    password,
    serveraddress: new URL(proxyEndpoint).host,
  }
}

/**
 * Wait for a dockerode stream to finish
 * @param {Object} stream The stream to wait for
 * @return {Promise<Array>} The log messages
 */
function waitFor(stream) {
  return new Promise((resolve, reject) => {
    docker.modem.followProgress(stream, (err, logs) => {
      if (err) reject(err)
      else {
        // The stream doesn't seem to reject even when an error occured
        const [{ error }] = logs.slice(-1)
        if (error)
          reject(
            logs
              .map((log) =>
                (log.error || log.stream || JSON.stringify(log)).trim(),
              )
              .join("\n"),
          )
        else resolve(logs.map((log) => log.stream || log))
      }
    })
  })
}

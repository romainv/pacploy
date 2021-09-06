import withTracker from "../../with-tracker/index.js"
import Docker from "dockerode"
import zip from "../zip/index.js"
import { findUp } from "find-up"
import { basename, dirname } from "path"
import tmp from "tmp"
import isDir from "./isDir.js"
import getArchiveBasename from "../zip/getArchiveBasename.js"
import { URL } from "url"
import AWS from "../../aws-sdk-proxy/index.js"
import { createRequire } from "module"

const require = createRequire(import.meta.url)
const docker = new Docker()

/**
 * Package a docker image to ECR if necessary
 * @param {File} file The file to package
 * @param {Object} params Additional function parameters
 * @param {String} params.region The repository's region
 * @param {String} params.deployEcr An ECR repo URI to package docker images
 * @param {Boolean} [params.forceUpload=false] If true, will re-upload
 * file even if it was not updated since last upload
 * @return {Object} The image URI and upload status
 */
async function packageFileToECR(
  file,
  { region, deployEcr, forceUpload = false }
) {
  // Retrieve parameters, if any
  const packagePath = await findUp("package.json", {
    // Use file.path directly if it is a directory, otherwise dirname causes to
    // start searching from one level up
    cwd: isDir(file.path) ? file.path : dirname(file.path),
  })
  const { dockerBuild = {} } = packagePath ? require(packagePath) : {}
  // Generate a base image tag to identify it consistently across runs
  // We use a tag as a way to manage multiple images (not just multiple
  // versions of the same image) within a single Docker repository
  const imageName = `${deployEcr}:${await getArchiveBasename(file.path)}`
  // Build an archive with the image context
  if (isDir(file.path))
    // If file points to a directory, create a tarball from it
    file.path = await zip.call(this, {
      dir: file.path,
      format: "tar",
    })
  else if (!/.*\.(tgz$)|(tar$)|(tar\.gz$)/i.test(file.path))
    // If file points to a dockerfile (assumes any file which is not a tarball
    // is a dockerfile), create an archive with this file at the root
    file.path = await zip.call(this, {
      zipTo: tmp.tmpNameSync(),
      files: new Map([[file.path, basename(file.path)]]),
      format: "tar",
    })
  // Build the image
  const buildStream = await docker.buildImage(
    file.path,
    Object.assign({ t: imageName, nocache: forceUpload }, dockerBuild)
  )
  await waitFor(buildStream)
  // Push the image to the repository (this will only push layers that have
  // been updated)
  const image = docker.getImage(imageName)
  let pushStream = await image.push({
    authconfig: await getToken.call(this, region),
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

export default withTracker()(packageFileToECR)

/*
 * Retrieve the auth parameters to authenticate calls to ECR
 * @param {String} region The AWS region
 * @return {Object} The auth parameters
 */
async function getToken(region) {
  const ecr = new AWS.ECR({ apiVersion: "2015-09-21", region })
  const {
    authorizationData: [{ authorizationToken, proxyEndpoint }],
  } = await ecr.getECRAuthorizationToken()
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
 * @return {Array} The log messages
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
                (log.error || log.stream || JSON.stringify(log)).trim()
              )
              .join("\n")
          )
        else resolve(logs.map((log) => log.stream || log))
      }
    })
  })
}

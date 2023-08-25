import listPackagedFiles from "../pkg/listPackagedFiles.js"
import getStatus from "../getStatus/index.js"

/**
 * Retrieve the list of packages files still in use by supplied stacks
 * @param {import('../params/index.js').ResolvedStackParams[]} stacks The
 * stacks to check
 * @return {Promise<Object<String, Object<String, String[]>>>} The list of
 * object keys in use by any of the stacks, grouped by region / bucket and
 * deduplicated
 */
export default async function getPackagedFilesInUse(stacks) {
  return (
    (
      await Promise.all(
        // Retrieve the list of packaged files for each stack
        stacks.map(async ({ region, stackName, deployBucket }) =>
          (await getStatus({ region, stackName })) === "NEW"
            ? []
            : await listPackagedFiles({ region, stackName, deployBucket }),
        ),
      )
    )
      // De-duplicate the files in use and group them by bucket
      .reduce((grouped, packagedFiles) => {
        for (const { region, bucket, key } of packagedFiles) {
          if (!Object.keys(grouped).includes(region)) grouped[region] = {}
          if (!Object.keys(grouped[region]).includes(bucket))
            grouped[region][bucket] = []
          if (!grouped[region][bucket].includes(key))
            grouped[region][bucket].push(key)
        }
        return grouped
      }, {})
  )
}

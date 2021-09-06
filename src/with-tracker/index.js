import Tracker from "./Tracker.js"

// Instanciate a shared tracker whose main function will be to create and
// update a progress bar
export const tracker = new Tracker({
  name: "main",
})

/**
 * Enable to track changes to an object or progress of a function
 * @param {Object} [trackerDefs] The definitions to track the function's
 * progress (see Tracker)
 * @param {Object} [options] Options to customize the withTracker behavior
 * @param {Boolean} [options.autoComplete=false] If true, withTracker functions
 * will complete their tracker upon completion. To properly benefit from this
 * feature, nested withTracker functions need to be invoked with the same
 * context as their parent, e.g. using child.call(this). Otherwise all trackable
 * functions will be children of the shared parent, which results in nested
 * functions not updating the tracker of the function who called them, and thus
 * the latter would complete too many ticks
 * @param {Tracker} [parent] If provided, the created tracker will be linked to
 * the parent
 * @return {Function} A function to call with the function or object to track.
 * This will return a proxy to the original object which will allow:
 *  - to track changes in the object properties, or values assigned to 'this'
 *    in the function context, using the specified tracker definitions
 * 	- to access key methods and properties of a progress tracker as a 'tracker'
 * 	  property of the object, and in the function's context (using
 * 	  'this.tracker' inside the function)
 */
export default function withTracker(
  trackerDefs = {},
  options = {},
  parent = tracker
) {
  return (obj) => {
    // Create a tracked version of the object
    if (typeof obj !== "function")
      // If object is not a function, return a proxy tracked by a new Tracker
      // linked to the parent
      return new Tracker({ ...trackerDefs, tracked: obj }, parent).tracked
    else {
      let childCount = 0 // Keep track of child count
      // Modify function behavior
      return new Proxy(obj, {
        // Make tracker definitions available directly
        get: (fn, name) =>
          Tracker.defs.includes(name) ? trackerDefs[name] : fn[name],
        apply: (fn, context = {}, args) => {
          // Make the function's context withTracker with a child tracker link
          childCount++
          const trackableContext = withTracker(
            // Append an id to the child tracker's name for identification
            {
              ...trackerDefs,
              init:
                typeof trackerDefs.init === "function"
                  ? // Override the init function to provide fn function args
                    function () {
                      return trackerDefs.init.apply(this, args)
                    }
                  : trackerDefs.init,
              name: trackerDefs.name
                ? `${trackerDefs.name}${childCount}`
                : trackerDefs.name,
            },
            // Forward the options
            options,
            // Link the child tracker to the calling context's tracker, if set
            (context && context.tracker) || parent
          )(context)
          // Customize function calls with the custom context
          let res = fn.apply(trackableContext, args)
          // Complete or stop the progress tracker upon function return
          if (res instanceof Promise)
            res = res
              .catch((err) => {
                trackableContext.tracker.complete() // Stop tracking
                throw err
              })
              .then((value) => {
                if (options.autoComplete) trackableContext.tracker.complete()
                else trackableContext.tracker.stop()
                return value
              })
          else {
            if (options.autoComplete) trackableContext.tracker.complete()
            else trackableContext.tracker.stop()
          }
          // Return result
          return res
        },
      })
    }
  }
}

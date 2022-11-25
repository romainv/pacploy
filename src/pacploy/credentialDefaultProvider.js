import { defaultProvider } from "@aws-sdk/credential-provider-node"

// We override the timeout for remote requests applied by the default
// credentials provider, as it often occurred that the default (1s) was not
// enough, especially when using a IAM role associated with an EC2 instance
export default defaultProvider({
  timeout: 5000,
})

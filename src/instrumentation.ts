import { patchGlobalWebStreams } from "experimental-fast-webstreams";

export function register() {
  patchGlobalWebStreams();
}

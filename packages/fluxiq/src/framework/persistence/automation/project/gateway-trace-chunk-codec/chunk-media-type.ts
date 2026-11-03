// The media type a gateway trace chunk is sealed under (lane T P3-E). The
// content protection binds the media type into the ciphertext's authenticated
// data, so a chunk's sealed bytes cannot be opened as another kind of project
// content, nor another kind of content as a chunk.

export const GATEWAY_TRACE_CHUNK_MEDIA_TYPE = "application/vnd.fluxiq.client-gateway-trace-chunk";

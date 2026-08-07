# @fluxiq/client-gateway-websocket

Browser-safe WebSocket transport for the FluxIQ client gateway.

```ts
import { FluxIQClientGatewayWebSocketClient } from "@fluxiq/client-gateway-websocket";

const client = new FluxIQClientGatewayWebSocketClient({
  client: {
    clientId: "example.client",
    clientType: "custom",
    name: "Example client"
  }
});

await client.connect();
```

The package depends only on `@fluxiq/contracts`. It does not install the FluxIQ
Node runtime, SQLite, QR generation, TypeDoc, or React.

## License

Source-available under the FluxIQ license included with this package.
Commercial rights outside its community terms are available from
[license@getfluxiq.com](mailto:license@getfluxiq.com).

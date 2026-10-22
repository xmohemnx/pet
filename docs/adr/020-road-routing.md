# 020 — Private road quotes and free map adapters

Petra targets Iraq. The owner requested free tools that can later be replaced. Leaflet uses attributed OpenStreetMap tiles only after explicit opt-in. Coordinate selection also works using labelled numeric fields without tiles. Server-side OSRM requests use a configured endpoint, bounded response sizes and deadlines; request bodies never choose a URL. Production requires an explicitly configured endpoint. The shared public demonstration endpoint is a local-development convenience, without a service guarantee.

A road quote is an immutable, actor-owned snapshot with a ten-minute booking window, rounded coordinates, road metres/seconds, geometry and server-calculated **sandbox** IQD pricing. The ride stores its quote by a composite owner foreign key. Expiry is checked at initial booking, while an idempotent replay returns the original ride. Failed routing never silently becomes a straight-line quote. Legacy local sandbox rides still use their explicitly labelled straight-line calculation.

Unbooked expired quotes are deleted by the worker; booked route data stays private to the requester and assigned verified driver. Legal retention for booked records requires an approved policy. Tile requests expose the viewer's IP and viewport to the tile provider; the interface explains that before loading tiles. OSRM receives the selected coordinates only after separate explicit consent. No location or geometry is placed into audit/outbox events.

Tests use an isolated, labelled OSRM protocol fixture. Such tests validate integration behavior, not the availability, data quality or SLA of the live public OSRM endpoint. Public endpoint validation remains blocked by the cloud egress policy until the saved network settings are published.

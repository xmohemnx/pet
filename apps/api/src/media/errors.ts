export class MediaInfrastructureError extends Error {
  constructor() {
    super('Private media service unavailable');
  }
}

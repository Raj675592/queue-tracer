import { Container, getContainer } from "@cloudflare/containers";

export class QueueTracerContainer extends Container {
  defaultPort = 5000; // matches your Dockerfile's EXPOSE 5000
  sleepAfter = "10m"; // keep it warm between requests/socket pings

  envVars = {
    MONGODB_URI: this.env?.MONGODB_URI,
    CLIENT_ORIGIN: this.env?.CLIENT_ORIGIN,
    PORT: "5000",
  };
}

export default {
  async fetch(request, env) {
    // Single named instance = one shared process for all clients,
    // which is what you want since Socket.IO + your queue state
    // need to live on the same instance.
    const container = getContainer(env.QUEUE_CONTAINER, "primary");
    return container.fetch(request);
  },
};
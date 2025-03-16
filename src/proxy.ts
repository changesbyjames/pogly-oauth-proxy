import {
  type FastifyRequest,
  type FastifyReply,
  type FastifyInstance,
} from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import httpProxy from "http-proxy";

interface Options {
  host: string;
  modules?: string[];
}

const web = async (
  req: FastifyRequest,
  reply: FastifyReply,
  hook?: (body: Buffer) => Buffer,
) => {
  req.server.proxyRequests.set(req.raw, { req, reply, hook });
  req.server.proxy.web(req.raw, reply.raw, {}, (err) => {
    console.error(`${req.id} failed to proxy`, err);
    reply.send(new Error("Failed to proxy"));
  });
  return reply;
};

const ws = async (req: FastifyRequest, reply: FastifyReply) => {
  reply.hijack();
  req.server.proxy.ws(req.raw, req.socket, null, {}, (err) => {
    console.error(`${req.id} failed to proxy WS`, err);
    req.socket.destroy();
  });
  return reply;
};

const signature = (req: FastifyRequest) =>
  [
    req.id,
    req.method,
    req.ws && "(WS)",
    req.url.replace(/\?(.*)token=[^&]+/, "?$1token=[redacted]"),
  ]
    .filter(Boolean)
    .join(" ");

const proxy = async (server: FastifyInstance, opts: Options) => {
  server.decorate(
    "proxy",
    httpProxy.createProxyServer({
      target: opts.host,
      changeOrigin: true,
      secure: false,
      autoRewrite: true,
      selfHandleResponse: true,
    }),
  );

  server.decorate("proxyRequests", new Map());

  server.proxy.on("proxyRes", (proxyRes, rawReq) => {
    const { req, reply, hook } = server.proxyRequests.get(rawReq) ?? {};
    server.proxyRequests.delete(rawReq);
    if (!req || !reply) return;

    const body: Buffer[] = [];
    proxyRes.on("data", (chunk: Buffer) => {
      body.push(chunk);
    });
    proxyRes.on("end", () => {
      reply.headers(proxyRes.headers);
      reply.status(proxyRes.statusCode ?? 500);
      reply.send(hook ? hook(Buffer.concat(body)) : Buffer.concat(body));
    });
  });

  server.all("/*", {
    handler: async (req, reply) => {
      if (req.method === "OPTIONS") {
        console.log(`${signature(req)} preflight request`);
        return web(req, reply);
      }

      // TODO: Allow overlay route to bypass auth

      const user = req.session.get("user");
      if (!user) {
        console.log(`${signature(req)} unauthorized request`);
        return reply.status(401).send(new Error("Unauthorized"));
      }

      console.log(
        `${signature(req)} authenticated as ${user.id} (${user.username})`,
      );

      if (req.ws) return ws(req, reply);

      return web(req, reply, (body) => {
        if (req.method === "GET" && /^\/($|\?)/.test(req.url)) {
          const html = new TextDecoder().decode(body);
          const domain = `ws://${req.host}`;
          const modules = (opts.modules ?? ["pogly"]).map((module) => ({
            domain,
            module,
          }));
          return Buffer.from(
            new TextEncoder().encode(
              html.replace(
                /<body>/,
                [
                  "<body>",
                  "<script>",
                  `window.localStorage.setItem("nickname", ${JSON.stringify(user.username)});`,
                  `window.localStorage.setItem("stdbToken", ${JSON.stringify(user.pogly)});`,
                  `const modules = ${JSON.stringify(modules)};`,
                  `window.localStorage.setItem("poglyQuickSwap", JSON.stringify(modules));`,
                  `const current = modules.find(({ module }) => module === window.localStorage.getItem("stdbConnectModule"));`,
                  `window.localStorage.setItem("stdbConnectModule", current ? current.module : modules[0].module);`,
                  `window.localStorage.setItem("stdbConnectDomain", current ? current.domain : modules[0].domain);`,
                  "</script>",
                ].join(""),
              ),
            ),
          );
        }
        return body;
      });
    },
  });

  // Enable WS, but after routes are defined
  // as we want a single handler for both HTTP and WS
  server.register(fastifyWebsocket);
};

export default proxy;

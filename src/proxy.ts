import {
  type FastifyRequest,
  type FastifyReply,
  type FastifyInstance,
} from "fastify";
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
        console.log(`${req.id} ${req.method} ${req.url} preflight request`);
        return web(req, reply);
      }

      // TODO: Allow overlay route to bypass auth

      const user = req.session.get("user");
      if (!user) {
        console.log(`${req.id} unauthorized request`);
        return reply.status(401).send(new Error("Unauthorized"));
      }

      console.log(
        `${req.id} ${req.method} ${req.url} authenticated as ${user.id} (${user.username})`,
      );

      return web(req, reply, (body) => {
        if (req.method === "GET" && /^\/($|\?)/.test(req.url)) {
          const html = new TextDecoder().decode(body);
          const domain = opts.host.replace(/^http/, "ws") ?? ""; // TODO: Need to proxy ws
          const modules = opts.modules ?? ["pogly"];
          return Buffer.from(
            new TextEncoder().encode(
              html.replace(
                /<body>/,
                [
                  "<body>",
                  "<script>",
                  `window.localStorage.setItem("stdbToken", ${JSON.stringify(user.pogly)});`,
                  `window.localStorage.setItem("stdbConnectDomain", ${JSON.stringify(domain)});`,
                  `window.localStorage.setItem("stdbConnectModule", ${JSON.stringify(modules[0])});`,
                  `window.localStorage.setItem("nickname", ${JSON.stringify(user.username)});`,
                  `window.localStorage.setItem("poglyQuickSwap", ${JSON.stringify(JSON.stringify(modules.map((module) => ({ domain, module }))))});`,
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
};

export default proxy;

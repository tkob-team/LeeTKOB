package com.leetkob.backend.judge;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/** Narrow socket proxy exposing fixed sandbox operations instead of the Docker Engine API. */
public final class SandboxProxy {
  private static final int MIB = 1024 * 1024;
  private static final Pattern RUN = Pattern.compile("/run/([0-9]{4})/([0-9]{2,3})");
  private static final Pattern ID = Pattern.compile("[a-f0-9]{64}");
  private final Semaphore slots = new Semaphore(2);
  private static final Pattern NAME = Pattern.compile("leetkob-judge-[a-f0-9-]{36}");
  private final DockerSandbox sandbox;
  private final String scope;
  private final String image;

  private SandboxProxy(String image, String scope) {
    if (scope == null || !scope.matches("[a-z0-9][a-z0-9_-]{0,62}")) {
      throw new IllegalArgumentException("The sandbox proxy needs a valid deployment scope.");
    }
    this.scope = scope;
    this.image = image;
    sandbox = new DockerSandbox(image, null);
  }

  /** Runs inside the isolated proxy service. */
  public static void start() {
    try {
      var proxy =
          new SandboxProxy(
              System.getenv().getOrDefault("JUDGE_SANDBOX_IMAGE", DockerSandbox.DEFAULT_IMAGE),
              System.getenv("JUDGE_SANDBOX_SCOPE"));
      proxy.removeOrphans();
      String bind = System.getenv().getOrDefault("JUDGE_SANDBOX_PROXY_BIND", "127.0.0.1");
      int port = Integer.parseInt(System.getenv().getOrDefault("JUDGE_SANDBOX_PROXY_PORT", "8091"));
      var server = HttpServer.create(new InetSocketAddress(bind, port), 16);
      server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
      server.createContext("/", proxy::handle);
      server.start();
    } catch (IOException error) {
      throw new IllegalStateException("Could not start the sandbox proxy.", error);
    }
  }

  private void handle(HttpExchange exchange) throws IOException {
    try (exchange) {
      var path = exchange.getRequestURI().getRawPath();
      if ("GET".equals(exchange.getRequestMethod()) && "/health".equals(path)) {
        exchange.sendResponseHeaders(isDaemonReady() ? 204 : 503, -1);
        return;
      }
      if ("GET".equals(exchange.getRequestMethod()) && path.startsWith("/status/")) {
        String name = path.substring("/status/".length());
        if (!NAME.matcher(name).matches() || exchange.getRequestURI().getRawQuery() != null) {
          exchange.sendResponseHeaders(400, -1);
          return;
        }
        try {
          exchange.sendResponseHeaders(findContainers("^/" + name + "$").isEmpty() ? 404 : 204, -1);
        } catch (IOException error) {
          exchange.sendResponseHeaders(503, -1);
        }
        return;
      }
      if (!"POST".equals(exchange.getRequestMethod())
          || exchange.getRequestURI().getRawQuery() != null) {
        exchange.sendResponseHeaders(404, -1);
        return;
      }
      if (!slots.tryAcquire()) {
        exchange.sendResponseHeaders(503, -1);
        return;
      }
      DockerSandbox.Execution result;
      try {
        result = execute(exchange, path);
      } catch (IllegalArgumentException error) {
        exchange.sendResponseHeaders(400, -1);
        return;
      } catch (IllegalStateException error) {
        exchange.sendResponseHeaders(503, -1);
        return;
      } finally {
        slots.release();
      }
      exchange.getResponseHeaders().set("X-Sandbox-Outcome", result.outcome().name());
      exchange.getResponseHeaders().set("X-Sandbox-Container", result.containerName());
      exchange.sendResponseHeaders(200, result.stdout().length == 0 ? -1 : result.stdout().length);
      if (result.stdout().length > 0) {
        exchange.getResponseBody().write(result.stdout());
      }
    }
  }

  private DockerSandbox.Execution execute(HttpExchange exchange, String path) throws IOException {
    if ("/compile".equals(path)) {
      return sandbox.compile(new String(readBody(exchange, 65536), StandardCharsets.UTF_8));
    }
    var run = RUN.matcher(path);
    if (!run.matches()) {
      throw new IllegalArgumentException("Unknown operation.");
    }
    int cpu = Integer.parseInt(run.group(1));
    int memory = Integer.parseInt(run.group(2));
    if (cpu < 1000 || cpu > 5000 || memory < 64 || memory > 512) {
      throw new IllegalArgumentException("Sandbox limits are out of bounds.");
    }
    var frame = ByteBuffer.wrap(readBody(exchange, Integer.BYTES + 20 * MIB));
    if (frame.remaining() < Integer.BYTES) {
      throw new IllegalArgumentException("Missing program length.");
    }
    int length = frame.getInt();
    if (length < 1 || length > 16 * MIB || length > frame.remaining()) {
      throw new IllegalArgumentException("Invalid program length.");
    }
    byte[] program = new byte[length];
    frame.get(program);
    if (frame.remaining() > 4 * MIB) {
      throw new IllegalArgumentException("Test input is too large.");
    }
    return sandbox.run(program, StandardCharsets.UTF_8.decode(frame).toString(), cpu, memory);
  }

  private static byte[] readBody(HttpExchange exchange, int limit) throws IOException {
    byte[] body = exchange.getRequestBody().readNBytes(limit + 1);
    if (body.length == 0 || body.length > limit) {
      throw new IllegalArgumentException("Invalid request size.");
    }
    return body;
  }

  private void removeOrphans() throws IOException {
    for (String id : findContainers("^/leetkob-judge-")) {
      if (!ID.matcher(id).matches()) {
        throw new IOException("Invalid sandbox container ID.");
      }
      await(new ProcessBuilder("docker", "rm", "-f", id).start());
    }
  }

  private List<String> findContainers(String name) throws IOException {
    var listing =
        new ProcessBuilder(
                "docker",
                "ps",
                "-aq",
                "--no-trunc",
                "--filter",
                "label=org.leetkob.sandbox-scope=" + scope,
                "--filter",
                "name=" + name)
            .start();
    await(listing);
    try (var output = listing.getInputStream()) {
      return new String(output.readNBytes(65536), StandardCharsets.US_ASCII).lines().toList();
    }
  }

  private boolean isDaemonReady() {
    try {
      var probe =
          new ProcessBuilder("docker", "image", "inspect", "--format={{.Id}}", image)
              .redirectOutput(ProcessBuilder.Redirect.DISCARD)
              .redirectError(ProcessBuilder.Redirect.DISCARD)
              .start();
      await(probe, 2);
      return true;
    } catch (IOException error) {
      return false;
    }
  }

  private static void await(Process process) throws IOException {
    await(process, 10);
  }

  private static void await(Process process, long timeoutSeconds) throws IOException {
    try {
      if (!process.waitFor(timeoutSeconds, TimeUnit.SECONDS) || process.exitValue() != 0) {
        throw new IOException("Sandbox daemon operation failed.");
      }
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      throw new IOException("Sandbox daemon operation interrupted.", error);
    } finally {
      if (process.isAlive()) {
        process.destroyForcibly();
      }
    }
  }
}

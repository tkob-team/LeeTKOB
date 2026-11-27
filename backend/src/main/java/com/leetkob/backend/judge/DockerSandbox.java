package com.leetkob.backend.judge;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicLong;

/** Only trusted code constructs commands for the Docker CLI. Untrusted bytes travel over stdio. */
final class DockerSandbox {

  static final String DEFAULT_IMAGE = "leetkob-sandbox:pa3";
  private static final int MIB = 1024 * 1024;
  private static final int DOCKER_GRACE_MS = 10000;

  enum Outcome {
    OK,
    CPU,
    WALL,
    MEMORY,
    OUTPUT,
    PROGRAM_ERROR
  }

  record Execution(Outcome outcome, byte[] stdout, String containerName) {}

  private final String image;
  private final URI proxy;
  private final HttpClient client;

  DockerSandbox(String image) {
    this(image, System.getenv("JUDGE_SANDBOX_PROXY"));
  }

  DockerSandbox(String image, String proxyAddress) {
    if (image.isBlank() || image.startsWith("-")) {
      throw new IllegalArgumentException("A trusted local sandbox image is required.");
    }
    this.image = image;
    proxy = proxyAddress == null ? null : URI.create(proxyAddress);
    client =
        proxy == null
            ? null
            : HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
  }

  boolean isReady() {
    if (proxy == null) {
      return true;
    }
    var probe =
        HttpRequest.newBuilder(proxy.resolve("/health")).timeout(Duration.ofSeconds(3)).build();
    try {
      return client.send(probe, HttpResponse.BodyHandlers.discarding()).statusCode() == 204;
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      return false;
    } catch (IOException error) {
      return false;
    }
  }

  Execution compile(String source) {
    byte[] code = source.getBytes(StandardCharsets.UTF_8);
    if (proxy != null) {
      return call("/compile", code, 16 * MIB);
    }
    return execute(
        List.of("compile", Integer.toString(code.length)), 512, 10_000, 16 * MIB, List.of(code));
  }

  Execution run(byte[] program, String input, int cpuMs, int memoryMb) {
    byte[] stdin = input.getBytes(StandardCharsets.UTF_8);
    if (proxy != null) {
      byte[] payload =
          ByteBuffer.allocate(Integer.BYTES + program.length + stdin.length)
              .putInt(program.length)
              .put(program)
              .put(stdin)
              .array();
      return call("/run/" + cpuMs + "/" + memoryMb, payload, MIB);
    }
    return execute(
        List.of("run", Integer.toString(cpuMs), Integer.toString(program.length)),
        memoryMb,
        3 * cpuMs,
        MIB,
        List.of(program, stdin));
  }

  private Execution call(String path, byte[] body, int outputLimit) {
    var request =
        HttpRequest.newBuilder(proxy.resolve(path))
            .timeout(Duration.ofSeconds(45))
            .POST(HttpRequest.BodyPublishers.ofByteArray(body))
            .build();
    try {
      var response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
      try (var output = response.body()) {
        if (response.statusCode() != 200) {
          throw new IllegalStateException("Sandbox proxy rejected the operation.");
        }
        byte[] stdout = output.readNBytes(outputLimit + 1);
        if (stdout.length > outputLimit) {
          throw new IllegalStateException("Sandbox proxy response exceeded its output limit.");
        }
        return new Execution(
            Outcome.valueOf(response.headers().firstValue("X-Sandbox-Outcome").orElseThrow()),
            stdout,
            response.headers().firstValue("X-Sandbox-Container").orElseThrow());
      }
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException("Sandbox proxy call was interrupted.", error);
    } catch (IOException error) {
      throw new IllegalStateException("Sandbox proxy is unavailable.", error);
    }
  }

  boolean containerGone(String name) throws IOException, InterruptedException {
    if (proxy == null) {
      var inspection = new ProcessBuilder("docker", "inspect", name).start();
      return inspection.waitFor() != 0;
    }
    var request =
        HttpRequest.newBuilder(proxy.resolve("/status/" + name))
            .timeout(Duration.ofSeconds(15))
            .GET()
            .build();
    return client.send(request, HttpResponse.BodyHandlers.discarding()).statusCode() == 404;
  }

  private Execution execute(
      List<String> args, int memoryMb, int wallMs, int outputLimit, List<byte[]> input) {
    String name = "leetkob-judge-" + UUID.randomUUID();
    var labels = System.getenv("JUDGE_SANDBOX_SCOPE");
    var command =
        new ArrayList<>(
            List.of(
                "docker",
                "run",
                "--rm",
                "--pull=never",
                "--name",
                name,
                "--interactive",
                "--network=none",
                "--read-only",
                "--cap-drop=ALL",
                "--security-opt=no-new-privileges",
                "--user=65534:65534",
                "--ipc=none",
                "--cgroupns=private",
                "--ulimit=core=0:0",
                "--cpus=1",
                "--pids-limit=16",
                "--memory=" + memoryMb + "m",
                "--memory-swap=" + memoryMb + "m",
                "--log-driver=none",
                "--tmpfs=/work:rw,exec,nosuid,nodev,size=32m,mode=1777",
                image));
    if (labels != null) {
      command.addAll(2, List.of("--label", "org.leetkob.sandbox-scope=" + labels));
    }
    command.addAll(args);
    Process process = null;
    var io = Executors.newVirtualThreadPerTaskExecutor();
    try {
      process = new ProcessBuilder(command).start();
      final Process attached = process;
      var written = io.submit(() -> writeInput(attached, input));
      var observed = new AtomicLong();
      var stdout =
          io.submit(() -> readOutput(attached.getInputStream(), observed, outputLimit, true));
      var stderr =
          io.submit(() -> readOutput(attached.getErrorStream(), observed, outputLimit, false));
      long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(wallMs + DOCKER_GRACE_MS);
      while (!process.waitFor(20, TimeUnit.MILLISECONDS)) {
        if (observed.get() > outputLimit) {
          return new Execution(Outcome.OUTPUT, new byte[0], name);
        }
        if (System.nanoTime() >= deadline) {
          throw new IllegalStateException("Docker sandbox exceeded its cleanup deadline.");
        }
      }
      byte[] output = stdout.get(DOCKER_GRACE_MS, TimeUnit.MILLISECONDS);
      stderr.get(DOCKER_GRACE_MS, TimeUnit.MILLISECONDS);
      written.get(DOCKER_GRACE_MS, TimeUnit.MILLISECONDS);
      Outcome outcome = observed.get() > outputLimit ? Outcome.OUTPUT : decode(process.exitValue());
      return new Execution(outcome, output, name);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException("Docker sandbox was interrupted.", e);
    } catch (IOException | ExecutionException | TimeoutException e) {
      throw new IllegalStateException("Docker sandbox did not finish normally.", e);
    } finally {
      try {
        if (process != null && process.isAlive()) {
          // Stop the Linux container even when the client timed out or stopped reading output.
          try {
            remove(name);
          } finally {
            process.destroyForcibly();
          }
        }
      } finally {
        io.shutdownNow();
      }
    }
  }

  private static void writeInput(Process attached, List<byte[]> input) {
    try (var stdin = attached.getOutputStream()) {
      for (byte[] bytes : input) {
        stdin.write(bytes);
      }
    } catch (IOException ignored) {
      // A submission may exit before it reads all the input. Its exit determines the outcome.
    }
  }

  private static byte[] readOutput(InputStream stream, AtomicLong observed, int limit, boolean keep)
      throws IOException {
    try (stream;
        var captured = new ByteArrayOutputStream()) {
      byte[] buffer = new byte[8192];
      int length;
      while ((length = stream.read(buffer)) != -1) {
        if (observed.addAndGet(length) > limit) {
          break;
        }
        if (keep) {
          captured.write(buffer, 0, length);
        }
      }
      return captured.toByteArray();
    }
  }

  private static Outcome decode(int exitCode) {
    return switch (exitCode) {
      case 0 -> Outcome.OK;
      case 10 -> Outcome.CPU;
      case 11 -> Outcome.WALL;
      case 12 -> Outcome.MEMORY;
      case 13 -> Outcome.PROGRAM_ERROR;
      default -> throw new IllegalStateException("Sandbox infrastructure exit code: " + exitCode);
    };
  }

  private static void remove(String name) {
    // Preserve an interrupt for the worker after the cleanup request has completed.
    boolean interrupted = Thread.interrupted();
    try {
      long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(DOCKER_GRACE_MS);
      do {
        var cleanup =
            new ProcessBuilder("docker", "rm", "-f", name).redirectErrorStream(true).start();
        if (!cleanup.waitFor(DOCKER_GRACE_MS, TimeUnit.MILLISECONDS)) {
          cleanup.destroyForcibly();
          break;
        }
        String response;
        try (var output = cleanup.getInputStream()) {
          response = new String(output.readNBytes(4096), StandardCharsets.UTF_8);
        }
        if (cleanup.exitValue() == 0 || response.contains("No such container: " + name)) {
          return;
        }
        if (!response.contains("is already in progress")) {
          break;
        }
        // Docker may already be performing --rm after the sandbox exited.
        Thread.sleep(50);
      } while (System.nanoTime() < deadline);
      throw new IllegalStateException("Could not remove sandbox container " + name);
    } catch (InterruptedException e) {
      interrupted = true;
      throw new IllegalStateException("Sandbox cleanup was interrupted.", e);
    } catch (IOException e) {
      throw new IllegalStateException("Could not run sandbox cleanup.", e);
    } finally {
      if (interrupted) {
        Thread.currentThread().interrupt();
      }
    }
  }
}

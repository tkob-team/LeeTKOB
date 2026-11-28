package com.leetkob.backend;

import com.leetkob.backend.judge.JudgeWorkerApplication;
import com.leetkob.backend.judge.SandboxProxy;
import com.leetkob.backend.seed.SeedApplication;
import java.util.Arrays;
import java.util.Map;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/** Entry point for the LeetKOB backend. */
@SpringBootApplication
public class BackendApplication {

  /**
   * Starts the application.
   *
   * @param args command-line arguments
   */
  public static void main(String[] args) {
    if (args.length > 0 && "sandbox-proxy".equals(args[0])) {
      SandboxProxy.start();
    } else if (args.length > 0 && "judge-worker".equals(args[0])) {
      JudgeWorkerApplication.start(Arrays.copyOfRange(args, 1, args.length));
    } else if (args.length > 0 && "seed-load".equals(args[0])) {
      SeedApplication.startLoad();
    } else if (args.length > 0 && "seed".equals(args[0])) {
      SeedApplication.start(Arrays.copyOfRange(args, 1, args.length));
    } else {
      var app = new SpringApplication(BackendApplication.class);
      app.setDefaultProperties(Map.of("logging.structured.json.add.service", "api"));
      app.run(args);
    }
  }
}
